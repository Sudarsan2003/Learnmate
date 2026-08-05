package com.learnmate.learnmateai.orchestrator;

import com.learnmate.learnmateai.agent.LearningAgent;
import com.learnmate.learnmateai.agent.RetrievalAgent;
import com.learnmate.learnmateai.dto.ChatRequest;
import com.learnmate.learnmateai.dto.ChatResponse;
import com.learnmate.learnmateai.model.ChatMessage;
import com.learnmate.learnmateai.service.ChatHistoryService;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class AgentOrchestrator {

    private final RetrievalAgent retrievalAgent;
    private final LearningAgent learningAgent;
    private final ChatHistoryService chatHistoryService;

    public AgentOrchestrator(RetrievalAgent retrievalAgent, LearningAgent learningAgent,
                             ChatHistoryService chatHistoryService) {
        this.retrievalAgent = retrievalAgent;
        this.learningAgent = learningAgent;
        this.chatHistoryService = chatHistoryService;
    }

    public ChatResponse handle(ChatRequest req, String ownerUsername) {
        List<ChatMessage> history = (req.sessionId() != null && !req.sessionId().isBlank())
                ? chatHistoryService.getSessionHistory(ownerUsername, req.sessionId())
                : List.of();

        String retrievalQuery = buildRetrievalQuery(req.query(), history);

        var chunks = retrievalAgent.retrieve(retrievalQuery, req.subject(), 3);
        var answer = learningAgent.explain(req.query(), req.level(), chunks, history);
        return new ChatResponse(answer, chunks, null);
    }

    /**
     * Short follow-ups ("give in telugu and hindi", "explain more", "what about X")
     * carry no retrievable topic on their own — the embedding/hybrid search has
     * nothing to match against and pulls random chunks (seen in production: a
     * follow-up asking for a translation returned Spring Boot/React chunks
     * instead of the actual topic being discussed). For short queries, prepend
     * the student's last question so retrieval still has the real topic to
     * search against.
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