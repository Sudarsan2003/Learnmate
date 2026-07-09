package com.learnmate.learnmateai.model;

import com.pgvector.PGvector;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.ColumnTransformer;

import java.time.Instant;

@Entity
@Table(name = "document_chunks")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DocumentChunk {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String sourceId;

    @Column(nullable = false)
    private String subject;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Convert(converter = PGvectorConverter.class)
    @ColumnTransformer(write = "?::vector")
    @Column(name = "embedding", columnDefinition = "vector(768)")
    private PGvector embedding;

    @Column(nullable = false)
    private String ownerUsername;

    @Column(nullable = false)
    private Instant uploadedAt = Instant.now();
}