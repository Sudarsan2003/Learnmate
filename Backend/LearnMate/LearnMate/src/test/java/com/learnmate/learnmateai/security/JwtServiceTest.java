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

    @Test
    void tokensCarryTheAccountVersion() {
        JwtService jwt = new JwtService(REAL, 60_000, "anthropic");
        assertEquals(3, jwt.extractVersion(jwt.generateToken("asha", "USER", 3)));
        assertEquals(0, jwt.extractVersion(jwt.generateToken("asha", "USER")));
    }

    @Test
    void staffTokensExpireSooner() throws Exception {
        JwtService jwt = new JwtService(REAL, 86_400_000, 43_200_000, "anthropic");
        long student = expiresInMs(jwt.generateToken("asha", "USER", 0));
        long teacher = expiresInMs(jwt.generateToken("anita", "TEACHER", 0));
        long admin = expiresInMs(jwt.generateToken("principal", "ADMIN", 0));
        assertTrue(Math.abs(student - 86_400_000) < 5_000, "student " + student);
        assertTrue(Math.abs(teacher - 43_200_000) < 5_000, "teacher " + teacher);
        assertTrue(Math.abs(admin - 43_200_000) < 5_000, "admin " + admin);
    }

    private static long expiresInMs(String token) throws Exception {
        String payload = new String(java.util.Base64.getUrlDecoder().decode(token.split("\\.")[1]));
        long exp = Long.parseLong(payload.replaceAll(".*\"exp\":(\\d+).*", "$1"));
        return exp * 1000 - System.currentTimeMillis();
    }
}
