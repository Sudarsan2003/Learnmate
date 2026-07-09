package com.learnmate.learnmateai.agent;

import com.learnmate.learnmateai.dto.RetrievedChunk;
import com.learnmate.learnmateai.service.HybridSearchService;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class RetrievalAgent {

    private final HybridSearchService hybridSearchService;

    public RetrievalAgent(HybridSearchService hybridSearchService) {
        this.hybridSearchService = hybridSearchService;
    }

    public List<RetrievedChunk> retrieve(String query, String subject, int topK) {
        return hybridSearchService.search(query, subject, topK);
    }
}