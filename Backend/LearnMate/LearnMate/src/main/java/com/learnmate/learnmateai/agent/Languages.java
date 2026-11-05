package com.learnmate.learnmateai.agent;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * The Indian languages LearnMate answers in besides English. A student signals
 * one by writing in its script or by asking for it by name ("explain in
 * Kannada"); the tutor, quiz writer and grader then use it. To support another
 * language, add it to SUPPORTED.
 */
final class Languages {

    private record Lang(String name, int firstCodePoint, int lastCodePoint) {}

    private static final List<Lang> SUPPORTED = List.of(
            new Lang("Telugu", 0x0C00, 0x0C7F),
            new Lang("Hindi", 0x0900, 0x097F),
            new Lang("Kannada", 0x0C80, 0x0CFF));

    private Languages() {}

    /** The supported languages the text is written in or asks for, in SUPPORTED order. */
    static List<String> requested(String text) {
        String lower = text == null ? "" : text.toLowerCase(Locale.ROOT);
        List<String> out = new ArrayList<>();
        for (Lang l : SUPPORTED) {
            boolean script = lower.codePoints().anyMatch(cp -> cp >= l.firstCodePoint() && cp <= l.lastCodePoint());
            if (script || lower.contains(l.name().toLowerCase(Locale.ROOT))) out.add(l.name());
        }
        return out;
    }

    /**
     * The prompt's LANGUAGE instruction for {@code text}.
     *
     * @param verb "Answer" for the tutor, "Write" for quizzes and feedback
     * @param what what to give in full in each language ("explanation", "content")
     */
    static String guidance(String text, String verb, String what) {
        List<String> langs = requested(text);
        String terms = "Keep technical/scientific terms and formulas in English where that's how Indian students "
                + "actually learn them (e.g. 'Newton's Second Law', 'photosynthesis', chemical formulas)";
        if (langs.isEmpty()) {
            return verb + " in clear, simple English suitable for an exam-prep student.";
        }
        if (langs.size() == 1) {
            String l = langs.get(0);
            return verb + " primarily in " + l + ", the way a " + l + "-medium teacher would explain to a student. "
                    + terms + ", but explain the concept itself in " + l + ".";
        }
        String list = String.join(", ", langs.subList(0, langs.size() - 1)) + " and " + langs.get(langs.size() - 1);
        return verb + " in each of " + list + ": give the full " + what + " in " + langs.get(0)
                + " first, then the same " + what + " in each of the others, in that order, clearly separated with "
                + "a heading for each language. " + terms + ", but explain the concept itself in each language.";
    }
}
