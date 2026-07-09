package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.dto.ChatRequest;
import com.learnmate.learnmateai.dto.ChatResponse;
import com.learnmate.learnmateai.model.LearningHistory;
import com.learnmate.learnmateai.orchestrator.AgentOrchestrator;
import com.learnmate.learnmateai.repository.LearningHistoryRepository;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@CrossOrigin(origins = "*")
public class ChatController {

    private final AgentOrchestrator orchestrator;
    private final LearningHistoryRepository historyRepository;

    public ChatController(AgentOrchestrator orchestrator, LearningHistoryRepository historyRepository) {
        this.orchestrator = orchestrator;
        this.historyRepository = historyRepository;
    }

    @PostMapping("/api/chat")
    public ChatResponse chat(@Valid @RequestBody ChatRequest request, Authentication auth) {
        ChatResponse response = orchestrator.handle(request);

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
    public List<LearningHistory> history(Authentication auth) {
        return historyRepository.findByUsernameOrderByCreatedAtDesc(auth.getName());
    }
}