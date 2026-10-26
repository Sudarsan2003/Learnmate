package com.learnmate.learnmateai.llm;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
@Profile("anthropic")
public class AnthropicLlmClient implements LlmClient {

    private static final Logger log = LoggerFactory.getLogger(AnthropicLlmClient.class);

    private final WebClient webClient;

    @Value("${learnmate.llm.anthropic.model:claude-sonnet-4-6}")
    private String model;

    @Value("${learnmate.llm.anthropic.temperature:0.3}")
    private double temperature;

    // Output cap for text completions. A 5 MCQ + 3 descriptive quiz (with explanations
    // and reference answers) needs ~2.5-3.5k tokens, so 1024 truncated the JSON mid-way.
    @Value("${learnmate.llm.anthropic.max-tokens:4096}")
    private int maxTokens;

    // Vision transcription of a full page of questions.
    @Value("${learnmate.llm.anthropic.vision-max-tokens:2048}")
    private int visionMaxTokens;

    @Value("${learnmate.llm.anthropic.timeout-seconds:120}")
    private long timeoutSeconds;

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
                "max_tokens", maxTokens,
                "temperature", temperature,
                "system", systemPrompt,
                "messages", List.of(Map.of("role", "user", "content", userPrompt))
        );

        return send(requestBody);
    }

    @Override
    public String completeWithImage(String systemPrompt, String userPrompt, String base64ImageData, String mediaType) {
        Map<String, Object> imageBlock = Map.of(
                "type", "image",
                "source", Map.of(
                        "type", "base64",
                        "media_type", mediaType,
                        "data", base64ImageData
                )
        );
        Map<String, Object> textBlock = Map.of("type", "text", "text", userPrompt);

        Map<String, Object> requestBody = Map.of(
                "model", model,
                "max_tokens", visionMaxTokens,
                "temperature", temperature,
                "system", systemPrompt,
                "messages", List.of(Map.of("role", "user", "content", List.of(imageBlock, textBlock)))
        );

        return send(requestBody);
    }

    @SuppressWarnings("unchecked")
    private String send(Map<String, Object> requestBody) {
        Map<String, Object> response = webClient.post()
                .uri("/messages")
                .header("x-api-key", apiKey)
                .header("anthropic-version", "2023-06-01")
                .bodyValue(requestBody)
                .retrieve()
                .bodyToMono(Map.class)
                .block(Duration.ofSeconds(timeoutSeconds)); // fine for now; move to reactive chain later

        if (response == null) {
            throw new IllegalStateException("No response from Anthropic API");
        }

        // Make truncation obvious instead of letting it surface later as a JSON parse error.
        if ("max_tokens".equals(response.get("stop_reason"))) {
            log.warn("Anthropic response was cut off at max_tokens ({}). "
                    + "Raise learnmate.llm.anthropic.max-tokens if output looks incomplete.", requestBody.get("max_tokens"));
        }

        return extractText(response);
    }

    @SuppressWarnings("unchecked")
    private String extractText(Map<String, Object> response) {
        List<Map<String, Object>> content = (List<Map<String, Object>>) response.get("content");
        if (content == null || content.isEmpty()) {
            throw new IllegalStateException("Empty response from Anthropic API");
        }
        // Join every text block rather than assuming the first one is the whole answer.
        String text = content.stream()
                .filter(b -> "text".equals(b.get("type")))
                .map(b -> (String) b.get("text"))
                .collect(Collectors.joining());
        if (text.isEmpty()) {
            throw new IllegalStateException("Anthropic response contained no text block");
        }
        return text;
    }
}