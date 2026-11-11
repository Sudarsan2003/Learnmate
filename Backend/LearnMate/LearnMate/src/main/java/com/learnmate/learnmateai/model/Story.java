package com.learnmate.learnmateai.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * A short picture book for young children (LKG / UKG and up), written by the AI
 * from a topic and the school's material, illustrated by an image model, and
 * shown to students only after a teacher publishes it. See StoryService.
 */
@Entity
@Table(name = "stories", indexes = @Index(name = "ix_stories_school_class", columnList = "institution, standard"))
@Data
@NoArgsConstructor
public class Story {

    public enum Status { GENERATING, READY, PUBLISHED, FAILED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String institution;

    // The class it is for: "LKG", "UKG", "1", ...
    @Column(nullable = false)
    private String standard;

    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String topic;

    // English, Kannada, Telugu or Hindi.
    @Column(nullable = false)
    private String language = "English";

    // How the main character looks, repeated in every picture's prompt so pages match.
    @Column(columnDefinition = "TEXT")
    private String characterDescription;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.GENERATING;

    // Why generation failed, for the teacher.
    @Column(columnDefinition = "TEXT")
    private String error;

    @Column(nullable = false)
    private String createdBy;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    private Instant publishedAt;
}
