package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.DocumentChunk;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

public interface DocumentChunkRepository extends JpaRepository<DocumentChunk, Long> {

    @Query(value = """

            SELECT c.*
    FROM document_chunks c
    WHERE c.embedding IS NOT NULL
      AND (
            :subject IS NULL
            OR :subject = ''
            OR c.subject = :subject
          )
    ORDER BY
    (
        0.7 * (1 - (c.embedding <=> CAST(:queryEmbedding AS vector)))
      + 0.3 * ts_rank(
            to_tsvector('english', c.content),
            plainto_tsquery('english', :queryText)
        )
    ) DESC
    LIMIT :topK
        """, nativeQuery = true)
    List<DocumentChunk> hybridSearch(
            @Param("queryEmbedding") String queryEmbedding,
            @Param("queryText") String queryText,
            @Param("subject") String subject,
            @Param("topK") int topK
    );

    void deleteBySourceId(String sourceId);
    @Modifying
    @Transactional
    @Query("""
DELETE FROM DocumentChunk d
WHERE d.sourceId = :sourceId
AND d.ownerUsername = :ownerUsername
""")
    void deleteBySourceIdAndOwnerUsername(
            @Param("sourceId") String sourceId,
            @Param("ownerUsername") String ownerUsername
    );
    List<DocumentChunk> findByOwnerUsername(String ownerUsername);
}