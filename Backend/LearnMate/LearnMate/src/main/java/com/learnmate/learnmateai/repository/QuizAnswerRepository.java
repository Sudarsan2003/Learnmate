package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.QuizAnswer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface QuizAnswerRepository extends JpaRepository<QuizAnswer, Long> {

    List<QuizAnswer> findByAttemptId(Long attemptId);

    // Powers the "most missed questions" admin view: for every question in
    // a quiz, how many attempts got it wrong.
    @Query("""
        SELECT a.question.id, a.question.questionText, COUNT(a)
        FROM QuizAnswer a
        WHERE a.attempt.quiz.id = :quizId AND a.correct = false
        GROUP BY a.question.id, a.question.questionText
        ORDER BY COUNT(a) DESC
        """)
    List<Object[]> findMissCountsByQuiz(@Param("quizId") Long quizId);
}