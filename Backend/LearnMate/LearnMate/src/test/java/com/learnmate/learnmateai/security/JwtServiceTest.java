package com.learnmate.learnmateai.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class JwtServiceTest {

    private static final String DEV = "dev-only-secret-change-me-please-32chars";
    private static final String REAL = "q8Zr1v0bKx3mW7tLp2sY9nH4cJ6dF5gA1eR8uT0iO3";

    @Test
    void devSecretIsAllowedLocally() {
        assertDoesNotThrow(() -> new JwtService(DEV, 60_000, "local"));
    }

    @Test
    void devOrShortSecretRefusesToStartInProduction() {
        assertThrows(IllegalStateException.class, () -> new JwtService(DEV, 60_000, "anthropic"));
        assertThrows(IllegalStateException.class, () -> new JwtService("too-short", 60_000, "anthropic"));
    }

    @Test
    void realSecretIssuesTokensThatValidate() {
        JwtService jwt = new JwtService(REAL, 60_000, "anthropic");
        String token = jwt.generateToken("asha", "USER");
        assertTrue(jwt.isValid(token));
        assertEquals("asha", jwt.extractUsername(token));
        assertFalse(new JwtService(REAL + "x", 60_000, "anthropic").isValid(token));
    }
}
