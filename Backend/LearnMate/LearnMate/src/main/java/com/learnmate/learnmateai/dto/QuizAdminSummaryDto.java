package com.learnmate.learnmateai.dto;

import com.learnmate.learnmateai.model.Quiz;

import java.time.Instant;

/**
 * One row of GET /api/quizzes/all (ADMIN only). Same idea as QuizSummaryDto
 * (/mine) plus who created the quiz and when, matching the
 * { createdBy, createdByRole, createdAt } contract in client.js.
 */
public record QuizAdminSummaryDto(
        Long id,
        String title,
        String subject,
        String standard,
        String institution,
        Quiz.QuizMode mode,
        Quiz.QuizStatus status,
        Integer durationMinutes,
        Instant opensAt,
        Instant closesAt,
        long submittedAttempts,   // same name as QuizSummaryDto so the dashboard reads it identically
        long inProgressCount,
        Double averagePercent,    // null until someone submits
        String createdBy,
        String createdByRole,     // ADMIN / TEACHER / UNKNOWN (account deleted)
        Instant createdAt
) {}