package com.learnmate.learnmateai.dto;

import java.time.Instant;

public record QuizMyResultDto(
        Long quizId,
        String title,
        String subject,
        String standard,
        int score,
        int totalQuestions,
        Instant submittedAt
) {}