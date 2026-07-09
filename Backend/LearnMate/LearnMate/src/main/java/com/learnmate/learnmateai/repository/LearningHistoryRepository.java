package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.LearningHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LearningHistoryRepository extends JpaRepository<LearningHistory, Long> {
    List<LearningHistory> findByUsernameOrderByCreatedAtDesc(String username);
}