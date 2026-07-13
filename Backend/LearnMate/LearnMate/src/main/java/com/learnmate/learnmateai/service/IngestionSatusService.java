package com.learnmate.learnmateai.service;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tracks the state of in-flight/completed ingestion jobs so the frontend
 * can poll GET /api/documents/status/{sourceId} instead of blocking on the
 * upload request until parsing + OCR + embedding finish.
 *
 * In-memory only: fine for a single instance. If this app ever runs with
 * more than one replica, this needs to move to the database (or Redis) or
 * status checks will miss jobs handled by a different instance.
 */
@Service
public class IngestionStatusService {

    public enum State { PROCESSING, DONE, FAILED }

    public record IngestionStatus(State state, String sourceId, String message,
                                  int chunkCount, Instant updatedAt) {}

    private final Map<String, IngestionStatus> statuses = new ConcurrentHashMap<>();

    private String key(String ownerUsername, String sourceId) {
        return ownerUsername + "::" + sourceId;
    }

    public void markProcessing(String ownerUsername, String sourceId) {
        statuses.put(key(ownerUsername, sourceId),
                new IngestionStatus(State.PROCESSING, sourceId, "Parsing and embedding document...", 0, Instant.now()));
    }

    public void markDone(String ownerUsername, String sourceId, int chunkCount) {
        statuses.put(key(ownerUsername, sourceId),
                new IngestionStatus(State.DONE, sourceId, "Ingestion complete", chunkCount, Instant.now()));
    }

    public void markFailed(String ownerUsername, String sourceId, String errorMessage) {
        statuses.put(key(ownerUsername, sourceId),
                new IngestionStatus(State.FAILED, sourceId, errorMessage, 0, Instant.now()));
    }

    public IngestionStatus getStatus(String ownerUsername, String sourceId) {
        return statuses.get(key(ownerUsername, sourceId));
    }
}