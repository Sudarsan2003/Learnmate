package com.learnmate.learnmateai.agent;

import com.learnmate.learnmateai.dto.RetrievedChunk;
import com.learnmate.learnmateai.model.DocumentChunk;
import com.learnmate.learnmateai.repository.DocumentChunkRepository;
import com.learnmate.learnmateai.service.ChapterCatalog;
import com.learnmate.learnmateai.service.HybridSearchService;
import com.learnmate.learnmateai.service.TextQuality;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Component
public class RetrievalAgent {

    // Front/back-matter chunks that make poor quiz material.
    private static final Pattern BOILERPLATE = Pattern.compile(
            "(?i)all rights reserved|punishable offence|\\bisbn\\b|printed (at|by)"
                    + "|table of contents|^\\s*contents\\b|first edition|reprint");

    private static final int MIN_USABLE_CHUNK_CHARS = 300;

    private final HybridSearchService hybridSearchService;
    private final DocumentChunkRepository chunkRepository;
    private final ChapterCatalog chapterCatalog;

    public RetrievalAgent(HybridSearchService hybridSearchService,
                          DocumentChunkRepository chunkRepository,
                          ChapterCatalog chapterCatalog) {
        this.hybridSearchService = hybridSearchService;
        this.chunkRepository = chunkRepository;
        this.chapterCatalog = chapterCatalog;
    }

    // Unreadable chunks (see TextQuality) are dropped: as tutoring context they only add noise.
    public List<RetrievedChunk> retrieve(String query, String subject, String institution, String standard, int topK) {
        List<RetrievedChunk> found = hybridSearchService.search(query, subject, institution, standard, topK);
        List<RetrievedChunk> readable = found.stream().filter(c -> TextQuality.isReadable(c.content())).toList();
        return readable.isEmpty() ? found : readable;
    }

    /**
     * If the topic names an uploaded file (e.g. "Class6_Social_Science_Sem1_Plain_Text_RAG"),
     * returns {@code count} chunks spread evenly across that file, skipping boilerplate.
     * Otherwise returns an empty list so the caller can fall back to similarity search.
     */
    public List<RetrievedChunk> retrieveWholeDocument(String topic, String institution,
                                                      String standard, int count) {
        String wanted = norm(topic);
        if (wanted.isBlank()) return List.of();

        List<String> fileNames = chunkRepository.findAllFileNames(institution, standard);

        String match = null;
        for (String f : fileNames) {
            if (norm(f).equals(wanted)) {
                match = f;
                break;
            }
        }
        // Loose match only for reasonably long topics, so "chapter 3" can't hit a random file.
        if (match == null && wanted.length() >= 8) {
            for (String f : fileNames) {
                String nf = norm(f);
                if (!nf.isBlank() && (nf.contains(wanted) || wanted.contains(nf))) {
                    match = f;
                    break;
                }
            }
        }
        if (match == null) return List.of();

        List<DocumentChunk> all = chunkRepository.findByFileName(institution, standard, match);
        return spread(quizUsable(all), count).stream().map(this::toRetrieved).toList();
    }

    /**
     * About {@code count} chunks spread across whole books ({@code sourceIds}) and
     * single chapters, an even share each, skipping boilerplate. Used when a student
     * picks books and/or chapters to be quizzed on.
     */
    public List<RetrievedChunk> retrieveFromSelection(List<String> sourceIds, List<ChapterCatalog.Chapter> chapters,
                                                      String institution, String standard, int count) {
        int parts = (sourceIds == null ? 0 : sourceIds.size()) + chapters.size();
        if (parts == 0) return List.of();
        int perPart = Math.max(2, (int) Math.ceil((double) count / parts));
        List<RetrievedChunk> out = new ArrayList<>();
        if (sourceIds != null && !sourceIds.isEmpty()) {
            Map<String, List<DocumentChunk>> byDoc = new LinkedHashMap<>();
            for (DocumentChunk c : chunkRepository.findBySourceIds(institution, standard, sourceIds)) {
                byDoc.computeIfAbsent(c.getSourceId(), k -> new ArrayList<>()).add(c);
            }
            for (List<DocumentChunk> all : byDoc.values()) {
                spread(quizUsable(all), perPart).stream().map(this::toRetrieved).forEach(out::add);
            }
        }
        out.addAll(retrieveFromChapters(chapters, institution, standard, perPart));
        return out;
    }

    /** About {@code perChapter} chunks spread evenly through each chapter, skipping boilerplate. */
    public List<RetrievedChunk> retrieveFromChapters(List<ChapterCatalog.Chapter> chapters,
                                                     String institution, String standard, int perChapter) {
        List<RetrievedChunk> out = new ArrayList<>();
        for (ChapterCatalog.Chapter chapter : chapters) {
            List<DocumentChunk> all = chapterCatalog.chunksOf(institution, standard, chapter);
            spread(quizUsable(all), perChapter).stream().map(this::toRetrieved).forEach(out::add);
        }
        return out;
    }

    /**
     * The chunks worth sampling for a quiz: readable, substantial and not front/back matter.
     * Falls back to any readable chunk, then to everything (so the caller's garbled-text
     * check can tell the student the material is unreadable).
     */
    private static List<DocumentChunk> quizUsable(List<DocumentChunk> all) {
        List<DocumentChunk> readable = all.stream()
                .filter(c -> c.getContent() != null && TextQuality.isReadable(c.getContent()))
                .toList();
        List<DocumentChunk> usable = readable.stream()
                .filter(c -> c.getContent().length() >= MIN_USABLE_CHUNK_CHARS
                        && !BOILERPLATE.matcher(c.getContent()).find())
                .toList();
        if (!usable.isEmpty()) return usable;
        return readable.isEmpty() ? all : readable;
    }

    private static String norm(String s) {
        if (s == null) return "";
        return s.toLowerCase()
                .replaceAll("\\.(pdf|txt|docx?|md|pptx?)$", "")
                .replaceAll("[^\\p{L}\\p{N}]+", " ")
                .trim();
    }

    /** Picks n items evenly spaced across the list (middle of each of n equal segments). */
    private static <T> List<T> spread(List<T> items, int n) {
        if (items.size() <= n) return items;
        List<T> out = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            out.add(items.get((int) ((i + 0.5) * items.size() / n)));
        }
        return out;
    }

    private RetrievedChunk toRetrieved(DocumentChunk c) {
        // RetrievedChunk(Long id, String sourceId, String content, double score).
        // Score is 0.0 because these chunks were sampled, not ranked by similarity.
        return new RetrievedChunk(c.getId(), c.getSourceId(), c.getContent(), 0.0);
    }
}