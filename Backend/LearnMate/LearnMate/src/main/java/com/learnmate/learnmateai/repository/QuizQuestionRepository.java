package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.QuizQuestion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface QuizQuestionRepository extends JpaRepository<QuizQuestion, Long> {
    List<QuizQuestion> findByQuizIdOrderByOrderIndexAsc(Long quizId);
}