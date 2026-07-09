package com.learnmate.learnmateai.dto;

import jakarta.validation.constraints.NotBlank;

public record RegisterRequest(
        @NotBlank String username,
        @NotBlank String password,
        String role // optional: "USER" (default) or "ADMIN" — see note in AuthController
) {
}