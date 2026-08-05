// QuizAskRequest.java
package com.learnmate.learnmateai.dto;

public record QuizAskRequest(
        Long questionId,
        String question
) {}