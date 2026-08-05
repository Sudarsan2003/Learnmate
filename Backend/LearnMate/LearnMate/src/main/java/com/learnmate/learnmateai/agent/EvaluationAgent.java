package com.learnmate.learnmateai.agent;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.learnmate.learnmateai.dto.QuizCreateRequest;
import com.learnmate.learnmateai.dto.RetrievedChunk;
import com.learnmate.learnmateai.llm.LlmClient;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

@Component
public class EvaluationAgent {

    private final LlmClient llmClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

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

    /**
     * Generates `count` multiple-choice questions strictly from the given
     * study material chunks. Used when an admin requests AI-generated
     * questions for a quiz (either alone or mixed with manual ones).
     */
    public List<QuizCreateRequest.ManualQuestion> generateMcqQuestions(List<RetrievedChunk> chunks, int count) {
        String context = chunks.stream()
                .map(RetrievedChunk::content)
                .collect(Collectors.joining("\n\n---\n\n"));

        String system = """
                You write exam-style multiple-choice questions strictly from the study
                material provided. Each question must have exactly 4 options and exactly
                one correct answer.

                Respond with ONLY a raw JSON array, no markdown fences, no commentary,
                in exactly this shape:
                [
                  {
                    "questionText": "...",
                    "optionA": "...",
                    "optionB": "...",
                    "optionC": "...",
                    "optionD": "...",
                    "correctOption": "A"
                  }
                ]

                Generate exactly %d questions. Vary difficulty. Do not repeat the same
                fact across multiple questions. correctOption must be exactly one of
                "A", "B", "C", "D".
                """.formatted(count);

        String user = "STUDY MATERIAL:\n" + context;

        String raw = llmClient.complete(system, user);
        String cleaned = raw.replaceAll("```json", "").replaceAll("```", "").trim();

        try {
            QuizCreateRequest.ManualQuestion[] parsed =
                    objectMapper.readValue(cleaned, QuizCreateRequest.ManualQuestion[].class);
            return List.of(parsed);
        } catch (Exception e) {
            throw new RuntimeException("Failed to parse AI-generated quiz questions: " + e.getMessage(), e);
        }
    }
    public String explainQuizAnswer(String quizContext, String studentQuestion) {
        String systemPrompt = """
            You are LearnMate, helping a student understand a quiz they just
            completed. Only answer using the quiz questions, options, correct
            answers, and the student's own responses provided below. If the
            student asks about anything outside these quiz questions, politely
            say you can only discuss this quiz and redirect them back to it.
            Explain the reasoning behind the correct answer clearly and kindly.
            """;
        String userPrompt = quizContext + "\nStudent's question: " + studentQuestion;
        return llmClient.complete(systemPrompt, userPrompt);
    }
}