package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.dto.RetrievedChunk;
import com.learnmate.learnmateai.llm.EmbeddingClient;
import com.learnmate.learnmateai.llm.VoyageReranker;
import com.learnmate.learnmateai.model.DocumentChunk;
import com.learnmate.learnmateai.repository.DocumentChunkRepository;
import org.springframework.stereotype.Service;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class HybridSearchService {

    // How many top matches each of the meaning and keyword searches contributes,
    // and how many merged candidates the reranker then chooses from.
    private static final int POOL = 30;
    private static final int CANDIDATES = 20;
    private static final int MAX_KEYWORDS = 30;
    private static final Pattern WORD = Pattern.compile("[\\p{L}\\p{M}\\p{N}]+");

    private final DocumentChunkRepository repository;
    private final EmbeddingClient embeddingClient;
    private final VoyageReranker reranker;

    public HybridSearchService(DocumentChunkRepository repository, EmbeddingClient embeddingClient,
                               VoyageReranker reranker) {
        this.repository = repository;
        this.embeddingClient = embeddingClient;
        this.reranker = reranker;
    }

    public List<RetrievedChunk> search(String query, String subject, String institution, String standard, int topK) {
        float[] vector = embeddingClient.embedQuery(query);
        String pgVectorLiteral = toPgVectorLiteral(vector);

        List<DocumentChunk> candidates = repository.hybridSearch(pgVectorLiteral, keywordQuery(query), subject,
                institution, standard, POOL, Math.max(topK, CANDIDATES));

        List<DocumentChunk> chunks = candidates;
        boolean reranked = false;
        if (candidates.size() > topK) {
            List<Integer> order = reranker.rerank(query,
                    candidates.stream().map(DocumentChunk::getContent).toList(), topK);
            if (order != null) {
                chunks = order.stream().filter(i -> i >= 0 && i < candidates.size()).map(candidates::get).toList();
                reranked = true;
            } else {
                chunks = candidates.subList(0, topK);
            }
        }

        System.out.println("=================================");
        System.out.println("Question = " + query);
        System.out.println("Institution = " + institution + ", Standard = " + standard + ", Subject = " + subject);
        System.out.println("Retrieved = " + chunks.size() + " of " + candidates.size()
                + (reranked ? " (reranked)" : ""));

        return chunks.stream()
                .map(c -> new RetrievedChunk(c.getId(), c.getSourceId(), c.getContent(), 0.0))
                .toList();
    }

    /**
     * The question's words joined with OR ("newton | third | law"), for
     * Postgres full-text search. Requiring every word (plainto_tsquery, as
     * before) almost never matched a whole question. Only letters, marks and
     * digits are kept, so nothing can break the tsquery syntax; Postgres drops
     * English stop words itself. Returns '' when there's nothing to search for.
     */
    static String keywordQuery(String query) {
        Set<String> words = new LinkedHashSet<>();
        Matcher m = WORD.matcher(query == null ? "" : query.toLowerCase(Locale.ROOT));
        while (m.find() && words.size() < MAX_KEYWORDS) {
            String w = m.group();
            if (w.length() >= 2 || Character.isDigit(w.charAt(0))) words.add(w);
        }
        return String.join(" | ", words);
    }

    private String toPgVectorLiteral(float[] vector) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < vector.length; i++) {
            sb.append(vector[i]);
            if (i < vector.length - 1) sb.append(",");
        }
        return sb.append("]").toString();
    }
}
