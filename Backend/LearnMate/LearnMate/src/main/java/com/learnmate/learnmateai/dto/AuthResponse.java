package com.learnmate.learnmateai.dto;

// owner: true for the LearnMate owner, who manages every school (see SchoolAccess).
public record AuthResponse(String token, String username, String role, boolean owner) {
    public AuthResponse(String token, String username, String role) {
        this(token, username, role, false);
    }
}