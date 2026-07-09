package com.learnmate.learnmateai.dto;

public record RetrievedChunk(Long chunkId, String sourceId, String content, double score) {
}