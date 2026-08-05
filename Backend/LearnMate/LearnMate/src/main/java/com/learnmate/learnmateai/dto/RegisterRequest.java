package com.learnmate.learnmateai.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record RegisterRequest(
        @NotBlank String username,
        @NotBlank String password,
        @Email String email,
        String mobile,
        String gender,
        String address,
        @NotBlank String institution,
        String standard // student's class, e.g. "5" — optional, only meaningful for USER role
) {
}