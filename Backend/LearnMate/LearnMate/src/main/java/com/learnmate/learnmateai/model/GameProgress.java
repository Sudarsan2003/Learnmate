package com.learnmate.learnmateai.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * One row per (user, game). Tracks progression through levels for that game
 * so each game can resume where the student left off, and so
 * GamesDashboard has something to show off.
 *
 * gameType: "MATH" | "WORDS" | "RACE" | "BALLOON" | "MEMORY" | "BIGGER" —
 * kept as a plain string (not an enum column) so adding another game only
 * means allowing the new value in GameController, with no DB migration.
 */
@Entity
@Table(
        name = "game_progress",
        uniqueConstraints = @UniqueConstraint(columnNames = {"username", "gameType"})
)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class GameProgress {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String username;

    @Column(nullable = false)
    private String gameType; // MATH | WORDS | RACE | BALLOON | MEMORY | BIGGER

    // Denormalized copy of the student's institution at the time of their
    // most recent play, kept in sync by GameController#completeLevel. Lets
    // the institute leaderboard query this table directly instead of
    // joining users, and naturally follows a student if they transfer.
    private String institution;

    // Highest level the student has unlocked (starts at 1). The level they
    // are CURRENTLY playing can be <= this, since they can replay old levels.
    @Column(nullable = false)
    private int highestLevelUnlocked = 1;

    // Best star rating (0-3) earned per level so far, keyed by level number.
    // Stored as "1:3,2:2,3:0" rather than a separate table — simple, and this
    // never needs to be queried across users (leaderboard uses totalStars).
    @Column(columnDefinition = "TEXT")
    private String starsByLevel = "";

    @Column(nullable = false)
    private int totalStars = 0;

    @Column(nullable = false)
    private int totalPoints = 0;

    @Column(nullable = false)
    private int gamesPlayed = 0;

    @Column(nullable = false)
    private int bestStreak = 0;

    @Column(nullable = false)
    private int currentStreak = 0; // consecutive days played, for a streak badge

    private LocalDateTime lastPlayedAt;
}