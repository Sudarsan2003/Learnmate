package com.learnmate.learnmateai.security;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.*;

class LoginAttemptServiceTest {

    /** A clock the test can move forward. */
    static class MovableClock extends Clock {
        Instant now = Instant.parse("2026-11-09T10:00:00Z");
        @Override public ZoneOffset getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(java.time.ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
        void advance(Duration d) { now = now.plus(d); }
    }

    @Test
    void pausesAnAccountAfterTooManyWrongPasswordsAndLetsItBackLater() {
        MovableClock clock = new MovableClock();
        LoginAttemptService s = new LoginAttemptService(clock);
        for (int i = 0; i < LoginAttemptService.MAX_ACCOUNT_FAILURES - 1; i++) {
            s.checkAllowed("Ravi", "1.1.1.1");
            s.recordFailure("Ravi", "1.1.1.1");
        }
        s.checkAllowed("ravi", "1.1.1.1"); // one more try is still allowed
        s.recordFailure("ravi", "1.1.1.1");

        var e = assertThrows(LoginAttemptService.TooManyLoginAttemptsException.class,
                () -> s.checkAllowed("RAVI", "9.9.9.9")); // any case, any network
        assertTrue(e.getMessage().contains("15 minutes"), e.getMessage());

        s.checkAllowed("sita", "1.1.1.1"); // other accounts are unaffected

        clock.advance(LoginAttemptService.WINDOW.plusSeconds(1));
        s.checkAllowed("ravi", "1.1.1.1");
    }

    @Test
    void correctPasswordOrAdminResetClearsTheCount() {
        LoginAttemptService s = new LoginAttemptService(new MovableClock());
        for (int i = 0; i < LoginAttemptService.MAX_ACCOUNT_FAILURES; i++) s.recordFailure("anu", "2.2.2.2");
        assertThrows(LoginAttemptService.TooManyLoginAttemptsException.class, () -> s.checkAllowed("anu", "2.2.2.2"));
        s.clearAccount("anu");
        s.checkAllowed("anu", "3.3.3.3");

        for (int i = 0; i < LoginAttemptService.MAX_ACCOUNT_FAILURES - 1; i++) s.recordFailure("anu", "3.3.3.3");
        s.recordSuccess("anu");
        s.recordFailure("anu", "3.3.3.3");
        s.checkAllowed("anu", "3.3.3.3");
    }

    @Test
    void pausesANetworkTryingManyAccounts() {
        LoginAttemptService s = new LoginAttemptService(new MovableClock());
        for (int i = 0; i < LoginAttemptService.MAX_NETWORK_FAILURES; i++) s.recordFailure("user" + i, "5.5.5.5");
        var e = assertThrows(LoginAttemptService.TooManyLoginAttemptsException.class,
                () -> s.checkAllowed("someone-new", "5.5.5.5"));
        assertTrue(e.getMessage().contains("network"));
        s.checkAllowed("someone-new", "6.6.6.6");
    }
}
