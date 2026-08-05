package com.learnmate.learnmateai.dto;

import com.learnmate.learnmateai.model.Quiz;

import java.util.List;

public record QuizCreateRequest(
        String title,
        String subject,
        String standard,
        String institution,
        Quiz.QuizMode mode,
        String opensAt,
        String closesAt,
        Integer durationMinutes, // null/0 = untimed; e.g. 10, 15, 20, 30, 45, 60
        List<ManualQuestion> manualQuestions,
        Integer aiGenerateCount
) {
    public record ManualQuestion(
            String questionText, String optionA, String optionB,
            String optionC, String optionD, String correctOption
    ) {}
}