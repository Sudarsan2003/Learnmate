package com.learnmate.learnmateai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.learnmate.learnmateai.dto.RetrievedChunk;
import com.learnmate.learnmateai.model.ChatMessage;
import com.learnmate.learnmateai.repository.ChatMessageRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class ChatHistoryService {

    private final ChatMessageRepository repository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ChatHistoryService(ChatMessageRepository repository) {
        this.repository = repository;
    }

    public void saveLearnerMessage(String ownerUsername, String content, String subject, String level) {
        ChatMessage msg = new ChatMessage();
        msg.setOwnerUsername(ownerUsername);
        msg.setRole("learner");
        msg.setContent(content);
        msg.setSubject(subject);
        msg.setLevel(level);
        repository.save(msg);
    }

    public void saveTutorMessage(String ownerUsername, String content, String subject, String level,
                                 List<RetrievedChunk> citations) {
        ChatMessage msg = new ChatMessage();
        msg.setOwnerUsername(ownerUsername);
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

    public void clearHistory(String ownerUsername) {
        repository.deleteByOwnerUsername(ownerUsername);
    }
}