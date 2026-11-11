package com.learnmate.learnmateai.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

/**
 * One person's AI use on one day (India time): how many questions they asked and
 * how many tokens Anthropic billed for them. Written by AiUsageService; feeds
 * the daily question limit and the per-school usage report.
 */
@Entity
@Table(name = "ai_usage",
        uniqueConstraints = @UniqueConstraint(name = "uk_ai_usage_user_day", columnNames = {"username", "day"}),
        indexes = @Index(name = "ix_ai_usage_day", columnList = "day"))
@Data
@NoArgsConstructor
public class AiUsage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "username", nullable = false)
    private String username;

    // The person's school at the time (null for unattributed background work).
    @Column(name = "institution")
    private String institution;

    @Column(name = "day", nullable = false)
    private LocalDate day;

    // Questions asked (chat messages and "Ask LearnMate" about a quiz).
    @Column(name = "requests", nullable = false, columnDefinition = "integer default 0")
    private int requests;

    @Column(name = "input_tokens", nullable = false, columnDefinition = "bigint default 0")
    private long inputTokens;

    @Column(name = "output_tokens", nullable = false, columnDefinition = "bigint default 0")
    private long outputTokens;

    // Story pictures made (see StoryService).
    @Column(name = "images", nullable = false, columnDefinition = "integer default 0")
    private int images;
}
