package com.learnmate.learnmateai.dto;

import java.util.List;

public record QuizSubmitRequest(List<AnswerInput> answers) {
    public record AnswerInput(Long questionId, String selectedOption) {}
}