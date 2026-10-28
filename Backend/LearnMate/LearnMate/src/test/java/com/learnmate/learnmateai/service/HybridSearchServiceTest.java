package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.dto.RetrievedChunk;
import com.learnmate.learnmateai.llm.EmbeddingClient;
import com.learnmate.learnmateai.llm.VoyageReranker;
import com.learnmate.learnmateai.model.DocumentChunk;
import com.learnmate.learnmateai.repository.DocumentChunkRepository;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class HybridSearchServiceTest {

    private final DocumentChunkRepository repository = mock(DocumentChunkRepository.class);
    private final EmbeddingClient embeddings = mock(EmbeddingClient.class);
    private final VoyageReranker reranker = mock(VoyageReranker.class);
    private final HybridSearchService service = new HybridSearchService(repository, embeddings, reranker);

    private static List<DocumentChunk> chunks(int n) {
        List<DocumentChunk> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            DocumentChunk c = new DocumentChunk();
            c.setId((long) i);
            c.setSourceId("src");
            c.setContent("passage " + i);
            out.add(c);
        }
        return out;
    }

    private void searchReturns(List<DocumentChunk> found) {
        when(embeddings.embedQuery(anyString())).thenReturn(new float[]{0.1f, 0.2f});
        when(repository.hybridSearch(anyString(), anyString(), any(), anyString(), anyString(), anyInt(), anyInt()))
                .thenReturn(found);
    }

    @Test
    void usesTheRerankersOrder() {
        searchReturns(chunks(20));
        when(reranker.rerank(eq("what is light"), anyList(), eq(3))).thenReturn(List.of(7, 2, 15));

        List<RetrievedChunk> result = service.search("what is light", null, "School", "8", 3);

        assertThat(result).extracting(RetrievedChunk::chunkId).containsExactly(7L, 2L, 15L);
        verify(embeddings).embedQuery("what is light");   // searched as a question, not a passage
    }

    @Test
    void keepsTheSearchOrderWhenRerankingFails() {
        searchReturns(chunks(20));
        when(reranker.rerank(anyString(), anyList(), anyInt())).thenReturn(null);

        List<RetrievedChunk> result = service.search("what is light", null, "School", "8", 3);

        assertThat(result).extracting(RetrievedChunk::chunkId).containsExactly(0L, 1L, 2L);
    }

    @Test
    void skipsRerankingWhenThereIsNothingToChooseFrom() {
        searchReturns(chunks(2));

        List<RetrievedChunk> result = service.search("what is light", null, "School", "8", 3);

        assertThat(result).hasSize(2);
        verifyNoInteractions(reranker);
    }

    @Test
    void keywordQueryOrsTheWordsAndDropsAnythingThatCouldBreakIt() {
        assertThat(HybridSearchService.keywordQuery("What is Newton's 3rd law?! (a & b) | c"))
                .isEqualTo("what | is | newton | 3rd | law");
        assertThat(HybridSearchService.keywordQuery("కాంతి అంటే ఏమిటి?")).isEqualTo("కాంతి | అంటే | ఏమిటి");
        assertThat(HybridSearchService.keywordQuery("?!")).isEmpty();
        assertThat(HybridSearchService.keywordQuery("class 8 chapter 3")).isEqualTo("class | 8 | chapter | 3");
    }
}
