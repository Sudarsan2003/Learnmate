package com.learnmate.learnmateai.dto;

import jakarta.validation.constraints.NotBlank;

public record ChatRequest(
        @NotBlank String query,
        String subject,
        String level,
        String sessionId
) {
}