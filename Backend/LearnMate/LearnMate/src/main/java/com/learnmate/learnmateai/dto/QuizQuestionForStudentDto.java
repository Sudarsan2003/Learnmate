package com.learnmate.learnmateai.dto;

// Sent to students taking the quiz — correctOption deliberately omitted.
public record QuizQuestionForStudentDto(
        Long id,
        String questionText,
        String optionA,
        String optionB,
        String optionC,
        String optionD
) {}