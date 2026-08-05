package com.learnmate.learnmateai.dto;

import java.util.List;

public record QuizResultsDto(
        Long quizId,
        String title,
        List<StudentScore> studentScores,
        List<MissedQuestion> mostMissedQuestions
) {
    public record StudentScore(String username, int score, int totalQuestions) {}
    public record MissedQuestion(Long questionId, String questionText, long missCount) {}
}