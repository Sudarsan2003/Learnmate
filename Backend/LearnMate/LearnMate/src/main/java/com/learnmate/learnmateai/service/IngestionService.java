package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.llm.EmbeddingClient;
import com.learnmate.learnmateai.model.DocumentChunk;
import com.learnmate.learnmateai.repository.DocumentChunkRepository;
import com.pgvector.PGvector;
import org.apache.tika.metadata.Metadata;
import org.apache.tika.parser.AutoDetectParser;
import org.apache.tika.parser.ParseContext;
import org.apache.tika.sax.BodyContentHandler;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@Service
public class IngestionService {

    private static final int CHUNK_SIZE_WORDS = 250;
    private static final int CHUNK_OVERLAP_WORDS = 50;

    private final DocumentChunkRepository repository;
    private final EmbeddingClient embeddingClient;
    private final IngestionStatusService statusService;

    public IngestionService(
            DocumentChunkRepository repository,
            EmbeddingClient embeddingClient,
            IngestionStatusService statusService) {

        this.repository = repository;
        this.embeddingClient = embeddingClient;
        this.statusService = statusService;
    }

    /**
     * Called synchronously from the controller.
     * Reads the uploaded file into memory and starts
     * the actual parsing/embedding process asynchronously.
     */
    public String startIngestion(
            MultipartFile file,
            String subject,
            String standard,
            String institution,
            String ownerUsername) throws IOException {

        if (institution == null || institution.isBlank()) {
            throw new IllegalArgumentException("institution is required");
        }

        String fileName = file.getOriginalFilename();

        if (fileName == null || fileName.isBlank()) {
            throw new IllegalArgumentException("File must have a name");
        }

        if (standard == null || standard.isBlank()) {
            throw new IllegalArgumentException(
                    "standard is required (e.g. \"1\" through \"10\")"
            );
        }

        /*
         * Generate a unique source ID based on:
         * institution + standard + filename
         */
        String sourceId = buildSourceId(
                institution,
                standard,
                fileName
        );

        byte[] fileBytes = file.getBytes();

        statusService.markProcessing(
                ownerUsername,
                sourceId
        );

        ingestAsync(
                fileBytes,
                sourceId,
                fileName,
                subject,
                standard,
                institution,
                ownerUsername
        );

        return sourceId;
    }

    private String buildSourceId(
            String institution,
            String standard,
            String fileName) {

        String key =
                institution.trim()
                        + '\u0000'
                        + standard.trim()
                        + '\u0000'
                        + fileName;

        return UUID.nameUUIDFromBytes(
                key.getBytes(StandardCharsets.UTF_8)
        ).toString();
    }

    /**
     * Runs document parsing and embedding in the background.
     *
     * OCR has intentionally been removed.
     *
     * Supported:
     * - Text PDFs
     * - DOCX
     * - TXT
     * - Other formats supported by Apache Tika
     *
     * Scanned/image-only PDFs will not produce text because
     * there is no OCR fallback.
     */
    @Async("ingestionExecutor")
    void ingestAsync(
            byte[] fileBytes,
            String sourceId,
            String fileName,
            String subject,
            String standard,
            String institution,
            String ownerUsername) {

        try {

            // ---------------------------------------------------------
            // 1. Extract text using Apache Tika
            // ---------------------------------------------------------

            String text;

            try {

                text = extractText(fileBytes, fileName);

                System.out.println(
                        "[Ingestion] Raw extracted length for "
                                + fileName
                                + ": "
                                + text.length()
                );

                if (text.length() < 500) {

                    System.out.println(
                            "[Ingestion] WARNING: very little text "
                                    + "extracted from "
                                    + fileName
                    );
                }

                // -----------------------------------------------------
                // Clean extracted text
                // -----------------------------------------------------

                text = text.replaceAll(
                        "\\.{3,}\\s*\\d{1,4}\\b",
                        ""
                );

                text = text.replaceAll(
                        "\\.\\s(?:\\.\\s){2,}\\d{1,4}\\b",
                        ""
                );

                text = text.replaceAll(
                        "(?i)\\bpage\\s+\\d{1,4}\\b",
                        ""
                );

                text = text.replaceAll(
                        "(?m)^\\d+\\s*$",
                        ""
                );

                text = text.replaceAll(
                        "\\s{2,}",
                        " "
                ).trim();

                System.out.println(
                        "[Ingestion] Cleaned length for "
                                + fileName
                                + ": "
                                + text.length()
                );

            } catch (Exception e) {

                throw new IOException(
                        "Failed to parse document: "
                                + e.getMessage(),
                        e
                );
            }

            // ---------------------------------------------------------
            // 2. Delete previous chunks for this source
            // ---------------------------------------------------------

            repository.deleteBySourceId(sourceId);

            // ---------------------------------------------------------
            // 3. Split text into words
            // ---------------------------------------------------------

            List<DocumentChunk> chunks = new ArrayList<>();

            String[] words = text.split("\\s+");

            if (words.length == 0
                    || (words.length == 1 && words[0].isBlank())) {

                System.out.println(
                        "[Ingestion] WARNING: no words to chunk for "
                                + fileName
                );

                repository.saveAll(chunks);

                statusService.markDone(
                        ownerUsername,
                        sourceId,
                        0
                );

                return;
            }

            // ---------------------------------------------------------
            // 4. Create overlapping chunks
            // ---------------------------------------------------------

            List<String> pieces = new ArrayList<>();

            int step =
                    CHUNK_SIZE_WORDS
                            - CHUNK_OVERLAP_WORDS;

            for (
                    int start = 0;
                    start < words.length;
                    start += step
            ) {

                int end =
                        Math.min(
                                start + CHUNK_SIZE_WORDS,
                                words.length
                        );

                String piece =
                        String.join(
                                " ",
                                Arrays.copyOfRange(
                                        words,
                                        start,
                                        end
                                )
                        ).trim();

                if (!piece.isEmpty()) {
                    pieces.add(piece);
                }

                if (end == words.length) {
                    break;
                }
            }

            System.out.println(
                    "[Ingestion] Created "
                            + pieces.size()
                            + " text chunks for "
                            + fileName
            );

            // ---------------------------------------------------------
            // 5. Generate embeddings
            // ---------------------------------------------------------

            List<float[]> vectors =
                    embeddingClient.embedBatch(pieces);

            if (vectors == null
                    || vectors.size() != pieces.size()) {

                throw new IOException(
                        "Embedding count does not match "
                                + "chunk count for "
                                + fileName
                );
            }

            // ---------------------------------------------------------
            // 6. Create DocumentChunk entities
            // ---------------------------------------------------------

            for (int i = 0; i < pieces.size(); i++) {

                DocumentChunk chunk =
                        new DocumentChunk();

                chunk.setSourceId(sourceId);

                chunk.setFileName(fileName);

                chunk.setSubject(subject);

                chunk.setStandard(standard);

                chunk.setInstitution(institution);

                chunk.setContent(
                        pieces.get(i)
                );

                chunk.setOwnerUsername(
                        ownerUsername
                );

                /*
                 * Store embedding as PostgreSQL pgvector.
                 */
                chunk.setEmbedding(
                        new PGvector(vectors.get(i))
                );

                chunks.add(chunk);
            }

            // ---------------------------------------------------------
            // 7. Save chunks to PostgreSQL
            // ---------------------------------------------------------

            System.out.println(
                    "[Ingestion] Produced "
                            + chunks.size()
                            + " chunks for "
                            + fileName
            );

            repository.saveAll(chunks);

            // ---------------------------------------------------------
            // 8. Mark ingestion as completed
            // ---------------------------------------------------------

            statusService.markDone(
                    ownerUsername,
                    sourceId,
                    chunks.size()
            );

        } catch (Exception e) {

            System.out.println(
                    "[Ingestion] FAILED for "
                            + fileName
                            + ": "
                            + e.getMessage()
            );

            statusService.markFailed(
                    ownerUsername,
                    sourceId,
                    e.getMessage()
            );
        }
    }

    /**
     * Extract text using Apache Tika only.
     *
     * IMPORTANT:
     * There is NO OCR here.
     *
     * If the PDF is scanned/image-only, Tika will not magically
     * read the text from the image.
     */
    private String extractText(
            byte[] fileBytes,
            String fileName) throws Exception {

        AutoDetectParser parser =
                new AutoDetectParser();

        Metadata metadata =
                new Metadata();

        BodyContentHandler handler =
                new BodyContentHandler(-1);

        ParseContext context =
                new ParseContext();

        parser.parse(
                new ByteArrayInputStream(fileBytes),
                handler,
                metadata,
                context
        );

        String text =
                handler.toString().trim();

        if (text.isBlank()) {

            throw new IOException(
                    "No text could be extracted from "
                            + fileName
                            + ". The document may be "
                            + "scanned/image-only or contain "
                            + "no readable text."
            );
        }

        return text;
    }
}