package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.DocumentChunk;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface DocumentChunkRepository extends JpaRepository<DocumentChunk, Long> {

    /**
     * Hybrid search: the best matches by meaning (vector distance) and the best
     * by keywords (full-text rank), merged with reciprocal rank fusion, so a
     * piece near the top of either list scores well. (Adding the raw scores
     * together, as before, let the vector score drown out keywords, whose
     * ts_rank values are about ten times smaller.)
     *
     * keywordQuery is an OR of the question's words ("newton | third | law"),
     * built in HybridSearchService; '' means no keyword search.
     */
    @Query(value = """
            WITH semantic AS (
                SELECT c.id,
                       ROW_NUMBER() OVER (ORDER BY c.embedding <=> CAST(:queryEmbedding AS vector)) AS r
                FROM document_chunks c
                WHERE c.embedding IS NOT NULL
                  AND c.institution = :institution
                  AND c.standard = :standard
                  AND (:subject IS NULL OR :subject = '' OR c.subject = :subject)
                ORDER BY c.embedding <=> CAST(:queryEmbedding AS vector)
                LIMIT :pool
            ),
            keyword AS (
                SELECT c.id,
                       ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('english', c.content), q) DESC) AS r
                FROM document_chunks c, to_tsquery('english', :keywordQuery) q
                WHERE :keywordQuery <> ''
                  AND c.embedding IS NOT NULL
                  AND c.institution = :institution
                  AND c.standard = :standard
                  AND (:subject IS NULL OR :subject = '' OR c.subject = :subject)
                  AND to_tsvector('english', c.content) @@ q
                ORDER BY ts_rank_cd(to_tsvector('english', c.content), q) DESC
                LIMIT :pool
            ),
            fused AS (
                SELECT COALESCE(s.id, k.id) AS id,
                       COALESCE(1.0 / (60 + s.r), 0) + COALESCE(1.0 / (60 + k.r), 0) AS score
                FROM semantic s
                FULL OUTER JOIN keyword k ON k.id = s.id
            )
            SELECT c.*
            FROM fused f
            JOIN document_chunks c ON c.id = f.id
            ORDER BY f.score DESC
            LIMIT :topK
            """, nativeQuery = true)
    List<DocumentChunk> hybridSearch(
            @Param("queryEmbedding") String queryEmbedding,
            @Param("keywordQuery") String keywordQuery,
            @Param("subject") String subject,
            @Param("institution") String institution,
            @Param("standard") String standard,
            @Param("pool") int pool,
            @Param("topK") int topK
    );

    List<DocumentChunk> findByOwnerUsername(String ownerUsername);

    List<DocumentChunk> findByInstitutionAndStandard(String institution, String standard);

    // Powers the "folder list" in the upload UI — every distinct standard
    // that already has material for this school, so admins/teachers pick
    // from existing folders instead of retyping (and accidentally forking)
    // the same class into two differently-spelled standards.
    @Query("""
            SELECT DISTINCT d.standard FROM DocumentChunk d
            WHERE d.institution = :institution
            ORDER BY d.standard
            """)
    List<String> findDistinctStandardsByInstitution(@Param("institution") String institution);

    // Every subject that has material for this student's school + class.
    @Query("""
            SELECT DISTINCT d.subject FROM DocumentChunk d
            WHERE d.institution = :institution
              AND d.standard = :standard
            ORDER BY d.subject
            """)
    List<String> findDistinctSubjects(
            @Param("institution") String institution,
            @Param("standard") String standard
    );

    // The uploaded documents under a subject (partial, case-insensitive
    // match, so "social" also finds "Social Studies") for this school + class.
    @Query("""
            SELECT DISTINCT d.fileName FROM DocumentChunk d
            WHERE d.institution = :institution
              AND d.standard = :standard
              AND d.fileName IS NOT NULL
              AND LOWER(d.subject) LIKE LOWER(CONCAT('%', :subject, '%'))
            ORDER BY d.fileName
            """)
    List<String> findDistinctFileNames(
            @Param("institution") String institution,
            @Param("standard") String standard,
            @Param("subject") String subject
    );

    // NEW: every uploaded file name for this school + class (any subject).
    // Used to detect when a quiz topic is really the name of an uploaded file.
    @Query("""
            SELECT DISTINCT d.fileName FROM DocumentChunk d
            WHERE d.institution = :institution
              AND d.standard = :standard
              AND d.fileName IS NOT NULL
            """)
    List<String> findAllFileNames(
            @Param("institution") String institution,
            @Param("standard") String standard
    );

    // NEW: all chunks of one uploaded file, in ingestion order.
    @Query("""
            SELECT d FROM DocumentChunk d
            WHERE d.institution = :institution
              AND d.standard = :standard
              AND d.fileName = :fileName
            ORDER BY d.id
            """)
    List<DocumentChunk> findByFileName(
            @Param("institution") String institution,
            @Param("standard") String standard,
            @Param("fileName") String fileName
    );

    // One row per uploaded document for this school + class:
    // [sourceId, fileName, subject]. Powers the "pick material to be
    // quizzed on" list in chat.
    @Query("""
            SELECT d.sourceId, MAX(d.fileName), MAX(d.subject) FROM DocumentChunk d
            WHERE d.institution = :institution
              AND d.standard = :standard
            GROUP BY d.sourceId
            ORDER BY MAX(d.subject), MAX(d.fileName)
            """)
    List<Object[]> findMaterials(
            @Param("institution") String institution,
            @Param("standard") String standard
    );

    // All chunks of the given documents, restricted to this school + class
    // so a student can't quiz themselves on another class's material by id.
    @Query("""
            SELECT d FROM DocumentChunk d
            WHERE d.institution = :institution
              AND d.standard = :standard
              AND d.sourceId IN :sourceIds
            ORDER BY d.sourceId, d.id
            """)
    List<DocumentChunk> findBySourceIds(
            @Param("institution") String institution,
            @Param("standard") String standard,
            @Param("sourceIds") List<String> sourceIds
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
}