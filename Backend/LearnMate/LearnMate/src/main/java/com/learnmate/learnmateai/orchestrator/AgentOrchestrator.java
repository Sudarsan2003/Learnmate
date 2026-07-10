package com.learnmate.learnmateai.orchestrator;

import com.learnmate.learnmateai.agent.LearningAgent;
import com.learnmate.learnmateai.agent.RetrievalAgent;
import com.learnmate.learnmateai.dto.ChatRequest;
import com.learnmate.learnmateai.dto.ChatResponse;
import org.springframework.stereotype.Component;

@Component
public class AgentOrchestrator {

    private final RetrievalAgent retrievalAgent;
    private final LearningAgent learningAgent;

    public AgentOrchestrator(RetrievalAgent retrievalAgent, LearningAgent learningAgent) {
        this.retrievalAgent = retrievalAgent;
        this.learningAgent = learningAgent;
    }

    public ChatResponse handle(ChatRequest req) {
        var chunks = retrievalAgent.retrieve(req.query(), req.subject(), 3);
        var answer = learningAgent.explain(req.query(), req.level(), chunks);
        return new ChatResponse(answer, chunks, null);
    }
}