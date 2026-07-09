package com.learnmate.learnmateai.dto;

import java.util.List;

public record ChatResponse(String answer, List<RetrievedChunk> citations) {
}