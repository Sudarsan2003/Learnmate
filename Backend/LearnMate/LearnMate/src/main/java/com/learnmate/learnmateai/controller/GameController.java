package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.game.GameCatalog;
import com.learnmate.learnmateai.dto.GameDtos.GameCompleteRequest;
import com.learnmate.learnmateai.dto.GameDtos.GameLeaderboardEntry;
import com.learnmate.learnmateai.dto.GameDtos.GameLeaderboardResponse;
import com.learnmate.learnmateai.dto.GameDtos.GameProgressResponse;
import com.learnmate.learnmateai.model.GameProgress;
// NOTE: adjust this import if your User entity lives elsewhere — this
// controller only needs username -> institution / standard, via whatever
// repository already backs /api/auth/me and the profile fields.
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.GameProgressRepository;
import com.learnmate.learnmateai.repository.UserRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/games")
@CrossOrigin(origins = "*")
public class GameController {

    // Every game the API accepts, in the order /progress returns cards. The
    // list lives in GameCatalog so new games are also announced to students.
    // gameType is a plain string column, so adding a game needs no migration.
    private static final List<String> GAME_TYPES = GameCatalog.TYPES;
    private static final int MAX_LEVEL = 9999; // ladder tops out here; tune freely

    private final GameProgressRepository gameProgressRepository;
    private final UserRepository userRepository;

    public GameController(GameProgressRepository gameProgressRepository, UserRepository userRepository) {
        this.gameProgressRepository = gameProgressRepository;
        this.userRepository = userRepository;
    }

    // Validation problems (unknown gameType, locked level, ...) are the
    // caller's mistake, not a server crash: answer 400 with { "message": ... }
    // so the frontend can show the text (it reads response.data.message).
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
    }

    // Every game's progress for the logged-in student, so GamesDashboard can
    // render a card per game (and each game knows which level to resume).
    @GetMapping("/progress")
    public List<GameProgressResponse> myProgress(Authentication auth) {
        String username = auth.getName();
        return GAME_TYPES.stream()
                .map(type -> gameProgressRepository.findByUsernameAndGameType(username, type)
                        .map(gp -> toResponse(gp, false))
                        .orElseGet(() -> emptyResponse(type)))
                .collect(Collectors.toList());
    }

    // Called once per finished level (win OR lose — losing still records the
    // attempt/points, it just won't unlock the next level).
    @PostMapping("/complete")
    public GameProgressResponse completeLevel(@RequestBody GameCompleteRequest req, Authentication auth) {
        String username = auth.getName();
        String gameType = req.gameType() == null ? "" : req.gameType().toUpperCase();
        if (!GAME_TYPES.contains(gameType)) {
            throw new IllegalArgumentException("gameType must be one of: " + GAME_TYPES);
        }
        if (req.level() < 1) {
            throw new IllegalArgumentException("level must be >= 1");
        }

        GameProgress gp = gameProgressRepository.findByUsernameAndGameType(username, gameType)
                .orElseGet(() -> {
                    GameProgress fresh = new GameProgress();
                    fresh.setUsername(username);
                    fresh.setGameType(gameType);
                    return fresh;
                });

        // A student can only submit a level they've actually unlocked (no
        // skipping ahead by calling the API directly).
        if (req.level() > gp.getHighestLevelUnlocked()) {
            throw new IllegalArgumentException("Level " + req.level() + " is not unlocked yet.");
        }

        int stars = Math.max(0, Math.min(3, req.stars()));
        Map<Integer, Integer> starsByLevel = parseStars(gp.getStarsByLevel());
        int previousBest = starsByLevel.getOrDefault(req.level(), 0);
        boolean improved = stars > previousBest;
        if (improved) {
            starsByLevel.put(req.level(), stars);
        }

        boolean leveledUp = false;
        // "Won" a level = cleared its pass threshold (decided client-side per
        // game, e.g. >=70% correct). Unlocks the next rung once, first time.
        if (req.won() && req.level() == gp.getHighestLevelUnlocked() && gp.getHighestLevelUnlocked() < MAX_LEVEL) {
            gp.setHighestLevelUnlocked(gp.getHighestLevelUnlocked() + 1);
            leveledUp = true;
        }

        gp.setStarsByLevel(serializeStars(starsByLevel));
        gp.setTotalStars(starsByLevel.values().stream().mapToInt(Integer::intValue).sum());
        gp.setTotalPoints(gp.getTotalPoints() + plausibleScore(req));
        gp.setGamesPlayed(gp.getGamesPlayed() + 1);

        // Keep the denormalized institution current so the leaderboard below
        // reflects a student's latest institution even if it changed since
        // their last play.
        userRepository.findByUsername(username).ifPresent(u -> gp.setInstitution(u.getInstitution()));

        updateStreak(gp);

        gameProgressRepository.save(gp);
        return toResponse(gp, leveledUp);
    }

    // The score comes from the browser, so cap it at what a real round can
    // earn; otherwise one crafted request tops the school leaderboard. No game
    // awards more than ~30 points per question (the word game's per-word points
    // grow 4% per level, hence the level factor), and rounds are short.
    private static int plausibleScore(GameCompleteRequest req) {
        int questions = Math.max(0, Math.min(req.totalCount(), 50));
        int maxPerQuestion = (int) Math.round(30 * (1 + req.level() * 0.04));
        return Math.max(0, Math.min(req.score(), questions * maxPerQuestion));
    }

    // Institute-wide leaderboard for one game, ranked by total stars (then
    // total points as a tiebreaker). Scoped to the caller's own institution
    // — same pattern as quiz results being scoped to a class/institution.
    // Students with no GameProgress row yet (never played) simply don't
    // appear; `me` is null in that case instead of a rank-less placeholder.
    // Each entry also carries the student's current `standard`, read from the
    // user table so it is always up to date (no denormalized copy to backfill).
    @GetMapping("/{gameType}/leaderboard")
    public GameLeaderboardResponse leaderboard(@PathVariable String gameType, Authentication auth) {
        String type = gameType == null ? "" : gameType.toUpperCase();
        if (!GAME_TYPES.contains(type)) {
            throw new IllegalArgumentException("gameType must be one of: " + GAME_TYPES);
        }

        String username = auth.getName();
        User me = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalStateException("Unknown user: " + username));
        String institution = me.getInstitution();

        if (institution == null || institution.isBlank()) {
            return new GameLeaderboardResponse(type, institution, 0, List.of(), null);
        }

        List<GameProgress> ranked = gameProgressRepository
                .findByGameTypeAndInstitutionAndGamesPlayedGreaterThanOrderByTotalStarsDescTotalPointsDesc(
                        type, institution, 0);

        // username -> standard, via the existing findByUsername so no new
        // repository method is needed. (If leaderboards grow large, swap in a
        // single findByUsernameIn query instead.)
        Map<String, String> standardByUsername = new HashMap<>();
        for (GameProgress gp : ranked) {
            userRepository.findByUsername(gp.getUsername())
                    .map(User::getStandard)
                    .ifPresent(std -> standardByUsername.put(gp.getUsername(), std));
        }

        List<GameLeaderboardEntry> entries = new ArrayList<>();
        GameLeaderboardEntry myEntry = null;
        for (int i = 0; i < ranked.size(); i++) {
            GameProgress gp = ranked.get(i);
            GameLeaderboardEntry entry = new GameLeaderboardEntry(
                    i + 1,
                    gp.getUsername(),
                    gp.getTotalStars(),
                    gp.getTotalPoints(),
                    gp.getHighestLevelUnlocked(),
                    gp.getGamesPlayed(),
                    gp.getCurrentStreak(),
                    standardByUsername.get(gp.getUsername())
            );
            entries.add(entry);
            if (gp.getUsername().equals(username)) {
                myEntry = entry;
            }
        }

        return new GameLeaderboardResponse(type, institution, entries.size(), entries, myEntry);
    }

    // Day-based streak: playing again on the same day doesn't double-count;
    // a gap of more than one day resets it to 1 instead of 0, since "today"
    // itself is a played day.
    private void updateStreak(GameProgress gp) {
        LocalDate today = LocalDate.now();
        LocalDate last = gp.getLastPlayedAt() == null ? null : gp.getLastPlayedAt().toLocalDate();

        if (last == null || last.isBefore(today.minusDays(1))) {
            gp.setCurrentStreak(1);
        } else if (last.equals(today.minusDays(1))) {
            gp.setCurrentStreak(gp.getCurrentStreak() + 1);
        }
        // else last.equals(today): same-day replay, streak unchanged

        gp.setBestStreak(Math.max(gp.getBestStreak(), gp.getCurrentStreak()));
        gp.setLastPlayedAt(LocalDateTime.now());
    }

    private GameProgressResponse toResponse(GameProgress gp, boolean leveledUp) {
        return new GameProgressResponse(
                gp.getGameType(),
                gp.getHighestLevelUnlocked(),
                gp.getTotalStars(),
                gp.getTotalPoints(),
                gp.getGamesPlayed(),
                gp.getBestStreak(),
                gp.getCurrentStreak(),
                parseStars(gp.getStarsByLevel()),
                gp.getLastPlayedAt(),
                leveledUp
        );
    }

    private GameProgressResponse emptyResponse(String gameType) {
        return new GameProgressResponse(gameType, 1, 0, 0, 0, 0, 0, Map.of(), null, false);
    }

    private Map<Integer, Integer> parseStars(String raw) {
        Map<Integer, Integer> map = new LinkedHashMap<>();
        if (raw == null || raw.isBlank()) return map;
        for (String pair : raw.split(",")) {
            String[] kv = pair.split(":");
            if (kv.length == 2) {
                try {
                    map.put(Integer.parseInt(kv[0].trim()), Integer.parseInt(kv[1].trim()));
                } catch (NumberFormatException ignored) {
                    // skip malformed entry rather than failing the whole response
                }
            }
        }
        return map;
    }

    private String serializeStars(Map<Integer, Integer> map) {
        return map.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(e -> e.getKey() + ":" + e.getValue())
                .collect(Collectors.joining(","));
    }
}