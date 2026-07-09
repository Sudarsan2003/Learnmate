package com.learnmate.learnmateai.agent;

import com.learnmate.learnmateai.llm.LlmClient;
import org.springframework.stereotype.Component;

@Component
public class EvaluationAgent {

    private final LlmClient llmClient;

    public EvaluationAgent(LlmClient llmClient) {
        this.llmClient = llmClient;
    }

    public String generateQuiz(String taughtMaterial) {
        String systemPrompt = """
                You generate one short quiz question (or coding challenge)
                based strictly on the material just taught. Keep it concise.
                """;
        return llmClient.complete(systemPrompt, taughtMaterial);
    }

    public String scoreAnswer(String question, String learnerAnswer) {
        String systemPrompt = """
                You grade a learner's answer to a quiz question. Give a
                short verdict (correct/partially correct/incorrect) plus
                one sentence of constructive feedback.
                """;
        String userPrompt = "Question: %s\nLearner answer: %s".formatted(question, learnerAnswer);
        return llmClient.complete(systemPrompt, userPrompt);
    }
}