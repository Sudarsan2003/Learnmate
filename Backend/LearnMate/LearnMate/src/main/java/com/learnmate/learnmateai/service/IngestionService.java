package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.llm.EmbeddingClient;
import com.learnmate.learnmateai.llm.OcrSpaceClient;
import com.learnmate.learnmateai.model.DocumentChunk;
import com.learnmate.learnmateai.repository.DocumentChunkRepository;
import com.pgvector.PGvector;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.tika.metadata.Metadata;
import org.apache.tika.parser.AutoDetectParser;
import org.apache.tika.parser.ParseContext;
import org.apache.tika.parser.pdf.PDFParserConfig;
import org.apache.tika.sax.BodyContentHandler;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;
import java.util.UUID;

@Service
public class IngestionService {

    private static final int CHUNK_SIZE_WORDS = 250;
    private static final int CHUNK_OVERLAP_WORDS = 50;
    private static final int MIN_NATIVE_TEXT_CHARS = 300;

    // OCR.space's free tier rejects any single request over 1MB with a 413.
    // Leave some headroom under the actual cap for multipart overhead.
    private static final long OCR_SPACE_MAX_BYTES = 950_000;
    // Tried in order per page until the rendered JPEG fits under the cap.
    private static final int[] RENDER_DPI_STEPS = {150, 110, 85};
    private static final float[] JPEG_QUALITY_STEPS = {0.7f, 0.5f, 0.35f};

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
     * the file into memory. The actual parsing/OCR/embedding happens in
     * ingestAsync().
     */
    public String startIngestion(MultipartFile file, String subject, String standard, String institution, String ownerUsername) throws IOException {
        if (institution == null || institution.isBlank()) {
            throw new IllegalArgumentException("institution is required");
        }

        String fileName = file.getOriginalFilename();
        if (fileName == null || fileName.isBlank()) {
            throw new IllegalArgumentException("File must have a name");
        }
        if (standard == null || standard.isBlank()) {
            throw new IllegalArgumentException("standard is required (e.g. \"1\" through \"10\")");
        }

        // sourceId used to just be the filename, which meant two different
        // schools (or two different classes at the same school) uploading a
        // file with the same name collided on the same id — deleting one
        // silently deleted the other, anywhere in the system. Hashing
        // institution+standard+filename together scopes the id to that
        // exact folder: identical filenames in different folders now get
        // different ids, while re-uploading the *same* file into the *same*
        // folder still produces the same id, so the existing "re-uploading
        // a source replaces its old chunks" behavior is unchanged.
        String sourceId = buildSourceId(institution, standard, fileName);

        byte[] fileBytes = file.getBytes();

        statusService.markProcessing(ownerUsername, sourceId);
        ingestAsync(fileBytes, sourceId, fileName, subject, standard, institution, ownerUsername);

        return sourceId;
    }

    private String buildSourceId(String institution, String standard, String fileName) {
        String key = institution.trim() + '\u0000' + standard.trim() + '\u0000' + fileName;
        return UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8)).toString();
    }

    @Async("ingestionExecutor")
    void ingestAsync(byte[] fileBytes, String sourceId, String fileName, String subject, String standard, String institution, String ownerUsername) {
        try {
            String text;
            try {
                text = extractTextWithOcrFallback(fileBytes, fileName);

                System.out.println("[Ingestion] Raw extracted length for " + fileName + ": " + text.length());
                if (text.length() < 500) {
                    System.out.println("[Ingestion] WARNING: very little text extracted from " + fileName);
                }

                text = text.replaceAll("\\.{3,}\\s*\\d{1,4}\\b", "");
                text = text.replaceAll("\\.\\s(?:\\.\\s){2,}\\d{1,4}\\b", "");
                text = text.replaceAll("(?i)\\bpage\\s+\\d{1,4}\\b", "");
                text = text.replaceAll("(?m)^\\d+\\s*$", "");
                text = text.replaceAll("\\s{2,}", " ").trim();

                System.out.println("[Ingestion] Cleaned length for " + fileName + ": " + text.length());
            } catch (Exception e) {
                throw new IOException("Failed to parse document: " + e.getMessage(), e);
            }

            // Now scoped implicitly: sourceId already encodes institution+
            // standard+filename, so this only ever matches chunks from this
            // exact folder's prior version of this exact file.
            repository.deleteBySourceId(sourceId);

            List<DocumentChunk> chunks = new ArrayList<>();
            String[] words = text.split("\\s+");

            if (words.length == 0 || (words.length == 1 && words[0].isBlank())) {
                System.out.println("[Ingestion] WARNING: no words to chunk for " + fileName);
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

            List<float[]> vectors = embeddingClient.embedBatch(pieces);

            for (int i = 0; i < pieces.size(); i++) {
                DocumentChunk chunk = new DocumentChunk();
                chunk.setSourceId(sourceId);
                chunk.setFileName(fileName);
                chunk.setSubject(subject);
                chunk.setStandard(standard);
                chunk.setInstitution(institution);
                chunk.setContent(pieces.get(i));
                chunk.setOwnerUsername(ownerUsername);
                chunk.setEmbedding(new PGvector(vectors.get(i)));
                chunks.add(chunk);
            }

            System.out.println("[Ingestion] Produced " + chunks.size() + " chunks for " + fileName);

            repository.saveAll(chunks);
            statusService.markDone(ownerUsername, sourceId, chunks.size());

        } catch (Exception e) {
            System.out.println("[Ingestion] FAILED for " + fileName + ": " + e.getMessage());
            statusService.markFailed(ownerUsername, sourceId, e.getMessage());
        }
    }

    private String extractTextWithOcrFallback(byte[] fileBytes, String fileName) throws Exception {

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
            System.out.println("[Ingestion] Native text layer found for " + fileName
                    + " (" + nativeText.length() + " chars) — skipping OCR.space call");
            return nativeText;
        }

        System.out.println("[Ingestion] Little/no native text for " + fileName
                + " (" + nativeText.length() + " chars) — falling back to OCR.space");

        // OCR.space's free tier rejects anything over ~1MB with a 413, and a
        // scanned PDF (which is exactly the case we're in, since Tika found
        // no native text) is very often several MB. Sending the whole file
        // in one request either times out or gets rejected outright — see
        // ocrPdfPageByPage() for the per-page workaround.
        String ocrText = ocrPdfPageByPage(fileBytes, fileName);

        if (ocrText.isBlank()) {
            throw new IOException("No text could be extracted from the document (native or OCR).");
        }

        return ocrText;
    }

    // Renders each page to an image and OCRs them one at a time, instead of
    // sending the whole PDF to OCR.space in a single request. This is what
    // keeps every individual request under OCR.space's free-tier 1MB cap
    // regardless of how large or how many pages the source PDF has.
    private String ocrPdfPageByPage(byte[] fileBytes, String fileName) throws IOException {
        StringBuilder combined = new StringBuilder();

        try (PDDocument document = PDDocument.load(fileBytes)) {
            PDFRenderer renderer = new PDFRenderer(document);
            int pageCount = document.getNumberOfPages();

            for (int page = 0; page < pageCount; page++) {
                byte[] jpegBytes = renderPageUnderSizeLimit(renderer, page, fileName);
                String pageText = ocrSpaceClient.extractTextFromImage(
                        jpegBytes, fileName + "-p" + (page + 1) + ".jpg");
                combined.append(pageText).append("\n");

                System.out.println("[Ingestion] OCR'd page " + (page + 1) + "/" + pageCount
                        + " of " + fileName + " (" + jpegBytes.length + " bytes)");
            }
        }

        return combined.toString().trim();
    }

    // Steps down DPI, and within each DPI steps down JPEG quality, until the
    // page fits under OCR_SPACE_MAX_BYTES. Higher DPI is tried first since it
    // gives OCR the best accuracy; we only sacrifice quality as needed.
    private byte[] renderPageUnderSizeLimit(PDFRenderer renderer, int pageIndex, String fileName) throws IOException {
        for (int dpi : RENDER_DPI_STEPS) {
            BufferedImage image = renderer.renderImageWithDPI(pageIndex, dpi);

            for (float quality : JPEG_QUALITY_STEPS) {
                byte[] jpeg = toJpeg(image, quality);
                if (jpeg.length <= OCR_SPACE_MAX_BYTES) {
                    return jpeg;
                }
            }
        }

        throw new IOException("Could not compress page " + (pageIndex + 1) + " of " + fileName
                + " under OCR.space's size limit even at the lowest quality setting");
    }

    private byte[] toJpeg(BufferedImage image, float quality) throws IOException {
        BufferedImage rgb = image;
        if (image.getType() != BufferedImage.TYPE_INT_RGB) {
            rgb = new BufferedImage(image.getWidth(), image.getHeight(), BufferedImage.TYPE_INT_RGB);
            rgb.createGraphics().drawImage(image, 0, 0, Color.WHITE, null);
        }

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpg");
        ImageWriter writer = writers.next();
        ImageWriteParam param = writer.getDefaultWriteParam();
        param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        param.setCompressionQuality(quality);

        try (MemoryCacheImageOutputStream ios = new MemoryCacheImageOutputStream(out)) {
            writer.setOutput(ios);
            writer.write(null, new IIOImage(rgb, null, null), param);
        } finally {
            writer.dispose();
        }

        return out.toByteArray();
    }
}