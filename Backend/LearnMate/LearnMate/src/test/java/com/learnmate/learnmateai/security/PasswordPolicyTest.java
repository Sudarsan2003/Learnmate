package com.learnmate.learnmateai.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PasswordPolicyTest {

    @Test
    void studentsNeedSixCharacters() {
        PasswordPolicy.check("abc123", "USER", "ravi");
        assertThrows(IllegalArgumentException.class, () -> PasswordPolicy.check("abc12", "USER", "ravi"));
        assertThrows(IllegalArgumentException.class, () -> PasswordPolicy.check(null, "USER", "ravi"));
    }

    @Test
    void staffNeedEightCharactersWithLettersAndNumbers() {
        PasswordPolicy.check("school2026", "TEACHER", "anita");
        PasswordPolicy.check("Admin1234", "ADMIN", "principal");
        assertThrows(IllegalArgumentException.class, () -> PasswordPolicy.check("abc123", "TEACHER", "anita"));
        assertThrows(IllegalArgumentException.class, () -> PasswordPolicy.check("abcdefgh", "ADMIN", "p"));
        assertThrows(IllegalArgumentException.class, () -> PasswordPolicy.check("12345678", "ADMIN", "p"));
    }

    @Test
    void passwordCannotBeTheUsername() {
        assertThrows(IllegalArgumentException.class, () -> PasswordPolicy.check("Ravi123", "USER", "ravi123"));
    }
}
