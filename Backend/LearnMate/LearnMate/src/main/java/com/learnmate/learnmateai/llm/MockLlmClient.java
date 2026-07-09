package com.learnmate.learnmateai.llm;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("!anthropic")
public class MockLlmClient implements LlmClient {

    @Value("${learnmate.llm.provider:mock}")
    private String provider;

    @Override
    public String complete(String systemPrompt, String userPrompt) {
        return """
                [MOCK RESPONSE — provider=%s]

                System instructions received (%d chars).
                Here is a placeholder, level-adapted explanation grounded in the
                retrieved context below. Replace MockLlmClient with
                AnthropicLlmClient (profile=anthropic) once the frontend is
                wired up.

                --- context / prompt received ---
                %s
                """.formatted(provider, systemPrompt.length(), truncate(userPrompt, 800));
    }

    private String truncate(String text, int max) {
        if (text == null) return "";
        return text.length() <= max ? text : text.substring(0, max) + "...[truncated]";
    }
}