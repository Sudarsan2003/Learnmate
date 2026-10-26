package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.DocumentChunk;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface DocumentChunkRepository extends JpaRepository<DocumentChunk, Long> {

    @Query(value = """
            SELECT c.*
            FROM document_chunks c
            WHERE c.embedding IS NOT NULL
              AND c.institution = :institution
              AND c.standard = :standard
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
            @Param("institution") String institution,
            @Param("standard") String standard,
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