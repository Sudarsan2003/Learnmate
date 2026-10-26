package com.learnmate.learnmateai.agent;

import com.learnmate.learnmateai.dto.RetrievedChunk;
import com.learnmate.learnmateai.model.DocumentChunk;
import com.learnmate.learnmateai.repository.DocumentChunkRepository;
import com.learnmate.learnmateai.service.HybridSearchService;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
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

    public RetrievalAgent(HybridSearchService hybridSearchService,
                          DocumentChunkRepository chunkRepository) {
        this.hybridSearchService = hybridSearchService;
        this.chunkRepository = chunkRepository;
    }

    public List<RetrievedChunk> retrieve(String query, String subject, String institution, String standard, int topK) {
        return hybridSearchService.search(query, subject, institution, standard, topK);
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
        List<DocumentChunk> usable = all.stream()
                .filter(c -> c.getContent() != null
                        && c.getContent().length() >= MIN_USABLE_CHUNK_CHARS
                        && !BOILERPLATE.matcher(c.getContent()).find())
                .toList();
        if (usable.isEmpty()) usable = all;

        return spread(usable, count).stream().map(this::toRetrieved).toList();
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