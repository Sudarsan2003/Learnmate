package com.learnmate.learnmateai.llm;

import java.util.ArrayList;
import java.util.List;

public interface EmbeddingClient {
    float[] embed(String text);

    default List<float[]> embedBatch(List<String> texts) {
        List<float[]> results = new ArrayList<>(texts.size());
        for (String text : texts) {
            results.add(embed(text));
        }
        return results;
    }
}