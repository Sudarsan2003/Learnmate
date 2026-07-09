package com.learnmate.learnmateai.llm;

public interface LlmClient {
    String complete(String systemPrompt, String userPrompt);
}