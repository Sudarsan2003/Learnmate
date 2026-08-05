package com.learnmate.learnmateai.dto;

import com.learnmate.learnmateai.model.Quiz;

import java.util.List;

public record QuizCreateRequest(
        String title,
        String subject,
        String standard,  // "1".."10" — which class this quiz targets
        String institution, // only read when the creator is ADMIN — teachers use their own (see QuizService)
        Quiz.QuizMode mode,
        String opensAt,   // ISO-8601 string, only used when mode == SCHEDULED
        String closesAt,  // ISO-8601 string, optional even when scheduled
        List<ManualQuestion> manualQuestions, // may be empty
        Integer aiGenerateCount // null/0 = no AI questions requested
) {
    public record ManualQuestion(
            String questionText,
            String optionA,
            String optionB,
            String optionC,
            String optionD,
            String correctOption
    ) {}
}