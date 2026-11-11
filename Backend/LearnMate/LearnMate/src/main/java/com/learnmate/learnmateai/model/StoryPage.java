package com.learnmate.learnmateai.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** One page of a Story: a sentence or two, and its picture. */
@Entity
@Table(name = "story_pages",
        uniqueConstraints = @UniqueConstraint(name = "uk_story_page", columnNames = {"story_id", "page_no"}))
@Data
@NoArgsConstructor
public class StoryPage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "story_id", nullable = false)
    private Long storyId;

    @Column(name = "page_no", nullable = false)
    private int pageNo;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String text;

    // What the picture shows, in English (image models work best in English).
    @Column(columnDefinition = "TEXT")
    private String scene;

    // File name of the picture under learnmate.stories.dir/<storyId>/, or null if none yet.
    private String imageFile;

    // When the current picture was made; also counts pictures for the AI cost report.
    private Instant imageGeneratedAt;

    // Why the picture couldn't be made, if it couldn't.
    @Column(columnDefinition = "TEXT")
    private String imageError;
}
