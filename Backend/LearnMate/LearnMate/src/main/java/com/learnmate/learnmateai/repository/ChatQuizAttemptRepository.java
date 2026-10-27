package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.ChatQuizAttempt;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ChatQuizAttemptRepository extends JpaRepository<ChatQuizAttempt, Long> {

    Optional<ChatQuizAttempt> findFirstByUsernameAndSessionIdAndStatusOrderByCreatedAtDesc(
            String username, String sessionId, String status);

    List<ChatQuizAttempt> findByUsernameAndStatusOrderByCompletedAtDesc(String username, String status);

    Optional<ChatQuizAttempt> findByIdAndUsername(Long id, String username);

    // Class reports: practice quizzes for a group of students.
    List<ChatQuizAttempt> findByUsernameInAndStatus(java.util.Collection<String> usernames, String status);

    // Activity: each student's latest practice quiz, as [username, Instant].
    @org.springframework.data.jpa.repository.Query(
            "SELECT c.username, MAX(c.createdAt) FROM ChatQuizAttempt c WHERE c.username IN :usernames GROUP BY c.username")
    List<Object[]> lastPracticeByUser(@org.springframework.data.repository.query.Param("usernames") java.util.Collection<String> usernames);
}
