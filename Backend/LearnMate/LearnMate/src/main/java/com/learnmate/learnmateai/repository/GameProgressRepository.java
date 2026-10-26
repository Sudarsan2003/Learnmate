package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.GameProgress;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface GameProgressRepository extends JpaRepository<GameProgress, Long> {

    Optional<GameProgress> findByUsernameAndGameType(String username, String gameType);

    List<GameProgress> findByUsername(String username);
    List<GameProgress> findTop20ByGameTypeOrderByTotalStarsDescTotalPointsDesc(String gameType);

    // Institute-scoped leaderboard: only students who share an institution
    // and have actually played (gamesPlayed > 0), ranked by stars then
    // points. GameController re-sorts/ranks the returned list itself, so
    // ordering here just keeps things tidy for debugging/logging.
    List<GameProgress> findByGameTypeAndInstitutionAndGamesPlayedGreaterThanOrderByTotalStarsDescTotalPointsDesc(
            String gameType, String institution, int gamesPlayed);
}