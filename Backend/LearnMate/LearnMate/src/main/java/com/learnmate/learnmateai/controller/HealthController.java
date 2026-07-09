package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.model.DocumentChunk;
import com.learnmate.learnmateai.repository.DocumentChunkRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class HealthController {

    private final DocumentChunkRepository repository;

    public HealthController(DocumentChunkRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/api/health")
    public Map<String, Object> health() {
        return Map.of("status", "ok", "chunkCount", repository.count());
    }

    @PostMapping("/api/dev/seed-chunk")
    public DocumentChunk seedChunk() {
        DocumentChunk chunk = new DocumentChunk();
        chunk.setSourceId("demo-source-1");
        chunk.setSubject("algorithms");
        chunk.setContent("A binary search tree keeps left children smaller and right children larger than their parent, enabling O(log n) lookups on average.");
        return repository.save(chunk);
    }
}