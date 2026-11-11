package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.Story;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface StoryRepository extends JpaRepository<Story, Long> {

    List<Story> findAllByOrderByCreatedAtDesc();

    List<Story> findByInstitutionIgnoreCaseOrderByCreatedAtDesc(String institution);

    List<Story> findByInstitutionIgnoreCaseAndStandardAndStatusOrderByPublishedAtDesc(
            String institution, String standard, Story.Status status);

    List<Story> findByStatus(Story.Status status);

    long countByInstitutionIgnoreCaseAndCreatedAtAfter(String institution, Instant after);
}
