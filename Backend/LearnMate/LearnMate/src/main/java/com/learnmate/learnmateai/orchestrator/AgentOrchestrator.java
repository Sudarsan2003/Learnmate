package com.learnmate.learnmateai.orchestrator;

import com.learnmate.learnmateai.agent.LearningAgent;
import com.learnmate.learnmateai.agent.RetrievalAgent;
import com.learnmate.learnmateai.dto.ChatRequest;
import com.learnmate.learnmateai.dto.ChatResponse;
import com.learnmate.learnmateai.model.ChatMessage;
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.UserRepository;
import com.learnmate.learnmateai.service.ChatHistoryService;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class AgentOrchestrator {

    private final RetrievalAgent retrievalAgent;
    private final LearningAgent learningAgent;
    private final ChatHistoryService chatHistoryService;
    private final UserRepository userRepository;

    public AgentOrchestrator(RetrievalAgent retrievalAgent, LearningAgent learningAgent,
                             ChatHistoryService chatHistoryService, UserRepository userRepository) {
        this.retrievalAgent = retrievalAgent;
        this.learningAgent = learningAgent;
        this.chatHistoryService = chatHistoryService;
        this.userRepository = userRepository;
    }

    public ChatResponse handle(ChatRequest req, String ownerUsername) {
        User user = userRepository.findByUsername(ownerUsername)
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));

        List<ChatMessage> history = (req.sessionId() != null && !req.sessionId().isBlank())
                ? chatHistoryService.getSessionHistory(ownerUsername, req.sessionId())
                : List.of();

        String retrievalQuery = buildRetrievalQuery(req.query(), history);

        // Retrieval is scoped by institution + standard only. Subject is an
        // optional free-text tag set at upload time (see DocumentController),
        // so it's inconsistent across documents and easy to mismatch against
        // whatever the chat request happens to send — that mismatch was
        // silently filtering out every chunk for a student's own class
        // folder. A student should be able to ask about anything ingested
        // for their standard, not just docs tagged with one exact subject.
        var chunks = retrievalAgent.retrieve(retrievalQuery, null, user.getInstitution(), user.getStandard(), 5);
        var answer = learningAgent.explain(req.query(), req.level(), chunks, history);
        return new ChatResponse(answer, chunks, null);
    }

    /**
     * Short follow-ups ("give in telugu and hindi", "explain more", "what about X")
     * carry no retrievable topic on their own — the embedding/hybrid search has
     * nothing to match against and pulls random chunks. For short queries,
     * prepend the student's last question so retrieval still has the real
     * topic to search against.
     */
    private String buildRetrievalQuery(String currentQuery, List<ChatMessage> history) {
        int wordCount = currentQuery.trim().split("\\s+").length;
        if (wordCount > 6 || history.isEmpty()) {
            return currentQuery;
        }

        String lastLearnerQuery = history.stream()
                .filter(m -> "learner".equals(m.getRole()))
                .reduce((first, second) -> second) // last learner message
                .map(ChatMessage::getContent)
                .orElse(null);

        if (lastLearnerQuery == null || lastLearnerQuery.isBlank()) {
            return currentQuery;
        }

        return lastLearnerQuery + " " + currentQuery;
    }
}