package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.llm.EmbeddingClient;
import com.learnmate.learnmateai.llm.OcrSpaceClient;
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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

@Service
public class IngestionService {

    private static final int CHUNK_SIZE_WORDS = 250;
    private static final int CHUNK_OVERLAP_WORDS = 50;

    // Below this many characters of native (non-OCR) text, we assume the
    // PDF is scanned/image-based and fall back to OCR.space instead.
    private static final int MIN_NATIVE_TEXT_CHARS = 300;

    private final DocumentChunkRepository repository;
    private final EmbeddingClient embeddingClient;
    private final IngestionStatusService statusService;
    private final OcrSpaceClient ocrSpaceClient;

    public IngestionService(DocumentChunkRepository repository,
                            EmbeddingClient embeddingClient,
                            IngestionStatusService statusService,
                            OcrSpaceClient ocrSpaceClient) {
        this.repository = repository;
        this.embeddingClient = embeddingClient;
        this.statusService = statusService;
        this.ocrSpaceClient = ocrSpaceClient;
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
                text = extractTextWithOcrFallback(fileBytes, sourceId);

                System.out.println("[Ingestion] Raw extracted length for " + sourceId + ": " + text.length());
                if (text.length() < 500) {
                    System.out.println("[Ingestion] WARNING: very little text extracted from " + sourceId);
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

            List<String> pieces = new ArrayList<>();
            int step = CHUNK_SIZE_WORDS - CHUNK_OVERLAP_WORDS;
            for (int start = 0; start < words.length; start += step) {
                int end = Math.min(start + CHUNK_SIZE_WORDS, words.length);
                String piece = String.join(" ", Arrays.copyOfRange(words, start, end)).trim();

                if (!piece.isEmpty()) {
                    pieces.add(piece);
                }

                if (end == words.length) break;
            }

            // Embed all chunks in batched requests rather than one HTTP call
            // per chunk. Large documents can produce hundreds of chunks, and
            // calling the embeddings API once per chunk in a loop blew
            // through Voyage's per-minute rate limit and failed partway
            // through with 429 Too Many Requests.
            List<float[]> vectors = embeddingClient.embedBatch(pieces);

            for (int i = 0; i < pieces.size(); i++) {
                DocumentChunk chunk = new DocumentChunk();
                chunk.setSourceId(sourceId);
                chunk.setSubject(subject);
                chunk.setContent(pieces.get(i));
                chunk.setOwnerUsername(ownerUsername);
                chunk.setEmbedding(new PGvector(vectors.get(i)));
                chunks.add(chunk);
            }

            System.out.println("[Ingestion] Produced " + chunks.size() + " chunks for " + sourceId);

            repository.saveAll(chunks);
            statusService.markDone(ownerUsername, sourceId, chunks.size());

        } catch (Exception e) {
            System.out.println("[Ingestion] FAILED for " + sourceId + ": " + e.getMessage());
            statusService.markFailed(ownerUsername, sourceId, e.getMessage());
        }
    }

    /**
     * Step 1: try Tika's native text layer only (no OCR, no external calls,
     * near-instant, works for any normal text-based PDF).
     * Step 2: only if that yields too little text (scanned/image-based PDF),
     * fall back to OCR.space's API so we never run Tesseract locally again.
     */
    private String extractTextWithOcrFallback(byte[] fileBytes, String sourceId) throws Exception {

        PDFParserConfig pdfConfig = new PDFParserConfig();
        pdfConfig.setOcrStrategy(PDFParserConfig.OCR_STRATEGY.NO_OCR);

        ParseContext context = new ParseContext();
        context.set(PDFParserConfig.class, pdfConfig);

        AutoDetectParser parser = new AutoDetectParser();
        Metadata metadata = new Metadata();
        BodyContentHandler handler = new BodyContentHandler(-1);

        parser.parse(new ByteArrayInputStream(fileBytes), handler, metadata, context);
        String nativeText = handler.toString().trim();

        if (nativeText.length() >= MIN_NATIVE_TEXT_CHARS) {
            System.out.println("[Ingestion] Native text layer found for " + sourceId
                    + " (" + nativeText.length() + " chars) — skipping OCR.space call");
            return nativeText;
        }

        System.out.println("[Ingestion] Little/no native text for " + sourceId
                + " (" + nativeText.length() + " chars) — falling back to OCR.space");

        String ocrText = ocrSpaceClient.extractText(fileBytes, sourceId);

        if (ocrText.isBlank()) {
            throw new IOException("No text could be extracted from the document (native or OCR).");
        }

        return ocrText;
    }
}