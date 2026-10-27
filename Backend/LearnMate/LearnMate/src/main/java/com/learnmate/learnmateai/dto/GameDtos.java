package com.learnmate.learnmateai.dto;

import java.time.LocalDateTime;

public class GameDtos {

    // Sent by the client when a level ends (win or lose).
    public record GameCompleteRequest(
            String gameType,      // "MATH" | "WORDS" | "RACE" | "BALLOON" | "MEMORY" | "BIGGER" | "SHOP" | "PUZZLE" | "SHAPE" | "DETECTIVE" | "CODE" | "ODDONE" | "DIRECTION" | "CLOCK" | "FAMILY" | "SEATING" | "ANALOGY"
            int level,            // which level was just played
            boolean won,          // did they clear the level's pass threshold?
            int score,            // raw points earned this round
            int stars,            // 0-3, computed client-side from accuracy/time
            int correctCount,
            int totalCount
    ) {}

    // Returned after completing a level, and from GET /progress.
    public record GameProgressResponse(
            String gameType,
            int highestLevelUnlocked,
            int totalStars,
            int totalPoints,
            int gamesPlayed,
            int bestStreak,
            int currentStreak,
            java.util.Map<Integer, Integer> starsByLevel, // level -> best stars (0-3)
            LocalDateTime lastPlayedAt,
            boolean leveledUp // true if this submission just unlocked a new level
    ) {}

    // One row of the institute-wide leaderboard for a single game.
    // `standard` is the student's class (e.g. "5"), looked up from the user
    // table when the leaderboard is built; null if the student has none set.
    public record GameLeaderboardEntry(
            int rank,
            String username,
            int totalStars,
            int totalPoints,
            int highestLevelUnlocked,
            int gamesPlayed,
            int currentStreak,
            String standard
    ) {}

    // Returned from GET /api/games/{gameType}/leaderboard. `me` is null when
    // the caller hasn't played this game yet (they just won't appear in the
    // ranking until they have a GameProgress row).
    public record GameLeaderboardResponse(
            String gameType,
            String institution,
            int totalParticipants,
            java.util.List<GameLeaderboardEntry> entries,
            GameLeaderboardEntry me
    ) {}
}