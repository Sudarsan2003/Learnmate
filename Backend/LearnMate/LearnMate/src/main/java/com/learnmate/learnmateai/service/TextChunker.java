package com.learnmate.learnmateai.service;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Splits a book's extracted text into search-sized pieces at sentence
 * boundaries, remembering which chapter each piece came from.
 *
 * Cutting every N words (as before) split sentences in half and mixed the end
 * of one chapter with the start of the next, and a piece had no idea which
 * chapter it belonged to, so "what is chapter 3 about?" rarely found it.
 */
final class TextChunker {

    /** A piece of text and the chapter/unit heading it falls under (null before the first one). */
    record Chunk(String heading, String text) {}

    // "Chapter 3", "UNIT IV: Light", "Lesson 2 - ...", and the Telugu/Hindi equivalents.
    // Roman numerals must be capitals, so "Part civil rights" isn't taken for "Part CIVIL".
    private static final Pattern HEADING = Pattern.compile(
            "(?iu)^(?:chapter|unit|lesson|part|అధ్యాయం|పాఠం|అధ్యాయము|पाठ|अध्याय)\\s*[-–:.]?\\s*(?:\\d{1,3}|(?-i:[IVXLC]{1,6}))\\b.*");
    private static final int MAX_HEADING_WORDS = 12;
    // A chapter change flushes the current piece, unless it's this short (e.g. a title page
    // or a contents list), in which case it's carried into the new chapter's first piece.
    private static final int MIN_WORDS_TO_FLUSH = 40;
    private static final Pattern SENTENCE_END = Pattern.compile("(?<=[.!?।॥])\\s+(?=\\S)");
    private static final Pattern WS = Pattern.compile("\\s+");

    private TextChunker() {}

    static List<Chunk> chunk(String text, int maxWords, int overlapWords) {
        List<Chunk> out = new ArrayList<>();
        List<String> current = new ArrayList<>();   // sentences of the piece being built
        int currentWords = 0;
        String heading = null;                      // the chapter the piece being built belongs to

        for (String paragraph : paragraphs(text)) {
            if (paragraph.startsWith(HEADING_MARK)) {
                // New chapter: finish the current piece (no overlap across chapters),
                // unless it's too short to stand alone, then it joins the new chapter.
                if (currentWords >= MIN_WORDS_TO_FLUSH) {
                    flush(out, current, heading);
                    currentWords = 0;
                }
                heading = paragraph.substring(HEADING_MARK.length());
                continue;
            }
            for (String sentence : sentences(paragraph, maxWords)) {
                int words = wordCount(sentence);
                if (currentWords > 0 && currentWords + words > maxWords) {
                    List<String> carry = overlap(current, overlapWords);
                    flush(out, current, heading);
                    current.addAll(carry);
                    currentWords = carry.stream().mapToInt(TextChunker::wordCount).sum();
                }
                current.add(sentence);
                currentWords += words;
            }
        }
        flush(out, current, heading);
        return out;
    }

    private static final String HEADING_MARK = "\u0000H:";

    /**
     * Paragraphs of running text, with wrapped lines joined back together
     * ("photo-" + "synthesis" -> "photosynthesis"). Chapter headings come out
     * as their own entries, prefixed with HEADING_MARK.
     */
    private static List<String> paragraphs(String text) {
        List<String> out = new ArrayList<>();
        StringBuilder para = new StringBuilder();
        for (String raw : text.split("\\R")) {
            String line = WS.matcher(raw).replaceAll(" ").trim();
            if (line.isEmpty()) {
                endParagraph(out, para);
                continue;
            }
            if (line.length() <= 100 && wordCount(line) <= MAX_HEADING_WORDS && HEADING.matcher(line).matches()) {
                endParagraph(out, para);
                out.add(HEADING_MARK + line);
                continue;
            }
            if (para.length() > 0) {
                boolean hyphenated = para.charAt(para.length() - 1) == '-'
                        && Character.isLowerCase(line.codePointAt(0));
                if (hyphenated) para.setLength(para.length() - 1);
                else para.append(' ');
            }
            para.append(line);
        }
        endParagraph(out, para);
        return out;
    }

    private static void endParagraph(List<String> out, StringBuilder para) {
        if (para.length() > 0) out.add(para.toString());
        para.setLength(0);
    }

    /** Sentences of a paragraph; any single sentence longer than maxWords is cut into maxWords pieces. */
    private static List<String> sentences(String paragraph, int maxWords) {
        List<String> out = new ArrayList<>();
        for (String s : SENTENCE_END.split(paragraph)) {
            String[] words = WS.split(s.trim());
            if (words.length == 0 || words[0].isEmpty()) continue;
            for (int i = 0; i < words.length; i += maxWords) {
                out.add(String.join(" ", java.util.Arrays.copyOfRange(words, i, Math.min(words.length, i + maxWords))));
            }
        }
        return out;
    }

    /** The trailing sentences of a piece, up to overlapWords, repeated at the start of the next one. */
    private static List<String> overlap(List<String> sentences, int overlapWords) {
        List<String> carry = new ArrayList<>();
        int words = 0;
        for (int i = sentences.size() - 1; i > 0; i--) {   // never carry the whole piece
            int w = wordCount(sentences.get(i));
            if (words + w > overlapWords) break;
            carry.add(0, sentences.get(i));
            words += w;
        }
        return carry;
    }

    private static void flush(List<Chunk> out, List<String> sentences, String heading) {
        if (!sentences.isEmpty()) out.add(new Chunk(heading, String.join(" ", sentences)));
        sentences.clear();
    }

    static int wordCount(String s) {
        String t = s.trim();
        return t.isEmpty() ? 0 : WS.split(t).length;
    }
}
