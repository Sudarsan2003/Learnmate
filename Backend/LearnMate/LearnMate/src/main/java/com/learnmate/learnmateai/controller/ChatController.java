package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.dto.ChatRequest;
import com.learnmate.learnmateai.dto.ChatResponse;
import com.learnmate.learnmateai.model.ChatMessage;
import com.learnmate.learnmateai.model.LearningHistory;
import com.learnmate.learnmateai.orchestrator.AgentOrchestrator;
import com.learnmate.learnmateai.repository.LearningHistoryRepository;
import com.learnmate.learnmateai.service.ChatHistoryService;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@CrossOrigin(origins = "*")
public class ChatController {

    private final AgentOrchestrator orchestrator;
    private final ChatHistoryService chatHistoryService;
    private final LearningHistoryRepository historyRepository;

    public ChatController(AgentOrchestrator orchestrator,
                          ChatHistoryService chatHistoryService,
                          LearningHistoryRepository historyRepository) {
        this.orchestrator = orchestrator;
        this.chatHistoryService = chatHistoryService;
        this.historyRepository = historyRepository;
    }

    @PostMapping("/api/chat")
    public ChatResponse chat(@Valid @RequestBody ChatRequest request, Authentication auth) {
        ChatResponse response = orchestrator.handle(request);

        // --- persisted per-user chat history (drives the chat UI + ProfileMenu/history endpoint) ---
        chatHistoryService.saveLearnerMessage(
                auth.getName(),
                request.query(),
                request.subject(),
                request.level()
        );

        chatHistoryService.saveTutorMessage(
                auth.getName(),
                response.answer(),
                request.subject(),
                request.level(),
                response.citations()
        );

        // --- flat analytics log, kept solely for admin reporting (query+answer per row) ---
        LearningHistory history = new LearningHistory();
        history.setUsername(auth.getName());
        history.setQuery(request.query());
        history.setAnswer(response.answer());
        history.setSubject(request.subject());
        history.setLevel(request.level());
        historyRepository.save(history);

        return response;
    }

    @GetMapping("/api/chat/history")
    public List<ChatMessage> history(Authentication auth) {
        return chatHistoryService.getHistory(auth.getName());
    }

    @DeleteMapping("/api/chat/history")
    public void clearHistory(Authentication auth) {
        chatHistoryService.clearHistory(auth.getName());
    }
}