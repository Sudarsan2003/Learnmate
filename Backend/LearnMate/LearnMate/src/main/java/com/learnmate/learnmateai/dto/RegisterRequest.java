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
        // The school's join code (from the school admin). The institution is
        // taken from the matching school, never typed in by the student.
        @NotBlank String schoolCode,
        String standard // student's class, e.g. "5" — optional, only meaningful for USER role
) {
}
