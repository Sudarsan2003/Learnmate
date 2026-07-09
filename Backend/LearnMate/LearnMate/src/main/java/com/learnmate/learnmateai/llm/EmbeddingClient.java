package com.learnmate.learnmateai.llm;

public interface EmbeddingClient {
    float[] embed(String text);
}