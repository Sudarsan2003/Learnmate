package com.learnmate.learnmateai.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

public record ChatRequest(
        @NotBlank String query,
        String subject,
        String level,
        String sessionId,
        // sourceIds the student ticked in the chat's material picker; when present,
        // a quiz request is built only from these documents.
        List<String> materialIds
) {
}
