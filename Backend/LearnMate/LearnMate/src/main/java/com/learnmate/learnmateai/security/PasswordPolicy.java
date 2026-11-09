package com.learnmate.learnmateai.security;

/**
 * Password rules. Students keep a simple 6-character minimum (young children
 * sign in on shared phones); teachers and admins, whose accounts can see a
 * whole school's data, need at least 8 characters with letters and numbers.
 * Every place that sets a password goes through {@link #check}.
 */
public final class PasswordPolicy {

    static final int MIN_LENGTH = 6;
    static final int STAFF_MIN_LENGTH = 8;

    private PasswordPolicy() {
    }

    public static boolean isStaff(String role) {
        return "ADMIN".equals(role) || "TEACHER".equals(role);
    }

    /** Throws IllegalArgumentException (shown to the user) if the password breaks a rule. */
    public static void check(String password, String role, String username) {
        if (password == null || password.length() < MIN_LENGTH) {
            throw new IllegalArgumentException("Password must be at least " + MIN_LENGTH + " characters.");
        }
        if (isStaff(role) && (password.length() < STAFF_MIN_LENGTH
                || !password.matches(".*[A-Za-z].*") || !password.matches(".*[0-9].*"))) {
            throw new IllegalArgumentException("Teacher and admin passwords must be at least " + STAFF_MIN_LENGTH
                    + " characters and include both letters and numbers.");
        }
        if (username != null && password.trim().equalsIgnoreCase(username.trim())) {
            throw new IllegalArgumentException("Password can't be the same as the username.");
        }
    }
}
