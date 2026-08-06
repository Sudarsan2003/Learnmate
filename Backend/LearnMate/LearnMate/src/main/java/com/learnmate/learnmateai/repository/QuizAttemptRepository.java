package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.QuizAttempt;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface QuizAttemptRepository extends JpaRepository<QuizAttempt, Long> {
    List<QuizAttempt> findByQuizIdOrderByScoreDesc(Long quizId);
    Optional<QuizAttempt> findByQuizIdAndUsername(Long quizId, String username);

    // Powers GET /api/quizzes/my-results — a student's full submission
    // history, most recent first, marks + date included.
    List<QuizAttempt> findByUsernameAndSubmittedAtIsNotNullOrderBySubmittedAtDesc(String username);

    // Powers the "submissions" count on GET /api/quizzes/mine.
    long countByQuizIdAndSubmittedAtIsNotNull(Long quizId);
}