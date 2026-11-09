package com.learnmate.learnmateai.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Slows down password guessing. Every account and every network address gets
 * a limited number of failed sign-ins in a rolling window; past it, sign-in is
 * refused until the oldest failure in the window is old enough.
 *
 * The network limit is set high on purpose: a whole school lab often shares
 * one internet address, and children mistype passwords. The per-account limit
 * is the real protection; the network limit stops one machine trying many
 * accounts. Counts live in memory (one LearnMate server), so a restart clears them.
 */
@Service
public class LoginAttemptService {

    static final int MAX_ACCOUNT_FAILURES = 8;
    static final int MAX_NETWORK_FAILURES = 50;
    static final Duration WINDOW = Duration.ofMinutes(15);
    private static final int CLEANUP_ABOVE = 20_000;

    private final Clock clock;
    private final Map<String, Deque<Instant>> failures = new ConcurrentHashMap<>();

    @Autowired
    public LoginAttemptService() {
        this(Clock.systemUTC());
    }

    LoginAttemptService(Clock clock) {
        this.clock = clock;
    }

    /** Thrown when sign-in is paused; answered with HTTP 429. */
    public static class TooManyLoginAttemptsException extends RuntimeException {
        public TooManyLoginAttemptsException(String message) {
            super(message);
        }
    }

    /** Refuses the sign-in before the password is even checked, if either limit is reached. */
    public void checkAllowed(String username, String ip) {
        Duration accountWait = waitFor(accountKey(username), MAX_ACCOUNT_FAILURES);
        if (accountWait != null) {
            throw new TooManyLoginAttemptsException("Too many wrong passwords for this account. Please wait "
                    + minutes(accountWait) + " and try again, or ask your school admin to reset your password.");
        }
        Duration networkWait = waitFor(networkKey(ip), MAX_NETWORK_FAILURES);
        if (networkWait != null) {
            throw new TooManyLoginAttemptsException("Too many failed sign-ins from this network. Please wait "
                    + minutes(networkWait) + " and try again.");
        }
    }

    public void recordFailure(String username, String ip) {
        Instant now = clock.instant();
        add(accountKey(username), now);
        add(networkKey(ip), now);
        if (failures.size() > CLEANUP_ABOVE) {
            failures.entrySet().removeIf(e -> {
                synchronized (e.getValue()) {
                    prune(e.getValue(), now);
                    return e.getValue().isEmpty();
                }
            });
        }
    }

    /** A correct password clears that account's count (not the network's). */
    public void recordSuccess(String username) {
        failures.remove(accountKey(username));
    }

    /** An admin resetting the password lets the student straight back in. */
    public void clearAccount(String username) {
        failures.remove(accountKey(username));
    }

    /**
     * The visitor's address. Behind Cloudflare and nginx every request comes
     * from the proxy, so the forwarded headers are read first. They can be
     * faked by someone calling the server directly, which only lets them dodge
     * the network limit -- the per-account limit still applies.
     */
    public static String clientIp(HttpServletRequest request) {
        for (String header : new String[]{"CF-Connecting-IP", "X-Real-IP", "X-Forwarded-For"}) {
            String value = request.getHeader(header);
            if (value != null && !value.isBlank()) {
                return value.split(",")[0].trim();
            }
        }
        return request.getRemoteAddr();
    }

    private static String accountKey(String username) {
        return "account:" + (username == null ? "" : username.trim().toLowerCase(Locale.ROOT));
    }

    private static String networkKey(String ip) {
        return "network:" + (ip == null ? "" : ip);
    }

    private void add(String key, Instant now) {
        Deque<Instant> q = failures.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (q) {
            prune(q, now);
            q.addLast(now);
        }
    }

    /** How long until sign-in is allowed again, or null if it is allowed now. */
    private Duration waitFor(String key, int max) {
        Deque<Instant> q = failures.get(key);
        if (q == null) return null;
        Instant now = clock.instant();
        synchronized (q) {
            prune(q, now);
            if (q.size() < max) return null;
            // Allowed again once enough of the oldest failures have aged out.
            Instant unblock = q.stream().skip(q.size() - max).findFirst().orElse(now).plus(WINDOW);
            return Duration.between(now, unblock);
        }
    }

    private static void prune(Deque<Instant> q, Instant now) {
        Instant cutoff = now.minus(WINDOW);
        while (!q.isEmpty() && q.peekFirst().isBefore(cutoff)) q.pollFirst();
    }

    private static String minutes(Duration d) {
        long m = Math.max(1, (d.toSeconds() + 59) / 60);
        return m == 1 ? "1 minute" : m + " minutes";
    }
}
