package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.model.ChatQuizAttempt;
import com.learnmate.learnmateai.service.ChatQuizAttemptService;
import com.learnmate.learnmateai.service.ChatQuizAttemptService.AttemptDetail;
import com.learnmate.learnmateai.service.ChatQuizAttemptService.AttemptState;
import com.learnmate.learnmateai.service.ChatQuizAttemptService.AttemptSummary;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/** A student only ever sees their own practice quizzes (every query is scoped by username). */
@RestController
@CrossOrigin(origins = "*")
public class ChatQuizResultsController {

    private static final Logger log = LoggerFactory.getLogger(ChatQuizResultsController.class);

    /** Body for saving progress: question number (as a string key) to the student's answer. */
    public record SaveAnswersRequest(Map<String, String> answers) {
    }

    private final ChatQuizAttemptService service;

    public ChatQuizResultsController(ChatQuizAttemptService service) {
        this.service = service;
    }

    // ------------------------------------------------------------ finished quizzes

    @GetMapping("/api/chat-quiz/results")
    public List<AttemptSummary> results(Authentication auth) {
        return service.list(auth.getName());
    }

    @GetMapping("/api/chat-quiz/results/{id}")
    public ResponseEntity<AttemptDetail> result(@PathVariable Long id, Authentication auth) {
        return service.detail(id, auth.getName())
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    // ------------------------------------------------------------ taking a quiz in chat

    /** Loads the quiz card: questions (no answers), saved progress, and the result once graded. */
    @GetMapping("/api/chat-quiz/attempts/{id}")
    public ResponseEntity<AttemptState> attempt(@PathVariable Long id, Authentication auth) {
        return service.find(id, auth.getName())
                .map(a -> ResponseEntity.ok(service.state(a)))
                .orElse(ResponseEntity.notFound().build());
    }

    /** Autosave: replaces the saved answers with the map the card sends. */
    @PutMapping("/api/chat-quiz/attempts/{id}/answers")
    public ResponseEntity<Void> saveAnswers(@PathVariable Long id,
                                            @RequestBody SaveAnswersRequest body,
                                            Authentication auth) {
        Optional<ChatQuizAttempt> found = service.find(id, auth.getName());
        if (found.isEmpty()) return ResponseEntity.notFound().build();
        if (!ChatQuizAttempt.IN_PROGRESS.equals(found.get().getStatus())) {
            return ResponseEntity.status(409).build();   // already submitted or closed
        }
        service.saveProgress(found.get(), body == null ? null : body.answers());
        return ResponseEntity.noContent().build();
    }

    /** Grades the saved answers and returns the full result. Calling it twice is harmless. */
    @PostMapping("/api/chat-quiz/attempts/{id}/submit")
    public ResponseEntity<AttemptDetail> submit(@PathVariable Long id, Authentication auth) {
        Optional<ChatQuizAttempt> found = service.find(id, auth.getName());
        if (found.isEmpty()) return ResponseEntity.notFound().build();

        ChatQuizAttempt a = found.get();
        if (ChatQuizAttempt.ABANDONED.equals(a.getStatus())) {
            return ResponseEntity.status(409).build();
        }
        try {
            return ResponseEntity.ok(service.detailOf(service.submit(a)));
        } catch (RuntimeException e) {
            log.error("Submitting quiz attempt {} failed", id, e);
            return ResponseEntity.status(500).build();   // answers stay saved; the card lets them retry
        }
    }
}