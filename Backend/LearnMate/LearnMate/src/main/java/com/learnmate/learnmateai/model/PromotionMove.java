package com.learnmate.learnmateai.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** One student's class change in a year-end promotion, kept so it can be undone. */
@Entity
@Table(name = "promotion_moves", indexes = @Index(name = "idx_promotion_batch", columnList = "batchId"))
@Data
@NoArgsConstructor
public class PromotionMove {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String batchId;

    @Column(nullable = false)
    private String institution;

    @Column(nullable = false)
    private String username;

    private String fromStandard;

    private String toStandard;

    @Column(nullable = false)
    private String doneBy;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    // Set when the batch is undone, so it can't be undone twice.
    private Instant undoneAt;
}
