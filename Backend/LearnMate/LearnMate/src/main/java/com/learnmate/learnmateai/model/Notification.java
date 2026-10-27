package com.learnmate.learnmateai.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * One message in a user's notification bell, e.g. "New quiz: Fractions".
 * Stored per recipient so each student has their own read/unread state.
 */
@Entity
@Table(name = "notifications", indexes = @Index(name = "idx_notifications_user_time", columnList = "username, createdAt"))
@Data
@NoArgsConstructor
public class Notification {

    public static final String QUIZ = "QUIZ";
    public static final String GAME = "GAME";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String username;

    @Column(nullable = false)
    private String type;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String message;

    // Where clicking it goes: "quizzes", or "games:<GAMETYPE>".
    private String link;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    private Instant readAt;
}
