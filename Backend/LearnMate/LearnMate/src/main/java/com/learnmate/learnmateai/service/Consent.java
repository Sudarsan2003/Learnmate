package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.model.User;

import java.time.Instant;

/**
 * Consent to LearnMate's Privacy Policy and Terms (frontend public/privacy-policy.html
 * and terms.html). When either page changes in a way users must agree to again,
 * change VERSION: everyone is asked once more on their next sign-in.
 */
public final class Consent {

    /** The effective date printed on the Privacy Policy and Terms pages. */
    public static final String VERSION = "2026-11-10";

    public static final String BY_PARENT = "PARENT";
    public static final String BY_SCHOOL = "SCHOOL";
    public static final String BY_STAFF = "STAFF";

    private Consent() {}

    /** True when {@code user} hasn't agreed to the current version yet. */
    public static boolean needed(User user) {
        return user.getConsentAt() == null || !VERSION.equals(user.getConsentVersion());
    }

    /**
     * Records agreement to the current version. A student's consent is given by a
     * parent or guardian; staff agree for themselves.
     */
    public static void record(User user, String by, String guardianName) {
        user.setConsentAt(Instant.now());
        user.setConsentVersion(VERSION);
        user.setConsentBy(by);
        String g = guardianName == null ? "" : guardianName.trim();
        if (!g.isEmpty()) user.setGuardianName(g.length() > 120 ? g.substring(0, 120) : g);
    }

    /** Who gives consent when {@code user} agrees in the app: a parent for a student, else the user. */
    public static String byForSelf(User user) {
        return "USER".equals(user.getRole()) ? BY_PARENT : BY_STAFF;
    }
}
