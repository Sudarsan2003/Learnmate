package com.learnmate.learnmateai.agent;

import com.learnmate.learnmateai.llm.LlmClient;
import com.learnmate.learnmateai.dto.RetrievedChunk;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

@Component
public class LearningAgent {

    private final LlmClient llmClient;

    public LearningAgent(LlmClient llmClient) {
        this.llmClient = llmClient;
    }

    public String explain(String query, String level, List<RetrievedChunk> chunks) {

        if (chunks.isEmpty()) {
            return "No relevant study material was found in the knowledge base for this question.";
        }

        String context = chunks.stream()
                .map(c -> "[Source: %s]\n%s".formatted(c.sourceId(), c.content()))
                .collect(Collectors.joining("\n\n---\n\n"));

        String levelGuidance = switch (level == null ? "" : level.toLowerCase()) {
            case "beginner" -> "Assume no prior background. Define any technical term the first time you use it. Favor plain language and concrete analogies over jargon.";
            case "advanced" -> "Assume strong prior knowledge. Skip basic definitions, focus on nuance, edge cases, and precise technical detail.";
            default -> "Assume some familiarity with the topic but not deep expertise. Briefly clarify technical terms without over-explaining.";
        };

        String languageGuidance = buildLanguageGuidance(query);

        String system = """
                You are LearnMate, an AI tutor that writes clear, well-organized explanations
                grounded strictly in the study material provided below.

                AUDIENCE LEVEL: %s
                %s

                LANGUAGE:
                %s

                RESPONSE STRUCTURE (follow exactly, using Markdown):

                1. Open with a concise 2-3 sentence overview that directly answers the question.
                2. Follow with a "**Key Points**" section as clean bullet points — one idea per
                   bullet, no repetition, no filler.
                3. If the material includes a natural sequence, process, or comparison, present it
                   as a short numbered list or table instead of prose.
                4. Close with a one-sentence "**In short:**" summary.

                RULES:
                - Use ONLY the provided context — never rely on outside knowledge.
                - Write in a professional, confident, encouraging tone. No hedging phrases like
                  "it seems" or "the context suggests" unless the material is genuinely ambiguous.
                - Silently ignore page numbers, headers, footers, indexes, and any incomplete or
                  fragment sentences from the source material — do not mention that you're ignoring them.
                - Do not include source code unless the question explicitly asks for code.
                - If multiple sources cover the same idea, merge them into one clean point instead
                  of listing near-duplicates.
                - If the context does not contain enough information to answer, say so plainly in
                  1-2 sentences — do not pad this out or apologize excessively.
                - End every response with a "**Sources:**" line listing the distinct source names used.
                """.formatted(
                level == null || level.isBlank() ? "general" : level,
                levelGuidance,
                languageGuidance
        );

        String user = """
                CONTEXT:
                %s

                QUESTION:
                %s
                """.formatted(context, query);

        return llmClient.complete(system, user);
    }

    /**
     * Auto-detects Telugu/Hindi script in the student's question and
     * instructs the LLM to answer in that language, since the source
     * material (context chunks) is typically in English even when the
     * student thinks/asks in their native language. This is script-based
     * detection only — Romanized Telugu/Hindi typed in Latin letters
     * (e.g. "idi ela pani chestundi") is not caught yet.
     */
    private String buildLanguageGuidance(String query) {
        boolean hasTelugu = query.codePoints().anyMatch(cp -> cp >= 0x0C00 && cp <= 0x0C7F);
        boolean hasHindi = query.codePoints().anyMatch(cp -> cp >= 0x0900 && cp <= 0x097F);

        if (hasTelugu) {
            return "The student asked in Telugu. Answer primarily in Telugu, the way a Telugu-medium "
                    + "teacher would explain to a student. Keep technical/scientific terms and formulas in "
                    + "English where that's how Indian students actually learn them (e.g. 'Newton's Second Law', "
                    + "'photosynthesis', chemical formulas) but explain the concept itself in Telugu.";
        }
        if (hasHindi) {
            return "The student asked in Hindi. Answer primarily in Hindi, the way a Hindi-medium "
                    + "teacher would explain to a student. Keep technical/scientific terms and formulas in "
                    + "English where that's standard in Indian classrooms, but explain the concept itself in Hindi.";
        }
        return "Answer in clear, simple English suitable for an exam-prep student.";
    }
}