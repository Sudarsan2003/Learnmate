package com.learnmate.learnmateai.llm;

import java.util.ArrayList;
import java.util.List;

public interface EmbeddingClient {
    float[] embed(String text);

    /**
     * Embeds a search question. Providers that tune vectors for retrieval
     * (Voyage's input_type) embed questions and book passages slightly
     * differently, which finds better matches; by default it's the same as embed().
     */
    default float[] embedQuery(String text) {
        return embed(text);
    }

    default List<float[]> embedBatch(List<String> texts) {
        List<float[]> results = new ArrayList<>(texts.size());
        for (String text : texts) {
            results.add(embed(text));
        }
        return results;
    }
}