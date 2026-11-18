package com.learnmate.learnmateai.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.learnmate.learnmateai.model.PushToken;
import com.learnmate.learnmateai.repository.PushTokenRepository;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Phone notifications for the LearnMate app, sent through the Expo push service
 * (which hands them to Firebase on Android and Apple on iOS). Every bell
 * notification is also pushed to the user's phones, so a new quiz or message
 * shows up like a WhatsApp notification even when the app is closed.
 *
 * Sending happens on a background thread after the database change commits, so
 * a slow or unreachable push service never slows down or breaks a request.
 */
@Service
public class PushService {

    private static final Logger log = LoggerFactory.getLogger(PushService.class);
    private static final URI EXPO_SEND = URI.create("https://exp.host/--/api/v2/push/send");
    private static final int BATCH = 100; // Expo's limit per request
    public static final String CHANNEL = "default"; // must match the channel the app creates

    private final PushTokenRepository tokens;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final ExecutorService sender = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "push-sender");
        t.setDaemon(true);
        return t;
    });

    public PushService(PushTokenRepository tokens) {
        this.tokens = tokens;
    }

    @PreDestroy
    void stop() {
        sender.shutdown();
    }

    public static boolean looksLikeExpoToken(String token) {
        return token != null && token.length() < 255
                && (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[")) && token.endsWith("]");
    }

    /** This phone now belongs to {@code username} (whoever last logged in on it). */
    public void register(String username, String token, String platform) {
        if (!looksLikeExpoToken(token)) throw new IllegalArgumentException("Not a valid push token.");
        PushToken p = tokens.findByToken(token).orElseGet(PushToken::new);
        p.setToken(token);
        p.setUsername(username);
        p.setPlatform(platform == null ? null : platform.toLowerCase(Locale.ROOT));
        p.setUpdatedAt(Instant.now());
        tokens.save(p);
    }

    /** Logging out on a phone stops its notifications. */
    public void unregister(String username, String token) {
        if (token != null) tokens.deleteByTokenAndUsername(token, username);
    }

    /**
     * Pushes a notification to every phone of these users. {@code link} is the
     * same screen link the bell uses ("quizzes", "messages:ravi"), so tapping
     * the phone notification opens that screen in the app.
     */
    public void push(Collection<String> usernames, String title, String body, String link) {
        if (usernames == null || usernames.isEmpty()) return;
        List<String> who = List.copyOf(usernames);
        Runnable job = () -> sender.execute(() -> {
            try {
                send(who, title, body, link);
            } catch (Exception e) {
                log.warn("Push notification failed: {}", e.getMessage());
            }
        });
        // After the commit: the notification the phone opens must already exist.
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    job.run();
                }
            });
        } else {
            job.run();
        }
    }

    private void send(List<String> usernames, String title, String body, String link) throws Exception {
        List<PushToken> targets = tokens.findByUsernameIn(usernames);
        if (targets.isEmpty()) return;
        for (int from = 0; from < targets.size(); from += BATCH) {
            List<PushToken> batch = targets.subList(from, Math.min(from + BATCH, targets.size()));
            List<Map<String, Object>> messages = new ArrayList<>();
            for (PushToken t : batch) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("to", t.getToken());
                m.put("title", title);
                if (body != null && !body.isBlank()) m.put("body", body.length() > 180 ? body.substring(0, 177) + "…" : body);
                m.put("sound", "default");
                m.put("priority", "high");
                m.put("channelId", CHANNEL);
                m.put("data", link == null ? Map.of() : Map.of("link", link));
                messages.add(m);
            }
            HttpRequest request = HttpRequest.newBuilder(EXPO_SEND)
                    .timeout(Duration.ofSeconds(20))
                    .header("Accept", "application/json")
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(messages)))
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                log.warn("Expo push service answered {}: {}", response.statusCode(), response.body());
                continue;
            }
            forgetUnregistered(batch, mapper.readTree(response.body()).path("data"));
        }
    }

    // Tickets come back in the same order as the messages. A phone that
    // uninstalled the app or turned notifications off is dropped.
    private void forgetUnregistered(List<PushToken> batch, JsonNode tickets) {
        if (!tickets.isArray()) return;
        for (int i = 0; i < tickets.size() && i < batch.size(); i++) {
            JsonNode ticket = tickets.get(i);
            if ("error".equals(ticket.path("status").asText())) {
                String error = ticket.path("details").path("error").asText("");
                if ("DeviceNotRegistered".equals(error)) {
                    tokens.deleteByToken(batch.get(i).getToken());
                } else {
                    log.warn("Push to {} failed: {} {}", batch.get(i).getUsername(), error, ticket.path("message").asText(""));
                }
            }
        }
    }
}
