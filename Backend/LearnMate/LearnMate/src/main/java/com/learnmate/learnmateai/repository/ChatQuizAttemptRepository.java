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
}