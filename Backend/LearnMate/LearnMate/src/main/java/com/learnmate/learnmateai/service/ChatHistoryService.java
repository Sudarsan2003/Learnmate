package com.learnmate.learnmateai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.learnmate.learnmateai.dto.RetrievedChunk;
import com.learnmate.learnmateai.model.ChatMessage;
import com.learnmate.learnmateai.repository.ChatMessageRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class ChatHistoryService {

    private final ChatMessageRepository repository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ChatHistoryService(ChatMessageRepository repository) {
        this.repository = repository;
    }

    public void saveLearnerMessage(String ownerUsername, String sessionId, String content, String subject, String level) {
        ChatMessage msg = new ChatMessage();
        msg.setOwnerUsername(ownerUsername);
        msg.setSessionId(sessionId);
        msg.setRole("learner");
        msg.setContent(content);
        msg.setSubject(subject);
        msg.setLevel(level);
        repository.save(msg);
    }

    public void saveTutorMessage(String ownerUsername, String sessionId, String content, String subject, String level,
                                 List<RetrievedChunk> citations) {
        ChatMessage msg = new ChatMessage();
        msg.setOwnerUsername(ownerUsername);
        msg.setSessionId(sessionId);
        msg.setRole("tutor");
        msg.setContent(content);
        msg.setSubject(subject);
        msg.setLevel(level);
        try {
            msg.setCitationsJson(objectMapper.writeValueAsString(citations));
        } catch (Exception e) {
            msg.setCitationsJson("[]");
        }
        repository.save(msg);
    }

    public List<ChatMessage> getHistory(String ownerUsername) {
        return repository.findByOwnerUsernameOrderByCreatedAtAsc(ownerUsername);
    }

    public List<ChatMessage> getSessionHistory(String ownerUsername, String sessionId) {
        return repository.findByOwnerUsernameAndSessionIdOrderByCreatedAtAsc(ownerUsername, sessionId);
    }

    public List<Map<String, Object>> getSessions(String ownerUsername) {
        return repository.findSessionSummaries(ownerUsername).stream()
                .filter(s -> s.getSessionId() != null)
                .map(s -> Map.<String, Object>of(
                        "sessionId", s.getSessionId(),
                        "title", truncate(s.getFirstMessage(), 60),
                        "lastMessageAt", s.getLastMessageAt()
                ))
                .collect(Collectors.toList());
    }
    public void clearHistory(String ownerUsername) {
        repository.deleteByOwnerUsername(ownerUsername);
    }

    public void clearSession(String ownerUsername, String sessionId) {
        repository.deleteByOwnerUsernameAndSessionId(ownerUsername, sessionId);
    }

    private String truncate(String text, int max) {
        if (text == null) return "New chat";
        return text.length() <= max ? text : text.substring(0, max) + "…";
    }
}