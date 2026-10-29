package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.model.DocumentChunk;
import com.learnmate.learnmateai.repository.DocumentChunkRepository;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The chapters of the books uploaded for a class, read from the header line
 * every piece starts with ("9thClass Maths SEM-2 Textbook | Chapter 9: Circles",
 * written at upload by IngestionService). Lets students quiz themselves on one
 * chapter and lets the tutor read a whole chapter when asked about it.
 * Books uploaded before chapter-aware chunking have no chapters here.
 */
@Component
public class ChapterCatalog {

    /**
     * One chapter of one book. {@code id} is "sourceId::label", the form the chat
     * sends back when a student ticks a chapter in the quiz picker.
     */
    public record Chapter(String id, String sourceId, String book, String subject, String label,
                          Integer number, String header) {
        public String title() {
            int colon = label.indexOf(": ");
            return colon < 0 ? label : label.substring(colon + 2);
        }
    }

    public static final String ID_SEPARATOR = "::";

    private static final Pattern LABEL_NUMBER = Pattern.compile("^\\S+\\s+(\\d{1,3})\\b");
    // "chapter 9", "ch 9", "ch. 9", "lesson 3", "unit 2".
    private static final Pattern ASKED_NUMBER = Pattern.compile("(?i)\\b(?:chapter|chap|ch|lesson|unit)\\.?\\s*(\\d{1,3})\\b");
    private static final Pattern WORD = Pattern.compile("[\\p{L}\\p{M}\\p{N}]+");
    private static final Set<String> IGNORED = Set.of(
            "the", "and", "for", "with", "from", "into", "our", "class", "chapter", "chap", "lesson", "unit",
            "quiz", "test", "questions", "textbook", "book", "sem", "semester", "part");
    // Words that only say what to do with a chapter: "explain chapter 9", "summary of circles".
    private static final Set<String> FILLER = Set.of(
            "explain", "teach", "summarise", "summarize", "summary", "about", "tell", "overview", "describe",
            "what", "whats", "is", "in", "of", "on", "me", "the", "a", "an", "please", "topics", "topic",
            "important", "main", "points", "key", "full", "whole", "entire", "give", "can", "you", "do", "this",
            "that", "chapter", "chap", "ch", "lesson", "unit", "notes", "short", "detail", "details", "detailed",
            "simpler", "simple", "simply", "easy", "easier", "again", "more", "example", "examples", "and");

    private final DocumentChunkRepository repository;

    public ChapterCatalog(DocumentChunkRepository repository) {
        this.repository = repository;
    }

    /** Every chapter of every book for this school + class, in book then chapter order. */
    public List<Chapter> chaptersFor(String institution, String standard) {
        Map<String, String[]> books = new HashMap<>();   // sourceId -> {book title, subject}
        for (Object[] row : repository.findMaterials(institution, standard)) {
            if (row[1] == null) continue;
            books.put((String) row[0], new String[]{IngestionService.bookTitle((String) row[1]),
                    row[2] == null ? "" : (String) row[2]});
        }
        List<Chapter> out = new ArrayList<>();
        for (Object[] row : repository.findPieceHeaders(institution, standard)) {
            String sourceId = (String) row[0];
            String header = (String) row[1];
            String[] book = books.get(sourceId);
            int bar = header == null ? -1 : header.indexOf(" | ");
            if (book == null || bar < 0 || header.length() > 160) continue;
            String label = header.substring(bar + 3).trim();
            Matcher n = LABEL_NUMBER.matcher(label);
            out.add(new Chapter(sourceId + ID_SEPARATOR + label, sourceId, book[0], book[1], label,
                    n.find() ? Integer.parseInt(n.group(1)) : null, header));
        }
        out.sort(Comparator.comparing(Chapter::book)
                .thenComparing(c -> c.number() == null ? Integer.MAX_VALUE : c.number())
                .thenComparing(Chapter::label));
        return out;
    }

    /**
     * The chapters a request names, best match first: by number ("chapter 9",
     * narrowed by any book or subject words, e.g. "maths chapter 9") or by title
     * ("circles", "linear equations"). Empty if none matches.
     */
    public static List<Chapter> match(String request, List<Chapter> chapters) {
        if (request == null || chapters.isEmpty()) return List.of();
        Set<String> words = tokens(request);
        Matcher asked = ASKED_NUMBER.matcher(request);
        Integer number = asked.find() ? Integer.parseInt(asked.group(1)) : null;

        int best = 0;
        List<Chapter> found = new ArrayList<>();
        for (Chapter c : chapters) {
            Set<String> title = tokens(c.title());
            int titleHits = (int) title.stream().filter(words::contains).count();
            boolean byTitle = titleHits > 0 && (titleHits == title.size() || titleHits >= 2);
            boolean byNumber = number != null && number.equals(c.number());
            if (number != null ? !byNumber : !byTitle) continue;
            int bookHits = (int) tokens(c.book() + " " + c.subject()).stream()
                    .filter(w -> words.contains(w) && !w.equals(String.valueOf(number))).count();
            int score = (byNumber ? 10 : 0) + titleHits * 3 + bookHits;
            if (score > best) {
                best = score;
                found.clear();
            }
            if (score == best) found.add(c);
        }
        return found;
    }

    /**
     * True when the request is only about the chapter itself ("explain chapter 9",
     * "summary of circles"), not a specific question inside it ("what is a chord?").
     */
    public static boolean asksForWholeChapter(String request, Chapter chapter) {
        Set<String> about = tokens(chapter.title() + " " + chapter.book() + " " + chapter.subject());
        Matcher m = WORD.matcher(request.toLowerCase(Locale.ROOT));
        while (m.find()) {
            String w = m.group();
            if (w.length() < 3 || FILLER.contains(w) || IGNORED.contains(w)
                    || w.chars().allMatch(Character::isDigit) || about.contains(fold(w))) {
                continue;
            }
            return false;   // a word about something more specific
        }
        return true;
    }

    /** All pieces of one chapter, in book order. */
    public List<DocumentChunk> chunksOf(String institution, String standard, Chapter chapter) {
        return repository.findChapterChunks(institution, standard, chapter.sourceId(), chapter.header());
    }

    /** Looks up chapter ids ("sourceId::label") sent back by the quiz picker. */
    public static List<Chapter> byIds(Collection<String> ids, List<Chapter> chapters) {
        Set<String> wanted = new HashSet<>(ids);
        return chapters.stream().filter(c -> wanted.contains(c.id())).toList();
    }

    /** Lower-case words of 3+ letters (or numbers), plurals folded: "Circles" -> "circle". */
    static Set<String> tokens(String s) {
        Set<String> out = new HashSet<>();
        Matcher m = WORD.matcher(s == null ? "" : s.toLowerCase(Locale.ROOT));
        while (m.find()) {
            String w = m.group();
            if (IGNORED.contains(w)) continue;
            if (w.chars().allMatch(Character::isDigit)) out.add(w);
            else if (w.length() >= 3) out.add(fold(w));
        }
        return out;
    }

    /** "Circles" -> "circle"; "Maths", "Math" and "Mathematics" are all "math". */
    public static String fold(String w) {
        if (w.equals("mathematics") || w.equals("maths")) return "math";
        return w.length() > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.substring(0, w.length() - 1) : w;
    }
}
