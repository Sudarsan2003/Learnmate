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

    // Class reports: all submitted attempts for a set of quizzes.
    List<QuizAttempt> findByQuizIdInAndSubmittedAtIsNotNull(java.util.Collection<Long> quizIds);

    // Activity: each student's latest quiz submission, as [username, Instant].
    @org.springframework.data.jpa.repository.Query(
            "SELECT a.username, MAX(a.submittedAt) FROM QuizAttempt a WHERE a.username IN :usernames GROUP BY a.username")
    List<Object[]> lastSubmissionByUser(@org.springframework.data.repository.query.Param("usernames") java.util.Collection<String> usernames);
}
