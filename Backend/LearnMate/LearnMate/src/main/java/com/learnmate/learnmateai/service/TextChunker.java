package com.learnmate.learnmateai.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
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

    // "Chapter 3", "UNIT IV: Light", "Lesson 2 - ...", and the Telugu/Hindi equivalents, at
    // the start of a line (a stray letter before it is allowed: contents pages often have the
    // word CONTENTS printed down the side). Group 1 is the word, 2 the number, 3 the title.
    // Roman numerals must be capitals, so "Part civil rights" isn't taken for "Part CIVIL".
    private static final Pattern CHAPTER_LINE = Pattern.compile(
            "(?iu)^(?:\\S\\s)?(chapter|unit|lesson|part|అధ్యాయం|పాఠం|అధ్యాయము|पाठ|अध्याय)\\s*[-–:.]?\\s*"
                    + "(\\d{1,3}|(?-i:[IVXLC]{1,6}))\\b\\s*(?:[-–:.]\\s*)?(.*)$");
    private static final Pattern TRAILING_PAGE_NUMBER = Pattern.compile("[\\s.]*\\d{1,4}\\s*$");
    private static final int MAX_HEADING_WORDS = 12;
    // Chapter lines closer together than this are a contents page, not chapter starts.
    private static final int CONTENTS_SPACING_WORDS = 60;
    private static final Set<String> SMALL_WORDS = Set.of(
            "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with");
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
                String next = paragraph.substring(HEADING_MARK.length());
                if (next.equals(heading)) continue;   // a running page header of this chapter
                // New chapter: finish the current piece (no overlap across chapters),
                // unless it's too short to stand alone, then it joins the new chapter.
                if (currentWords >= MIN_WORDS_TO_FLUSH) {
                    flush(out, current, heading);
                    currentWords = 0;
                }
                heading = next;
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
        String[] lines = text.split("\\R");
        for (int i = 0; i < lines.length; i++) lines[i] = WS.matcher(lines[i]).replaceAll(" ").trim();
        Map<Integer, String> headings = findHeadings(lines);

        List<String> out = new ArrayList<>();
        StringBuilder para = new StringBuilder();
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            if (line.isEmpty()) {
                endParagraph(out, para);
                continue;
            }
            if (headings.containsKey(i)) {
                endParagraph(out, para);
                out.add(HEADING_MARK + headings.get(i));
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

    /**
     * Which lines start a chapter, and the label to give it ("Chapter 4: Structure of the Atom").
     *
     * Two kinds of book are handled:
     *  - Chapters that open with a "Chapter 4 ..." line.
     *  - Chapters that open with just their title ("STRUCTURE OF THE ATOM"), as in the
     *    state-board textbooks. Their titles are learnt from the contents page, where
     *    "Chapter 4" lines sit close together; those contents lines are never headings
     *    themselves, or every page after the contents would be labelled with the last entry.
     */
    private static Map<Integer, String> findHeadings(String[] lines) {
        // Chapter lines, with how far into the book (in words) each one is.
        List<int[]> found = new ArrayList<>();          // {line index, word offset}
        Map<Integer, String> labels = new HashMap<>();
        Map<Integer, Integer> titleLineOf = new HashMap<>();
        int offset = 0;
        for (int i = 0; i < lines.length; i++) {
            String label = chapterLabel(lines, i, titleLineOf);
            if (label != null) {
                found.add(new int[]{i, offset});
                labels.put(i, label);
            }
            offset += wordCount(lines[i]);
        }

        Map<Integer, String> headings = new HashMap<>();
        Map<String, String> contentsTitles = new HashMap<>();   // normalised title -> label
        Map<String, Boolean> titleIsCapitals = new HashMap<>();
        Set<Integer> contentsLines = new HashSet<>();
        for (int k = 0; k < found.size(); k++) {
            int[] f = found.get(k);
            boolean closeToPrevious = k > 0 && f[1] - found.get(k - 1)[1] < CONTENTS_SPACING_WORDS;
            boolean closeToNext = k + 1 < found.size() && found.get(k + 1)[1] - f[1] < CONTENTS_SPACING_WORDS;
            if (closeToPrevious || closeToNext) {
                contentsLines.add(f[0]);
                Integer titleLine = titleLineOf.get(f[0]);
                if (titleLine != null) {
                    contentsLines.add(titleLine);
                    String title = stripPageNumber(lines[titleLine]);
                    if (normalise(title).length() >= 4) {
                        contentsTitles.put(normalise(title), labels.get(f[0]));
                        titleIsCapitals.put(normalise(title), isCapitals(title));
                    }
                }
            } else {
                headings.put(f[0], labels.get(f[0]));
            }
        }
        // A bare "Chapter 3" later in the book (e.g. on the answers pages) gets its full
        // contents-page name, "Chapter 3: Atoms and Molecules".
        Map<String, String> fullLabel = new HashMap<>();
        for (String label : contentsTitles.values()) fullLabel.put(label.substring(0, label.indexOf(':')), label);
        headings.replaceAll((line, label) -> fullLabel.getOrDefault(label, label));

        // Title lines matching a contents entry ("MATTER IN OUR SURROUNDINGS2").
        if (!contentsTitles.isEmpty()) {
            for (int i = 0; i < lines.length; i++) {
                if (contentsLines.contains(i) || headings.containsKey(i)) continue;
                String line = lines[i];
                if (line.isEmpty() || wordCount(line) > MAX_HEADING_WORDS) continue;
                String key = normalise(line);
                String label = contentsTitles.get(key);
                if (label != null && (!titleIsCapitals.get(key) || isCapitals(line))) headings.put(i, label);
            }
        }
        return headings;
    }

    /**
     * "Chapter 4: Structure of the Atom" if line i is a chapter line, else null.
     * If the title is on the next line (common on contents pages), records that line in titleLineOf.
     */
    private static String chapterLabel(String[] lines, int i, Map<Integer, Integer> titleLineOf) {
        String line = lines[i];
        if (line.isEmpty() || line.length() > 100 || wordCount(line) > MAX_HEADING_WORDS) return null;
        Matcher m = CHAPTER_LINE.matcher(line);
        if (!m.matches()) return null;
        String title = m.group(3).trim();
        // "Chapter 3, which suggested that..." is a sentence that mentions a chapter.
        if (!title.isEmpty() && (title.charAt(0) == ',' || title.charAt(0) == ';'
                || Character.isLowerCase(title.codePointAt(0)))) {
            return null;
        }
        String word = m.group(1);
        String label = word.substring(0, 1).toUpperCase(Locale.ROOT) + word.substring(1).toLowerCase(Locale.ROOT)
                + " " + m.group(2);

        title = stripPageNumber(title);
        if (title.isEmpty()) {
            // Title on the next non-blank line: "Chapter 1" / "MATTER IN OUR SURROUNDINGS 2".
            for (int j = i + 1; j < lines.length && j <= i + 3; j++) {
                if (lines[j].isEmpty()) continue;
                String next = stripPageNumber(lines[j]);
                // A title starts with a letter: not "4. (a) MgCl" from an answers page.
                if (!next.isEmpty() && wordCount(next) <= MAX_HEADING_WORDS
                        && !CHAPTER_LINE.matcher(lines[j]).matches()
                        && Character.isLetter(next.codePointAt(0))
                        && !Character.isLowerCase(next.codePointAt(0))) {
                    titleLineOf.put(i, j);
                    title = next;
                }
                break;
            }
        }
        return title.isEmpty() ? label : label + ": " + tidyTitle(title);
    }

    private static String stripPageNumber(String s) {
        return TRAILING_PAGE_NUMBER.matcher(s).replaceAll("").trim();
    }

    /** Letters only, lower case, single spaces: "MATTER IN  OUR SURROUNDINGS2" -> "matter in our surroundings". */
    private static String normalise(String s) {
        return WS.matcher(s.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{M}]+", " ")).replaceAll(" ").trim();
    }

    /** True when the line's Latin letters are all capitals (and there is at least one). */
    private static boolean isCapitals(String s) {
        boolean any = false;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c < 128 && Character.isLetter(c)) {
                if (Character.isLowerCase(c)) return false;
                any = true;
            }
        }
        return any;
    }

    /** "IS MATTER AROUND US PURE?" -> "Is Matter Around Us Pure?"; mixed-case titles are kept as they are. */
    private static String tidyTitle(String title) {
        if (!isCapitals(title)) return title;
        String[] words = title.toLowerCase(Locale.ROOT).split(" ");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < words.length; i++) {
            String w = words[i];
            if (sb.length() > 0) sb.append(' ');
            sb.append(i > 0 && SMALL_WORDS.contains(w) || w.isEmpty() ? w
                    : w.substring(0, 1).toUpperCase(Locale.ROOT) + w.substring(1));
        }
        return sb.toString();
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
