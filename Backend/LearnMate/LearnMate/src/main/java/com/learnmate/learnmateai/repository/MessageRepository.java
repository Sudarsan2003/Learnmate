package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.Message;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

public interface MessageRepository extends JpaRepository<Message, Long> {

    // Messages between two people, oldest first, after a given id (0 = from the start).
    @Query("""
            SELECT m FROM Message m
            WHERE ((m.fromUsername = :a AND m.toUsername = :b) OR (m.fromUsername = :b AND m.toUsername = :a))
              AND m.id > :afterId
            ORDER BY m.id
            """)
    List<Message> findThread(@Param("a") String a, @Param("b") String b, @Param("afterId") long afterId);

    // Everything someone sent or received, newest first (their conversation list).
    @Query("SELECT m FROM Message m WHERE m.fromUsername = :u OR m.toUsername = :u ORDER BY m.id DESC")
    List<Message> findInvolving(@Param("u") String username);

    // A school's messages, newest first (for its admins to review).
    List<Message> findByInstitutionIgnoreCaseOrderByIdDesc(String institution);

    long countByToUsernameAndReadAtIsNull(String toUsername);

    long countByToUsernameAndFromUsernameAndReadAtIsNull(String toUsername, String fromUsername);

    @Modifying
    @Transactional
    @Query("UPDATE Message m SET m.readAt = :now WHERE m.toUsername = :me AND m.fromUsername = :other AND m.readAt IS NULL")
    int markRead(@Param("me") String me, @Param("other") String other, @Param("now") Instant now);
}
