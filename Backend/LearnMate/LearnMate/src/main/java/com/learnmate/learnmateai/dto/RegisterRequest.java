package com.learnmate.learnmateai.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record RegisterRequest(
        @NotBlank String username,
        @NotBlank String password,
        String role, // optional: "USER" (default) or "ADMIN" — see note in AuthController
        @Email String email,
        String mobile,
        String gender,
        String address,
        String institution
) {
}