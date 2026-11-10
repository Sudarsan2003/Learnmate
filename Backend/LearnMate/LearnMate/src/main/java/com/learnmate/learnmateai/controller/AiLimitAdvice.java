package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.service.AiUsageService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

/** A student who used up today's AI questions gets 429 and a message the app shows as-is. */
@RestControllerAdvice
public class AiLimitAdvice {

    @ExceptionHandler(AiUsageService.DailyLimitException.class)
    public ResponseEntity<Map<String, Object>> dailyLimit(AiUsageService.DailyLimitException e) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(Map.of("message", e.getMessage(), "dailyLimit", e.getLimit(), "limitReached", true));
    }
}
