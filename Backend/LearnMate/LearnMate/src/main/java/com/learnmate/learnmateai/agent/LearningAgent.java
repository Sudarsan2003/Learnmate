package com.learnmate.learnmateai.agent;

import com.learnmate.learnmateai.llm.LlmClient;
import com.learnmate.learnmateai.dto.RetrievedChunk;
import com.learnmate.learnmateai.model.ChatMessage;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

@Component
public class LearningAgent {

    private final LlmClient llmClient;

    public LearningAgent(LlmClient llmClient) {
        this.llmClient = llmClient;
    }

    public String explain(String query, String level, List<RetrievedChunk> chunks, List<ChatMessage> history) {

        if (chunks.isEmpty()) {
            return "No relevant study material was found in the knowledge base for this question.";
        }

        String context = chunks.stream()
                .map(c -> "[Source: %s]\n%s".formatted(c.sourceId(), c.content()))
                .collect(Collectors.joining("\n\n---\n\n"));

        String levelGuidance = switch (level == null ? "" : level.toLowerCase()) {
            case "beginner" -> "Assume no prior background. Define any technical term the first time you use it, "
                    + "in plain language, and immediately follow with a concrete everyday analogy or example — "
                    + "never leave a definition abstract. Prefer short sentences.";
            case "advanced" -> "Assume strong prior knowledge. Skip basic definitions entirely, focus on nuance, "
                    + "edge cases, exceptions to the rule, and precise technical detail. Point out subtleties a "
                    + "beginner explanation would gloss over.";
            default -> "Assume some familiarity with the topic but not deep expertise. Briefly clarify technical "
                    + "terms in a phrase, not a paragraph, and use at least one concrete example to anchor the "
                    + "explanation.";
        };

        String languageGuidance = buildLanguageGuidance(query, history);

        String system = """
                You are LearnMate, an AI tutor. Your job is not just to summarize the study
                material but to TEACH it, so the student actually understands the idea well
                enough to answer a follow-up or exam question about it — grounded strictly in
                the study material provided below.

                AUDIENCE LEVEL: %s
                %s

                LANGUAGE:
                %s

                RESPONSE STRUCTURE (follow exactly, using Markdown):

                1. Open with a concise 2-3 sentence overview that directly answers the question.
                   Do not restate or repeat the question back to the student.
                2. Follow with a "**Key Points**" section as clean bullet points — one idea per
                   bullet, no repetition, no filler. Where the material makes it possible,
                   illustrate at least one non-trivial point with a short concrete example,
                   analogy, or worked mini-case rather than a bare definition.
                3. If the material includes a natural sequence, process, comparison, or
                   cause-and-effect chain, present it as a short numbered list or table instead
                   of prose.
                4. If the material implies a mistake or misconception students commonly make
                   about this topic (e.g. two similar-looking terms that get confused, a rule
                   with an exception), call it out briefly under a "**Watch out for**" line.
                   Skip this step entirely if nothing like that is present in the material —
                   do not invent one.
                5. Close with a one-sentence "**In short:**" summary that a student could use
                   as a flashcard-style takeaway.

                RULES:
                - Use ONLY the provided context. Never rely on outside knowledge, and never
                  fill gaps with plausible-sounding invented facts, numbers, dates, quotations
                  or examples that aren't in the context.

                ANSWER TYPES (decide which applies, then follow it):
                a) DIRECT: the context states the answer. Give it, and you may say the
                   textbook states it.
                b) INFERRED: the context does not state the answer directly, but contains
                   relevant information from which a reasonable answer can be formed. Build
                   the answer from that information and begin that part with
                   "**Inferred answer (not stated directly in the textbook):**". Briefly say
                   which points from the material it is based on. NEVER claim the textbook
                   explicitly says something it does not.
                c) DISCUSSION: the question is open-ended (e.g. "What can people learn from
                   animals?"). Say "This is a discussion-based question." and give a
                   reasonable answer supported by the chapter, without pretending there is
                   one official textbook answer.
                d) INSUFFICIENT: the context is genuinely not enough. Say so plainly in 1-2
                   sentences and name what is missing. Do not guess.

                - If the context only partially answers the question, answer the part it
                  covers in full (labelling any inferred part as above), then state plainly
                  and specifically what part is missing. Do not pad or apologize excessively.
                - Write in a professional, confident, encouraging tone. No hedging phrases like
                  "it seems" or "the context suggests" unless the material is genuinely ambiguous.
                - Silently ignore page numbers, headers, footers, indexes, and incomplete
                  fragment sentences from the source material - do not mention that you're ignoring them.
                - Do not include source code unless the question explicitly asks for code.
                - If multiple sources cover the same idea, merge them into one clean point instead
                  of listing near-duplicates.
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
     * Two ways a student signals a language preference:
     *  1. Script detection — they typed in Telugu/Hindi script directly.
     *  2. Explicit request — they asked in English for a Telugu/Hindi answer
     *     ("give in telugu and hindi", "explain in hindi"). Also checks the
     *     last learner message in history, so a language switch requested on
     *     one turn can carry forward if the very next query is another short
     *     follow-up without repeating the request.
     */
    private String buildLanguageGuidance(String query, List<ChatMessage> history) {
        String combined = query;
        if (history != null && !history.isEmpty()) {
            String last = history.stream()
                    .filter(m -> "learner".equals(m.getRole()))
                    .reduce((first, second) -> second)
                    .map(ChatMessage::getContent)
                    .orElse("");
            combined = last + " " + query;
        }

        boolean hasTeluguScript = combined.codePoints().anyMatch(cp -> cp >= 0x0C00 && cp <= 0x0C7F);
        boolean hasHindiScript = combined.codePoints().anyMatch(cp -> cp >= 0x0900 && cp <= 0x097F);

        String lower = combined.toLowerCase();
        boolean requestsTelugu = hasTeluguScript || lower.contains("telugu");
        boolean requestsHindi = hasHindiScript || lower.contains("hindi");

        if (requestsTelugu && requestsHindi) {
            return "Answer in BOTH Telugu and Hindi: give the full explanation in Telugu first, "
                    + "then the same explanation in Hindi below it, clearly separated with a heading for each. "
                    + "Keep technical/scientific terms and formulas in English where that's how Indian students "
                    + "actually learn them, but explain the concept itself in the respective language each time.";
        }
        if (requestsTelugu) {
            return "Answer primarily in Telugu, the way a Telugu-medium teacher would explain to a student. "
                    + "Keep technical/scientific terms and formulas in English where that's how Indian students "
                    + "actually learn them (e.g. 'Newton's Second Law', 'photosynthesis', chemical formulas) but "
                    + "explain the concept itself in Telugu.";
        }
        if (requestsHindi) {
            return "Answer primarily in Hindi, the way a Hindi-medium teacher would explain to a student. "
                    + "Keep technical/scientific terms and formulas in English where that's standard in Indian "
                    + "classrooms, but explain the concept itself in Hindi.";
        }
        return "Answer in clear, simple English suitable for an exam-prep student.";
    }
}