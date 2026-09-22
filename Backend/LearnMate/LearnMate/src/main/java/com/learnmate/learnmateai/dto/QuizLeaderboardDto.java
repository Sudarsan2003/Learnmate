package com.learnmate.learnmateai.dto;

import java.time.Instant;
import java.util.List;

/**
 * Full leaderboard for one quiz: every student who has submitted, ranked
 * HackerRank-style (highest marks first, then fastest time). `me` is the
 * caller's own row, or null for staff who never took the quiz.
 */
public record QuizLeaderboardDto(
        Long quizId,
        String title,
        int totalParticipants,
        List<Entry> entries,
        Entry me
) {
    public record Entry(
            int rank,
            String username,
            int score,
            int totalQuestions,
            long timeTakenSeconds,
            Instant submittedAt
    ) {}
}