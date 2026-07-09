package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.dto.RetrievedChunk;
import com.learnmate.learnmateai.llm.EmbeddingClient;
import com.learnmate.learnmateai.model.DocumentChunk;
import com.learnmate.learnmateai.repository.DocumentChunkRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class HybridSearchService {

    private final DocumentChunkRepository repository;
    private final EmbeddingClient embeddingClient;

    public HybridSearchService(DocumentChunkRepository repository, EmbeddingClient embeddingClient) {
        this.repository = repository;
        this.embeddingClient = embeddingClient;
    }

    public List<RetrievedChunk> search(String query, String subject, int topK) {
        float[] vector = embeddingClient.embed(query);
        System.out.println(vector.length);
        String pgVectorLiteral = toPgVectorLiteral(vector);

        List<DocumentChunk> chunks = repository.hybridSearch(pgVectorLiteral, query, subject, topK);
        System.out.println("=================================");
        System.out.println("Question = " + query);
        System.out.println("Subject = " + subject);

        System.out.println("Retrieved = " + chunks.size());

        chunks.forEach(c -> {
            System.out.println("----------------");
            System.out.println(c.getSourceId());
            System.out.println(c.getContent());
        });

        return chunks.stream()
                .map(c -> new RetrievedChunk(c.getId(), c.getSourceId(), c.getContent(), 0.0))
                .toList();
    }

    private String toPgVectorLiteral(float[] vector) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < vector.length; i++) {
            sb.append(vector[i]);
            if (i < vector.length - 1) sb.append(",");
        }
        return sb.append("]").toString();
    }
}