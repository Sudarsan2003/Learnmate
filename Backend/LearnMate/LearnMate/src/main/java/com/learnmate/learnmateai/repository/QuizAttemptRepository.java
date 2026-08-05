package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.QuizAttempt;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface QuizAttemptRepository extends JpaRepository<QuizAttempt, Long> {
    List<QuizAttempt> findByQuizIdOrderByScoreDesc(Long quizId);
    Optional<QuizAttempt> findByQuizIdAndUsername(Long quizId, String username);
}