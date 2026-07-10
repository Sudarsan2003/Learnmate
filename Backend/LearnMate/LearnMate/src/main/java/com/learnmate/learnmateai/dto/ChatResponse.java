package com.learnmate.learnmateai.dto;

import java.util.List;

public record ChatResponse(String answer, List<RetrievedChunk> citations, String sessionId) {
    public ChatResponse withSessionId(String sessionId) {
        return new ChatResponse(answer(), citations(), sessionId);
    }
}