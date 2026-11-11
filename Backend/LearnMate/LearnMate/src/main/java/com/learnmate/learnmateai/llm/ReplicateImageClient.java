package com.learnmate.learnmateai.llm;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Makes story pictures with FLUX.1 [schnell] (Apache 2.0, commercial use allowed)
 * hosted on Replicate, about US$0.003 a picture. Needs REPLICATE_API_TOKEN; without
 * it {@link #enabled()} is false and stories are made without pictures.
 */
@Component
public class ReplicateImageClient {

    private static final Logger log = LoggerFactory.getLogger(ReplicateImageClient.class);

    private final WebClient api;
    private final WebClient download;
    private final String token;
    private final String model;

    public ReplicateImageClient(WebClient.Builder builder,
                                @Value("${learnmate.stories.replicate.token:}") String token,
                                @Value("${learnmate.stories.replicate.model:black-forest-labs/flux-schnell}") String model,
                                @Value("${learnmate.stories.replicate.base-url:https://api.replicate.com/v1}") String baseUrl) {
        ExchangeStrategies big = ExchangeStrategies.builder()
                .codecs(c -> c.defaultCodecs().maxInMemorySize(16 * 1024 * 1024))
                .build();
        this.api = builder.clone().baseUrl(baseUrl).exchangeStrategies(big).build();
        this.download = builder.clone().exchangeStrategies(big).build();
        this.token = token == null ? "" : token.trim();
        this.model = model;
    }

    public boolean enabled() {
        return !token.isEmpty();
    }

    /** A 4:3 WebP picture for {@code prompt}. Throws with a readable message on failure. */
    @SuppressWarnings("unchecked")
    public byte[] generate(String prompt) {
        if (!enabled()) throw new IllegalStateException("Story pictures aren't set up on this server.");
        Map<String, Object> body = Map.of("input", Map.of(
                "prompt", prompt,
                "aspect_ratio", "4:3",
                "output_format", "webp",
                "output_quality", 85,
                "num_outputs", 1,
                "go_fast", true));
        Map<String, Object> prediction;
        try {
            prediction = api.post()
                    .uri("/models/{model}/predictions", model)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .header("Prefer", "wait=60")
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block(Duration.ofSeconds(75));
            // Still running after the wait: poll until it finishes (up to about a minute more).
            for (int i = 0; i < 30 && prediction != null && isRunning(prediction); i++) {
                Thread.sleep(2000);
                String getUrl = (String) ((Map<String, Object>) prediction.get("urls")).get("get");
                prediction = api.get().uri(getUrl)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .retrieve().bodyToMono(Map.class).block(Duration.ofSeconds(30));
            }
        } catch (WebClientResponseException e) {
            log.warn("Replicate refused the picture request: {} {}", e.getStatusCode(), e.getResponseBodyAsString());
            throw new IllegalStateException(e.getStatusCode().value() == 401 || e.getStatusCode().value() == 403
                    ? "The picture service rejected LearnMate's key. Check REPLICATE_API_TOKEN."
                    : e.getStatusCode().value() == 402
                    ? "The picture service account has no credit left."
                    : "The picture service is busy. Please try again in a minute.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Picture making was stopped.");
        }
        if (prediction == null || !"succeeded".equals(prediction.get("status"))) {
            Object err = prediction == null ? null : prediction.get("error");
            String msg = err == null ? "" : err.toString();
            log.warn("Replicate picture failed: {}", msg);
            throw new IllegalStateException(msg.toLowerCase().contains("nsfw")
                    ? "The picture was blocked by the safety filter. Try describing the scene differently."
                    : "The picture couldn't be made. Please try again.");
        }
        Object output = prediction.get("output");
        String url = output instanceof List<?> l && !l.isEmpty() ? String.valueOf(l.get(0))
                : output instanceof String s ? s : null;
        if (url == null) throw new IllegalStateException("The picture service returned no picture.");
        byte[] bytes = download.get().uri(java.net.URI.create(url)).retrieve().bodyToMono(byte[].class)
                .block(Duration.ofSeconds(60));
        if (bytes == null || bytes.length == 0) throw new IllegalStateException("The picture couldn't be downloaded.");
        return bytes;
    }

    private static boolean isRunning(Map<String, Object> p) {
        Object s = p.get("status");
        return "starting".equals(s) || "processing".equals(s);
    }
}
