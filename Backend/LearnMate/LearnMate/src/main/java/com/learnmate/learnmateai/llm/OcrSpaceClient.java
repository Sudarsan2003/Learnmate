package com.learnmate.learnmateai.llm;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;

/**
 * Sends PDFs to OCR.space's free-tier API (25,000 requests/month, no card
 * required) instead of running Tesseract locally. Only invoked as a
 * fallback when Tika can't find a native text layer in the PDF (see
 * IngestionService.extractTextWithOcrFallback), to conserve the free quota.
 */
@Component
public class OcrSpaceClient {

    private final WebClient webClient;
    private final String apiKey;

    public OcrSpaceClient(@Value("${ocrspace.api-key}") String apiKey) {
        this.apiKey = apiKey;

        ExchangeStrategies strategies = ExchangeStrategies.builder()
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(10 * 1024 * 1024))
                .build();

        this.webClient = WebClient.builder()
                .baseUrl("https://api.ocr.space")
                .exchangeStrategies(strategies)
                .build();
    }

    // Kept for callers that already know their file is small enough (e.g. a
    // native PDF under OCR.space's free-tier 1MB/request cap). For anything
    // larger, prefer extractTextFromImage() called once per rendered page —
    // see IngestionService.ocrPdfPageByPage().
    public String extractText(byte[] fileBytes, String filename) {
        return extractText(fileBytes, filename, "PDF", MediaType.APPLICATION_PDF);
    }

    // Used for per-page OCR: each page is rendered + JPEG-compressed down to
    // under OCR.space's 1MB/request limit before it ever reaches this call.
    public String extractTextFromImage(byte[] jpegBytes, String filename) {
        return extractText(jpegBytes, filename, "JPG", MediaType.IMAGE_JPEG);
    }

    @SuppressWarnings("unchecked")
    private String extractText(byte[] fileBytes, String filename, String filetype, MediaType contentType) {
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part("apikey", apiKey);
        builder.part("file", fileBytes)
                .filename(filename)
                .contentType(contentType);
        builder.part("filetype", filetype);
        builder.part("OCREngine", "2");
        builder.part("scale", "true");

        Map<String, Object> response = webClient.post()
                .uri("/parse/image")
                .body(BodyInserters.fromMultipartData(builder.build()))
                .retrieve()
                .bodyToMono(Map.class)
                .block();

        if (response == null) {
            throw new RuntimeException("OCR.space returned no response");
        }
        if (Boolean.TRUE.equals(response.get("IsErroredOnProcessing"))) {
            throw new RuntimeException("OCR.space error: " + response.get("ErrorMessage"));
        }

        List<Map<String, Object>> parsedResults = (List<Map<String, Object>>) response.get("ParsedResults");
        if (parsedResults == null || parsedResults.isEmpty()) {
            throw new RuntimeException("OCR.space returned no parsed results");
        }

        StringBuilder text = new StringBuilder();
        for (Map<String, Object> result : parsedResults) {
            Object parsedText = result.get("ParsedText");
            if (parsedText != null) {
                text.append(parsedText).append("\n");
            }
        }

        return text.toString().trim();
    }
}