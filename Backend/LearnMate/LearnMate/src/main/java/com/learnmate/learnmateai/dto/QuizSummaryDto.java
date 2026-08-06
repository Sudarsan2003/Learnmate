package com.learnmate.learnmateai.dto;

import com.learnmate.learnmateai.model.Quiz;


public record QuizSummaryDto(
        Long id,
        String title,
        String subject,
        String standard,
        String institution,
        Quiz.QuizMode mode,
        Quiz.QuizStatus status,
        Integer durationMinutes,
        long submittedAttempts
) {}