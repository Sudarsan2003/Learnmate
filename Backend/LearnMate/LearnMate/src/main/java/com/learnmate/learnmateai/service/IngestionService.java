package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.llm.EmbeddingClient;
import com.learnmate.learnmateai.model.DocumentChunk;
import com.learnmate.learnmateai.repository.DocumentChunkRepository;
import com.pgvector.PGvector;
import org.apache.tika.metadata.Metadata;
import org.apache.tika.parser.AutoDetectParser;
import org.apache.tika.parser.ParseContext;
import org.apache.tika.parser.pdf.PDFParserConfig;
import org.apache.tika.sax.BodyContentHandler;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.apache.tika.parser.ocr.TesseractOCRConfig;

@Service
public class IngestionService {

    private static final int CHUNK_SIZE_WORDS = 250;
    private static final int CHUNK_OVERLAP_WORDS = 50;

    private final DocumentChunkRepository repository;
    private final EmbeddingClient embeddingClient;
    private final IngestionStatusService statusService;

    public IngestionService(DocumentChunkRepository repository,
                            EmbeddingClient embeddingClient,
                            IngestionStatusService statusService) {
        this.repository = repository;
        this.embeddingClient = embeddingClient;
        this.statusService = statusService;
    }

    /**
     * Called synchronously from the controller. Does the minimum needed
     * before the HTTP response can return: validate the filename and read
     * the file into memory (MultipartFile's underlying stream/temp file
     * won't survive past the request, so we must copy the bytes now).
     * The actual parsing/OCR/embedding happens in ingestAsync().
     */
    public String startIngestion(MultipartFile file, String subject, String ownerUsername) throws IOException {
        String sourceId = file.getOriginalFilename();
        if (sourceId == null || sourceId.isBlank()) {
            throw new IllegalArgumentException("File must have a name");
        }

        byte[] fileBytes = file.getBytes();

        statusService.markProcessing(ownerUsername, sourceId);
        ingestAsync(fileBytes, sourceId, subject, ownerUsername);

        return sourceId;
    }

    @Async("ingestionExecutor")
    void ingestAsync(byte[] fileBytes, String sourceId, String subject, String ownerUsername) {
        try {
            String text;
            try {
                text = extractTextWithOcrFallback(new ByteArrayInputStream(fileBytes));

                System.out.println("[Ingestion] Raw extracted length for " + sourceId + ": " + text.length());
                if (text.length() < 500) {
                    System.out.println("[Ingestion] WARNING: very little text extracted from " + sourceId
                            + " — check that Tesseract is installed and on PATH.");
                }

                text = text.replaceAll("(?m)^.*\\.{3,}\\s*\\d+\\s*$", "");
                text = text.replaceAll("(?m)^.*\\t\\d+\\s*$", "");
                text = text.replaceAll("(?m)^\\d+\\s*$", "");
                text = text.replaceAll("(?i)Page \\d+", "");
                text = text.replaceAll("\\s{2,}", " ").trim();

                System.out.println("[Ingestion] Cleaned length for " + sourceId + ": " + text.length());
            } catch (Exception e) {
                throw new IOException("Failed to parse document: " + e.getMessage(), e);
            }

            repository.deleteBySourceIdAndOwnerUsername(sourceId, ownerUsername);

            List<DocumentChunk> chunks = new ArrayList<>();
            String[] words = text.split("\\s+");

            if (words.length == 0 || (words.length == 1 && words[0].isBlank())) {
                System.out.println("[Ingestion] WARNING: no words to chunk for " + sourceId);
                repository.saveAll(chunks);
                statusService.markDone(ownerUsername, sourceId, 0);
                return;
            }

            int step = CHUNK_SIZE_WORDS - CHUNK_OVERLAP_WORDS;
            for (int start = 0; start < words.length; start += step) {
                int end = Math.min(start + CHUNK_SIZE_WORDS, words.length);
                String piece = String.join(" ", Arrays.copyOfRange(words, start, end)).trim();

                if (!piece.isEmpty()) {
                    DocumentChunk chunk = new DocumentChunk();
                    chunk.setSourceId(sourceId);
                    chunk.setSubject(subject);
                    chunk.setContent(piece);
                    chunk.setOwnerUsername(ownerUsername);

                    float[] vector = embeddingClient.embed(piece);
                    chunk.setEmbedding(new PGvector(vector));

                    chunks.add(chunk);
                }

                if (end == words.length) break;
            }

            System.out.println("[Ingestion] Produced " + chunks.size() + " chunks for " + sourceId);

            repository.saveAll(chunks);
            statusService.markDone(ownerUsername, sourceId, chunks.size());

        } catch (Exception e) {
            System.out.println("[Ingestion] FAILED for " + sourceId + ": " + e.getMessage());
            statusService.markFailed(ownerUsername, sourceId, e.getMessage());
        }
    }

    private String extractTextWithOcrFallback(InputStream stream) throws Exception {

        PDFParserConfig pdfConfig = new PDFParserConfig();

        // AUTO: use the existing text layer when present, and only fall back to
        // Tesseract OCR for pages that don't have one (e.g. scanned images).
        pdfConfig.setOcrStrategy(PDFParserConfig.OCR_STRATEGY.AUTO);

        TesseractOCRConfig tesseractConfig = new TesseractOCRConfig();
        tesseractConfig.setLanguage("eng+hin+tel");

        ParseContext context = new ParseContext();
        context.set(PDFParserConfig.class, pdfConfig);
        context.set(TesseractOCRConfig.class, tesseractConfig);

        AutoDetectParser parser = new AutoDetectParser();

        Metadata metadata = new Metadata();
        BodyContentHandler handler = new BodyContentHandler(-1);

        parser.parse(stream, handler, metadata, context);

        String text = handler.toString().trim();

        if (text.isBlank()) {
            throw new IOException("No text could be extracted from the document.");
        }

        return text;
    }
}