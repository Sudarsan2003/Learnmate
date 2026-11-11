package com.learnmate.learnmateai.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.learnmate.learnmateai.llm.LlmClient;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Asks the AI for a short picture-book story: a title, how the main character
 * looks (so every picture matches), and for each page one or two sentences in
 * the chosen language plus an English description of its picture.
 */
@Component
public class StoryWriter {

    public static final Set<String> LANGUAGES = Set.of("English", "Kannada", "Telugu", "Hindi");
    public static final int MIN_PAGES = 4;
    public static final int MAX_PAGES = 8;

    public record Page(String text, String scene) {}

    public record Draft(String title, String character, List<Page> pages) {}

    private static final String SYSTEM = """
            You write short picture-book stories for young children in India, read aloud to them by the app.
            Return ONLY a JSON object, no other text:
            {"title": "...", "character": "...", "pages": [{"text": "...", "scene": "..."}]}

            Rules:
            - "title" and every page "text" are in %1$s. "character" and every "scene" are in English.
            - Exactly %2$d pages. Each page "text" is one or two short, simple sentences (at most %3$d words),
              using words a %4$s child knows. Repetition and gentle rhythm are good.
            - The story gently teaches the topic, using the facts and words from the school's material when given.
              The last page repeats the main idea.
            - Warm, kind and safe: no violence, danger, fear, sadness that is not resolved, brands, real people,
              religion or politics. Use Indian names and everyday Indian settings where natural.
            - "character": a short visual description of the main character(s) (species or child, age, clothes,
              colours), so every picture can show them the same way. No names of real people or famous characters.
            - Each "scene": what the picture for that page shows, in one sentence, concrete and visual.
              Never ask for words, letters or numbers to be written in the picture.
            """;

    private final LlmClient llm;
    private final ObjectMapper json = new ObjectMapper();

    public StoryWriter(LlmClient llm) {
        this.llm = llm;
    }

    /** Words per page: very short for kindergarten, a little longer for older classes. */
    static int wordsPerPage(String standard) {
        if (standard == null) return 25;
        String s = standard.trim().toUpperCase();
        if (s.equals("LKG") || s.equals("UKG") || s.equals("NURSERY")) return 15;
        if (s.equals("1") || s.equals("2")) return 25;
        return 40;
    }

    static String ageLabel(String standard) {
        if (standard == null) return "young";
        return switch (standard.trim().toUpperCase()) {
            case "NURSERY" -> "3-year-old";
            case "LKG" -> "4-year-old";
            case "UKG" -> "5-year-old";
            case "1" -> "6-year-old";
            case "2" -> "7-year-old";
            default -> "young";
        };
    }

    public Draft write(String topic, String standard, String language, int pages, List<String> material) {
        String system = SYSTEM.formatted(language, pages, wordsPerPage(standard), ageLabel(standard));
        StringBuilder user = new StringBuilder()
                .append("Topic: ").append(topic.trim()).append('\n')
                .append("Class: ").append(standard).append('\n');
        if (material != null && !material.isEmpty()) {
            user.append("\nFrom the school's books (use what fits the topic; ignore the rest):\n");
            for (String m : material) user.append("---\n").append(m.length() > 1500 ? m.substring(0, 1500) : m).append('\n');
        }
        return parse(llm.complete(system, user.toString()), pages);
    }

    /** Reads the model's JSON (tolerating ``` fences or text around it). */
    Draft parse(String raw, int expectedPages) {
        if (raw == null) throw new IllegalStateException("The AI returned nothing.");
        int start = raw.indexOf('{');
        int end = raw.lastIndexOf('}');
        if (start < 0 || end <= start) throw new IllegalStateException("The AI didn't return a story. Please try again.");
        JsonNode root;
        try {
            root = json.readTree(raw.substring(start, end + 1));
        } catch (Exception e) {
            throw new IllegalStateException("The AI's story couldn't be read. Please try again.");
        }
        List<Page> out = new ArrayList<>();
        for (JsonNode p : root.path("pages")) {
            String text = p.path("text").asText("").trim();
            if (text.isEmpty()) continue;
            out.add(new Page(text, p.path("scene").asText("").trim()));
        }
        if (out.size() < Math.min(MIN_PAGES, expectedPages)) {
            throw new IllegalStateException("The AI's story was too short. Please try again.");
        }
        if (out.size() > MAX_PAGES) out = out.subList(0, MAX_PAGES);
        String title = root.path("title").asText("").trim();
        return new Draft(title.isEmpty() ? "A story" : title, root.path("character").asText("").trim(), out);
    }
}
