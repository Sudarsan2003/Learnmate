package com.learnmate.learnmateai.llm;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;

@Component
@Profile("anthropic")
public class AnthropicLlmClient implements LlmClient {

    private final WebClient webClient;

    @Value("${learnmate.llm.anthropic.model:claude-sonnet-4-6}")
    private String model;

    @Value("${learnmate.llm.anthropic.temperature:0.3}")
    private double temperature;

    @Value("${anthropic.api-key}")
    private String apiKey;

    public AnthropicLlmClient(WebClient.Builder webClientBuilder) {
        this.webClient = webClientBuilder
                .baseUrl("https://api.anthropic.com/v1")
                .build();
    }

    @Override
    public String complete(String systemPrompt, String userPrompt) {
        Map<String, Object> requestBody = Map.of(
                "model", model,
                "max_tokens", 1024,
                "temperature", temperature,
                "system", systemPrompt,
                "messages", List.of(Map.of("role", "user", "content", userPrompt))
        );

        Map<String, Object> response = webClient.post()
                .uri("/messages")
                .header("x-api-key", apiKey)
                .header("anthropic-version", "2023-06-01")
                .bodyValue(requestBody)
                .retrieve()
                .bodyToMono(Map.class)
                .block(); // fine for now; move to reactive chain later if you async-ify controllers

        return extractText(response);
    }

    @SuppressWarnings("unchecked")
    private String extractText(Map<String, Object> response) {
        List<Map<String, Object>> content = (List<Map<String, Object>>) response.get("content");
        if (content == null || content.isEmpty()) {
            throw new IllegalStateException("Empty response from Anthropic API");
        }
        return (String) content.get(0).get("text");
    }
}