package com.learnmate.learnmateai.dto;

import java.time.Instant;
import java.util.List;

public record QuizAttemptDetailDto(
        Long quizId,
        String title,
        int score,
        int totalQuestions,
        Instant submittedAt,
        List<QuestionReview> questions
) {
    public record QuestionReview(
            Long questionId,
            String questionText,
            String optionA,
            String optionB,
            String optionC,
            String optionD,
            String correctOption,
            String selectedOption, // null if left unanswered
            boolean correct
    ) {}
}