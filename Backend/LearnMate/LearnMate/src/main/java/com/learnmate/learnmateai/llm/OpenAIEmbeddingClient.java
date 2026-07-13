package com.learnmate.learnmateai.llm;

import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.models.embeddings.CreateEmbeddingResponse;
import com.openai.models.embeddings.EmbeddingCreateParams;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.beans.factory.annotation.Value;
import java.util.List;
import java.util.Map;

@Component
public class OpenAIEmbeddingClient implements EmbeddingClient {

    private final OpenAIClient client;

    public OpenAIEmbeddingClient(
            @Value("${openai.api-key}") String apiKey
    ) {
        client = OpenAIOkHttpClient.builder()
                .apiKey(apiKey)
                .build();
    }

    @Override
    public float[] embed(String text) {

        CreateEmbeddingResponse response =
                client.embeddings().create(
                        EmbeddingCreateParams.builder()
                                .model("text-embedding-3-small")
                                .input(text)
                                .build());

        List<Float> embedding =
                response.data().get(0).embedding();

        float[] vector = new float[embedding.size()];

        for (int i = 0; i < embedding.size(); i++) {
            vector[i] = embedding.get(i);
        }

        return vector;
    }
}