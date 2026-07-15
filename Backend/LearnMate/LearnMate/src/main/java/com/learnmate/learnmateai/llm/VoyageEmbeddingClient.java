package com.learnmate.learnmateai.llm;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;

@Component
public class VoyageEmbeddingClient implements EmbeddingClient {

    private final WebClient webClient;

    public VoyageEmbeddingClient(
            @Value("${voyage.api-key}") String apiKey) {

        this.webClient = WebClient.builder()
                .baseUrl("https://api.voyageai.com")
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    // NOTE: plain "voyage-3-lite" always returns 512-dim vectors and does not
    // accept output_dimension — that mismatch against the vector(1024) column
    // is what was causing every ingestion to fail with
    // "expected X dimensions, not 512". voyage-3.5-lite is the same
    // price/tier but supports configurable output_dimension (256/512/1024/2048),
    // so we pin it to 1024 to match DocumentChunk's column definition.
    // If you ever change this dimension, update DocumentChunk's
    // columnDefinition AND run a migration to alter the existing column.
    @Override
    @SuppressWarnings("unchecked")
    public float[] embed(String text) {

        Map<String, Object> response = webClient.post()
                .uri("/v1/embeddings")
                .bodyValue(Map.of(
                        "input", List.of(text),
                        "model", "voyage-3.5-lite",
                        "output_dimension", 1024
                ))
                .retrieve()
                .bodyToMono(Map.class)
                .block();

        List<Map<String, Object>> data =
                (List<Map<String, Object>>) response.get("data");

        List<Double> embedding =
                (List<Double>) data.get(0).get("embedding");

        float[] vector = new float[embedding.size()];

        for (int i = 0; i < embedding.size(); i++) {
            vector[i] = embedding.get(i).floatValue();
        }

        return vector;
    }
}