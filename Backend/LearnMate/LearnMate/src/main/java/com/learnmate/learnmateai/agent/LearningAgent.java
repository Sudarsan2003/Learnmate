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
            return "No relevant study material was found in the knowledge base.";
        }
        String context = chunks.stream()
                .map(c -> "[Source: %s]\n%s".formatted(c.sourceId(), c.content()))
                .collect(Collectors.joining("\n\n---\n\n"));

        String system = """
You are LearnMate, an AI tutor.

Use ONLY the provided context.

Your answer must:

- Start with a 2-3 sentence explanation.
- Then provide bullet points.
- Ignore page numbers, indexes, headers and footers.
- Ignore incomplete sentences.
- Ignore code unless the user asks for code.
- Merge information from multiple sources.
- Never repeat the same idea.
- End with a short summary.

If the context doesn't contain enough information, clearly say so.

Always cite the source at the end.
""".formatted(level);

        String user = """
                CONTEXT:
                %s

                QUESTION:
                %s
                """.formatted(context, query);
        System.out.println(user);

        return llmClient.complete(system, user);
    }
}