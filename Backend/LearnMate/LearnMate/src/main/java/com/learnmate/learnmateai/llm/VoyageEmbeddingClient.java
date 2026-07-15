package com.learnmate.learnmateai.llm;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

// Default embedding provider. Add "ollama" to spring.profiles.active to
// switch to OllamaEmbeddingClient instead — only one of the two is active
// at a time so Spring doesn't see two competing EmbeddingClient beans.
@Component
@org.springframework.context.annotation.Profile("!ollama")
public class VoyageEmbeddingClient implements EmbeddingClient {

    // NOTE: plain "voyage-3-lite" always returns 512-dim vectors and does not
    // accept output_dimension — that mismatch against the vector(1024) column
    // is what was causing every ingestion to fail with
    // "expected X dimensions, not 512". voyage-3.5-lite is the same
    // price/tier but supports configurable output_dimension (256/512/1024/2048),
    // so we pin it to 1024 to match DocumentChunk's column definition.
    // If you ever change this dimension, update DocumentChunk's
    // columnDefinition AND run a migration to alter the existing column.
    private static final String MODEL = "voyage-3.5-lite";
    private static final int OUTPUT_DIMENSION = 1024;

    // Voyage's rate limit is per-minute per API key regardless of whether
    // you send one text or many in a single request. Sending one HTTP
    // request per chunk (as before) meant a 200-chunk document fired 200
    // requests back-to-back and blew through the limit almost immediately,
    // failing with 429 partway through. Batching many chunks into one
    // request is what actually avoids this — retries alone wouldn't help
    // since every retry would just re-hit the same limit.
    private static final int BATCH_SIZE = 100;
    private static final int MAX_RETRIES = 5;
    private static final long INITIAL_BACKOFF_MS = 2000;

    private final WebClient webClient;

    public VoyageEmbeddingClient(
            @Value("${voyage.api-key}") String apiKey) {

        // Spring's WebClient defaults to a 256KB (262144 byte) in-memory
        // buffer limit for response bodies. A batch of 100 chunks each
        // returning a 1024-dim float vector comes back as roughly 1-2MB of
        // JSON — several times over that default — so the request would
        // succeed (200 OK) but Spring would refuse to buffer the reply with
        // DataBufferLimitException. 10MB gives comfortable headroom even
        // for larger batch sizes later.
        ExchangeStrategies strategies = ExchangeStrategies.builder()
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(10 * 1024 * 1024))
                .build();

        this.webClient = WebClient.builder()
                .baseUrl("https://api.voyageai.com")
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .exchangeStrategies(strategies)
                .build();
    }

    @Override
    public float[] embed(String text) {
        return embedBatch(List.of(text)).get(0);
    }

    @Override
    public List<float[]> embedBatch(List<String> texts) {
        List<float[]> results = new ArrayList<>(texts.size());

        for (int start = 0; start < texts.size(); start += BATCH_SIZE) {
            int end = Math.min(start + BATCH_SIZE, texts.size());
            results.addAll(embedWithRetry(texts.subList(start, end)));
        }

        return results;
    }

    @SuppressWarnings("unchecked")
    private List<float[]> embedWithRetry(List<String> batch) {
        int attempt = 0;
        long backoffMs = INITIAL_BACKOFF_MS;

        while (true) {
            try {
                Map<String, Object> response = webClient.post()
                        .uri("/v1/embeddings")
                        .bodyValue(Map.of(
                                "input", batch,
                                "model", MODEL,
                                "output_dimension", OUTPUT_DIMENSION
                        ))
                        .retrieve()
                        .bodyToMono(Map.class)
                        .block();

                List<Map<String, Object>> data = (List<Map<String, Object>>) response.get("data");
                List<float[]> vectors = new ArrayList<>(data.size());

                for (Map<String, Object> item : data) {
                    List<Double> embedding = (List<Double>) item.get("embedding");
                    float[] vector = new float[embedding.size()];
                    for (int i = 0; i < embedding.size(); i++) {
                        vector[i] = embedding.get(i).floatValue();
                    }
                    vectors.add(vector);
                }

                return vectors;

            } catch (WebClientResponseException.TooManyRequests e) {
                attempt++;
                if (attempt > MAX_RETRIES) {
                    throw e;
                }

                long waitMs = backoffMs;
                String retryAfter = e.getHeaders().getFirst("Retry-After");
                if (retryAfter != null) {
                    try {
                        waitMs = Long.parseLong(retryAfter.trim()) * 1000L;
                    } catch (NumberFormatException ignored) {
                        // fall back to our own backoff value
                    }
                }

                System.out.println("[Embedding] 429 from Voyage, retry " + attempt + "/" + MAX_RETRIES
                        + " after " + waitMs + "ms");

                try {
                    Thread.sleep(waitMs);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Interrupted while backing off from Voyage rate limit", ie);
                }

                backoffMs *= 2;
            }
        }
    }
}