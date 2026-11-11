package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.StoryPage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface StoryPageRepository extends JpaRepository<StoryPage, Long> {

    List<StoryPage> findByStoryIdOrderByPageNo(Long storyId);

    Optional<StoryPage> findByStoryIdAndPageNo(Long storyId, int pageNo);

    @Transactional
    @Modifying
    @Query("DELETE FROM StoryPage p WHERE p.storyId = :storyId")
    void deleteByStoryId(@Param("storyId") Long storyId);

    /** Pictures made for a school's stories since {@code after} (the daily picture cap). */
    @Query("SELECT count(p) FROM StoryPage p, Story s WHERE p.storyId = s.id "
            + "AND lower(s.institution) = lower(:institution) AND p.imageGeneratedAt > :after")
    long countImagesSince(@Param("institution") String institution, @Param("after") Instant after);
}
