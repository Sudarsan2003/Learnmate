package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.llm.EmbeddingClient;
import com.learnmate.learnmateai.model.DocumentChunk;
import com.learnmate.learnmateai.repository.DocumentChunkRepository;
import com.pgvector.PGvector;
import org.apache.tika.io.TikaInputStream;
import org.apache.tika.metadata.Metadata;
import org.apache.tika.parser.AutoDetectParser;
import org.apache.tika.parser.ParseContext;
import org.apache.tika.sax.BodyContentHandler;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;

@Service
public class IngestionService {

    private static final int CHUNK_SIZE_WORDS = 250;
    private static final int CHUNK_OVERLAP_WORDS = 50;

    private final DocumentChunkRepository repository;
    private final EmbeddingClient embeddingClient;
    private final IngestionStatusService statusService;
    private final Executor ingestionExecutor;

    public IngestionService(
            DocumentChunkRepository repository,
            EmbeddingClient embeddingClient,
            IngestionStatusService statusService,
            @Qualifier("ingestionExecutor") Executor ingestionExecutor) {

        this.repository = repository;
        this.embeddingClient = embeddingClient;
        this.statusService = statusService;
        this.ingestionExecutor = ingestionExecutor;
    }

    /**
     * Called synchronously from the controller.
     * Copies the upload to a temp file and hands the parsing/embedding to the
     * ingestion thread pool, so the request returns straight away and the
     * upload screen polls /status for progress.
     *
     * (This used to call an @Async method on this same class, which Spring
     * ignores, so a big textbook kept the request open until it was fully
     * embedded and the browser or proxy could give up first. It also held
     * the whole file in memory; a temp file keeps 150 MB books off the heap.)
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

        String suffix = fileName.contains(".") ? fileName.substring(fileName.lastIndexOf('.')) : "";
        Path upload = Files.createTempFile("learnmate-upload-", suffix.length() <= 10 ? suffix : "");
        try {
            file.transferTo(upload);
        } catch (IOException | RuntimeException e) {
            Files.deleteIfExists(upload);
            throw e;
        }

        statusService.markProcessing(
                ownerUsername,
                sourceId
        );

        try {
            ingestionExecutor.execute(() -> {
                try {
                    ingest(upload, sourceId, fileName, subject, standard, institution, ownerUsername);
                } finally {
                    try {
                        Files.deleteIfExists(upload);
                    } catch (IOException ignored) {
                        // the OS clears its temp folder eventually
                    }
                }
            });
        } catch (RejectedExecutionException e) { // includes Spring's TaskRejectedException
            Files.deleteIfExists(upload);
            statusService.markFailed(ownerUsername, sourceId, "Too many uploads at once. Please try again in a few minutes.");
            throw new IllegalArgumentException("Too many uploads are being processed right now. Please try again in a few minutes.");
        }

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
     * there is no OCR fallback. Pictures inside a PDF are skipped, so a
     * textbook can be uploaded as it is, without stripping them first.
     */
    void ingest(
            Path upload,
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

                statusService.markProgress(ownerUsername, sourceId, "Reading the text from the file...");
                text = extractText(upload, fileName);

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

                // Tidy spacing but keep line breaks: the chunker uses them to
                // find paragraphs and chapter headings.
                text = text.replaceAll("[ \\t\\u00A0]+", " ")
                        .replaceAll(" ?\\R ?", "\n")
                        .replaceAll("\\n{3,}", "\n\n")
                        .trim();

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
            // 2. Split into pieces at sentence boundaries, each starting
            //    with the book and chapter it came from
            // ---------------------------------------------------------

            List<DocumentChunk> chunks = new ArrayList<>();

            List<TextChunker.Chunk> parts =
                    TextChunker.chunk(text, CHUNK_SIZE_WORDS, CHUNK_OVERLAP_WORDS);

            if (parts.isEmpty()) {
                throw new IOException("No text could be found in " + fileName + ".");
            }

            // Drop pieces whose text came out as symbol soup (pages typed in a
            // legacy non-Unicode font). They can't be searched or quizzed on, and
            // bilingual books often have them on every other page.
            int before = parts.size();
            parts.removeIf(p -> !TextQuality.isReadable(p.text()));

            // The book/chapter line goes into the stored and embedded text, so a
            // search like "chapter 3 light" finds the piece and the tutor knows
            // where it came from.
            String title = bookTitle(fileName);
            List<String> pieces = parts.stream()
                    .map(p -> (p.heading() == null ? title : title + " | " + p.heading()) + "\n" + p.text())
                    .toList();

            System.out.println(
                    "[Ingestion] Created "
                            + pieces.size()
                            + " text chunks for "
                            + fileName
            );

            if (pieces.isEmpty()) {
                throw new IOException(
                        "The text in " + fileName + " could not be read. It looks like "
                                + "it was typed in an older non-Unicode font. Please upload "
                                + "a version with selectable Unicode text."
                );
            }

            if (pieces.size() < before) {
                System.out.println(
                        "[Ingestion] Skipped "
                                + (before - pieces.size())
                                + " unreadable chunks in "
                                + fileName
                );
            }

            // ---------------------------------------------------------
            // 3. Generate embeddings
            // ---------------------------------------------------------

            statusService.markProgress(ownerUsername, sourceId,
                    "Preparing " + pieces.size() + " sections for search...");

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
            // 4. Create DocumentChunk entities
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
            // 5. Replace any earlier upload of this file, only now that the
            //    new version is ready (a failed re-upload keeps the old one)
            // ---------------------------------------------------------

            repository.deleteBySourceId(sourceId);

            System.out.println(
                    "[Ingestion] Produced "
                            + chunks.size()
                            + " chunks for "
                            + fileName
            );

            repository.saveAll(chunks);

            // ---------------------------------------------------------
            // 6. Mark ingestion as completed
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

            // Our own IOExceptions explain the problem in plain words; anything
            // else (e.g. the embedding service being down) is a technical error
            // the teacher can't act on except by retrying.
            statusService.markFailed(
                    ownerUsername,
                    sourceId,
                    e instanceof IOException
                            ? e.getMessage()
                            : "Something went wrong while preparing this file for search. Please try again in a few minutes."
            );
        }
    }

    /** "Class8_Science_Ch4.pdf" -> "Class8 Science Ch4". */
    public static String bookTitle(String fileName) {
        return fileName.replaceAll("\\.[A-Za-z0-9]{1,5}$", "").replace('_', ' ').trim();
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
            Path upload,
            String fileName) throws Exception {

        AutoDetectParser parser =
                new AutoDetectParser();

        Metadata metadata =
                new Metadata();

        BodyContentHandler handler =
                new BodyContentHandler(-1);

        ParseContext context =
                new ParseContext();

        // Parsing from the file lets PDFBox read pages as it goes instead of
        // loading the whole book into memory.
        try (TikaInputStream in = TikaInputStream.get(upload)) {
            parser.parse(
                    in,
                    handler,
                    metadata,
                    context
            );
        }

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