package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.llm.EmbeddingClient;
import com.learnmate.learnmateai.model.DocumentChunk;
import com.learnmate.learnmateai.repository.DocumentChunkRepository;
import com.pgvector.PGvector;
import org.apache.tika.Tika;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

@Service
public class IngestionService {

    private static final int CHUNK_SIZE = 400;

    private final DocumentChunkRepository repository;
    private final EmbeddingClient embeddingClient;
    private final Tika tika = new Tika();

    public IngestionService(DocumentChunkRepository repository, EmbeddingClient embeddingClient) {
        this.repository = repository;
        this.embeddingClient = embeddingClient;
    }

    public List<DocumentChunk> ingest(MultipartFile file, String subject, String ownerUsername) throws IOException {
        String sourceId = file.getOriginalFilename();
        if (sourceId == null || sourceId.isBlank()) {
            throw new IllegalArgumentException("File must have a name");
        }

        String text;
        try {
            text = tika.parseToString(file.getInputStream());
            text = text.replaceAll("\\n\\d+\\n", "\n");      // Remove page numbers
            text = text.replaceAll("\\s{2,}", " ");          // Remove extra spaces
            text = text.replaceAll("Page \\d+", "");         // Remove "Page X"
        } catch (Exception e) {
            throw new IOException("Failed to parse document: " + e.getMessage(), e);
        }

        repository.deleteBySourceIdAndOwnerUsername(sourceId, ownerUsername);

        List<DocumentChunk> chunks = new ArrayList<>();
        for (int start = 0; start < text.length(); start += CHUNK_SIZE) {
            int end = Math.min(start + CHUNK_SIZE, text.length());
            String piece = text.substring(start, end).trim();
            if (piece.isEmpty()) continue;

            DocumentChunk chunk = new DocumentChunk();
            chunk.setSourceId(sourceId);
            chunk.setSubject(subject);
            chunk.setContent(piece);
            chunk.setOwnerUsername(ownerUsername);

            // Embed this chunk's text right away so retrieval can do
            // vector similarity search against it later.
            float[] vector = embeddingClient.embed(piece);
            chunk.setEmbedding(new PGvector(vector));

            chunks.add(chunk);
        }

        return repository.saveAll(chunks);
    }
}