package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.model.User;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ConsentTest {

    private static User user(String role) {
        User u = new User();
        u.setRole(role);
        return u;
    }

    @Test
    void newAndOldAccountsMustAgree() {
        User u = user("USER");
        assertThat(Consent.needed(u)).isTrue();

        u.setConsentAt(java.time.Instant.now());
        u.setConsentVersion("2020-01-01"); // agreed to an older policy
        assertThat(Consent.needed(u)).isTrue();
    }

    @Test
    void recordingConsentSatisfiesTheCurrentVersion() {
        User u = user("USER");
        Consent.record(u, Consent.byForSelf(u), "  Lakshmi R  ");
        assertThat(Consent.needed(u)).isFalse();
        assertThat(u.getConsentBy()).isEqualTo(Consent.BY_PARENT);
        assertThat(u.getConsentVersion()).isEqualTo(Consent.VERSION);
        assertThat(u.getGuardianName()).isEqualTo("Lakshmi R");
    }

    @Test
    void staffAgreeForThemselves() {
        assertThat(Consent.byForSelf(user("TEACHER"))).isEqualTo(Consent.BY_STAFF);
        assertThat(Consent.byForSelf(user("ADMIN"))).isEqualTo(Consent.BY_STAFF);
    }

    @Test
    void blankGuardianNameIsNotStored() {
        User u = user("USER");
        Consent.record(u, Consent.BY_SCHOOL, "   ");
        assertThat(u.getGuardianName()).isNull();
        assertThat(u.getConsentBy()).isEqualTo(Consent.BY_SCHOOL);
    }
}
