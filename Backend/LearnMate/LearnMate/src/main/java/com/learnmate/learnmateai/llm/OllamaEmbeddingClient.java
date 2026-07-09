package com.learnmate.learnmateai.llm;

import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;

@Component
public class OllamaEmbeddingClient implements EmbeddingClient {

    private final WebClient webClient;

    public OllamaEmbeddingClient(WebClient.Builder webClientBuilder) {
        this.webClient = webClientBuilder
                .baseUrl("http://localhost:11434")
                .build();
    }

    @Override
    @SuppressWarnings("unchecked")
    public float[] embed(String text) {
        Map<String, Object> response = webClient.post()
                .uri("/api/embeddings")
                .bodyValue(Map.of("model", "nomic-embed-text", "prompt", text))
                .retrieve()
                .bodyToMono(Map.class)
                .block();

        if (response == null || !response.containsKey("embedding")) {
            throw new RuntimeException("Ollama returned no embedding for input text");
        }

        List<Double> raw = (List<Double>) response.get("embedding");
        float[] vector = new float[raw.size()];
        for (int i = 0; i < raw.size(); i++) {
            vector[i] = raw.get(i).floatValue();
        }
        return vector;
    }
}