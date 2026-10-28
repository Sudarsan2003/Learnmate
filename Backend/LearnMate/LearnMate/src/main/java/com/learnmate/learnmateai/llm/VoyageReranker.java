package com.learnmate.learnmateai.llm;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Second pass over search results: Voyage's reranker reads the question and
 * each candidate passage together and scores how well the passage answers it,
 * which is noticeably more accurate than vector distance alone.
 *
 * Optional by design: if the call fails (network, rate limit, bad key) the
 * caller keeps its own order, so search never breaks because of it.
 */
@Component
public class VoyageReranker {

    private static final Logger log = LoggerFactory.getLogger(VoyageReranker.class);

    private final WebClient webClient;
    private final String model;
    private final boolean enabled;

    public VoyageReranker(@Value("${voyage.api-key:}") String apiKey,
                          @Value("${voyage.rerank-model:rerank-2.5-lite}") String model,
                          @Value("${voyage.rerank-enabled:true}") boolean enabled) {
        this.webClient = WebClient.builder()
                .baseUrl("https://api.voyageai.com")
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .build();
        this.model = model;
        this.enabled = enabled && apiKey != null && !apiKey.isBlank();
    }

    /**
     * Indexes into {@code documents} of the {@code topK} best passages, best
     * first, or null if reranking is off or failed (keep the original order).
     */
    @SuppressWarnings("unchecked")
    public List<Integer> rerank(String query, List<String> documents, int topK) {
        if (!enabled || documents.isEmpty()) return null;
        try {
            Map<String, Object> response = webClient.post()
                    .uri("/v1/rerank")
                    .bodyValue(Map.of(
                            "query", query,
                            "documents", documents,
                            "model", model,
                            "top_k", Math.min(topK, documents.size()),
                            "truncation", true
                    ))
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block(Duration.ofSeconds(10));

            List<Map<String, Object>> data = response == null ? null : (List<Map<String, Object>>) response.get("data");
            if (data == null || data.isEmpty()) return null;

            List<Integer> order = new ArrayList<>(data.size());
            for (Map<String, Object> item : data) {
                order.add(((Number) item.get("index")).intValue());
            }
            return order;
        } catch (RuntimeException e) {
            log.warn("Reranking failed, keeping the search order: {}", e.getMessage());
            return null;
        }
    }
}
