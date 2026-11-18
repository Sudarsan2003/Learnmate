package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.service.PushService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * The LearnMate app registers the phone it's running on after login (so new
 * quizzes, messages and results show up as phone notifications) and removes it
 * on logout.
 */
@RestController
@RequestMapping("/api/me/push-token")
public class PushTokenController {

    private final PushService push;

    public PushTokenController(PushService push) {
        this.push = push;
    }

    public record TokenRequest(String token, String platform) {}

    @PostMapping
    public ResponseEntity<Map<String, Object>> register(@RequestBody TokenRequest request, Authentication auth) {
        if (!PushService.looksLikeExpoToken(request.token())) {
            return ResponseEntity.badRequest().body(Map.of("message", "Not a valid push token."));
        }
        push.register(auth.getName(), request.token(), request.platform());
        return ResponseEntity.ok(Map.of("registered", true));
    }

    @DeleteMapping
    public ResponseEntity<Void> unregister(@RequestBody(required = false) TokenRequest request, Authentication auth) {
        if (request != null) push.unregister(auth.getName(), request.token());
        return ResponseEntity.noContent().build();
    }
}
