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
        // Local testing of picture-book stories: a fixed six-page story in the expected JSON.
        if (systemPrompt != null && systemPrompt.contains("picture-book stories")) {
            return """
                    {"title": "Meera Finds the Fruits",
                     "character": "a cheerful 5-year-old Indian girl with two short plaits, yellow frock and red sandals",
                     "pages": [
                       {"text": "Meera goes to the market with Amma.", "scene": "a girl holding her mother's hand at a busy fruit market"},
                       {"text": "She sees a big yellow mango.", "scene": "the girl pointing at a large ripe mango on a stall"},
                       {"text": "She sees red apples in a basket.", "scene": "a basket full of shiny red apples"},
                       {"text": "She sees a long green banana bunch.", "scene": "a bunch of bananas hanging at a stall"},
                       {"text": "Meera puts the fruits in her bag.", "scene": "the girl smiling, putting fruits into a cloth bag"},
                       {"text": "Fruits are tasty and good for us!", "scene": "the girl and her mother eating fruit at home"}
                     ]}
                    """;
        }
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