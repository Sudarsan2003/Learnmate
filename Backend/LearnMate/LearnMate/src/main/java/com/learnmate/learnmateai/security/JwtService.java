package com.learnmate.learnmateai.security;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.util.Date;

@Service
public class JwtService {

    private final SecretKey key;
    private final long expirationMs;

    // Matches the fallback in application.yaml. It's public (it's in the repo), so
    // anyone could sign their own ADMIN token with it.
    private static final String DEV_SECRET_PREFIX = "dev-only-secret";

    public JwtService(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.expiration-ms}") long expirationMs,
            @Value("${spring.profiles.active:local}") String activeProfiles
    ) {
        // HS256 needs a key >= 256 bits (32 bytes). Outside the local profile,
        // refuse to start without a real secret rather than run with forgeable logins.
        boolean local = java.util.Arrays.asList(activeProfiles.split("\\s*,\\s*")).contains("local");
        if (!local && (secret.startsWith(DEV_SECRET_PREFIX) || secret.getBytes().length < 32)) {
            throw new IllegalStateException(
                    "JWT_SECRET is not set (or is shorter than 32 characters). Set it to a long random "
                            + "value, e.g. the output of `openssl rand -base64 48`, before starting LearnMate.");
        }
        this.key = Keys.hmacShaKeyFor(secret.getBytes());
        this.expirationMs = expirationMs;
    }

    public String generateToken(String username, String role) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + expirationMs);

        return Jwts.builder()
                .subject(username)
                .claim("role", role)
                .issuedAt(now)
                .expiration(expiry)
                .signWith(key)
                .compact();
    }

    public String extractUsername(String token) {
        return parseClaims(token).getSubject();
    }

    public String extractRole(String token) {
        return parseClaims(token).get("role", String.class);
    }

    public boolean isValid(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (Exception e) {
            return false;
        }

    }


    private io.jsonwebtoken.Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}