package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.Quiz;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface QuizRepository extends JpaRepository<Quiz, Long> {
    List<Quiz> findByInstitutionOrderByCreatedAtDesc(String institution);
    List<Quiz> findByCreatedByUsernameOrderByCreatedAtDesc(String username);
}