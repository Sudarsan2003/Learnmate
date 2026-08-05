// QuizStartDto.java
package com.learnmate.learnmateai.dto;

import java.time.Instant;
import java.util.List;

public record QuizStartDto(
        Long quizId,
        String title,
        List<QuizQuestionForStudentDto> questions,
        Integer durationMinutes,
        Instant deadline // null if untimed
) {}