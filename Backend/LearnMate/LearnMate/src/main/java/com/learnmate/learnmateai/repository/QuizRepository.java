package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.Quiz;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface QuizRepository extends JpaRepository<Quiz, Long> {
    List<Quiz> findByInstitutionOrderByCreatedAtDesc(String institution);
    List<Quiz> findByCreatedByUsernameOrderByCreatedAtDesc(String username);

    // Class reports: every quiz set for one class at a school, oldest first.
    List<Quiz> findByInstitutionAndStandardOrderByCreatedAtAsc(String institution, String standard);

    // Results announcements: recent quizzes in any school.
    List<Quiz> findByCreatedAtAfter(java.time.Instant after);
}
