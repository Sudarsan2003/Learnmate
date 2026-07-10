package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.ChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    List<ChatMessage> findByOwnerUsernameOrderByCreatedAtAsc(String ownerUsername);

    List<ChatMessage> findByOwnerUsernameAndSessionIdOrderByCreatedAtAsc(String ownerUsername, String sessionId);

    @Modifying
    @Transactional
    void deleteByOwnerUsername(String ownerUsername);

    @Modifying
    @Transactional
    void deleteByOwnerUsernameAndSessionId(String ownerUsername, String sessionId);

    @Query("""
           SELECT m.sessionId as sessionId,
                  MIN(m.content) as firstMessage,
                  MAX(m.createdAt) as lastMessageAt
           FROM ChatMessage m
           WHERE m.ownerUsername = :ownerUsername AND m.role = 'learner'
           GROUP BY m.sessionId
           ORDER BY MAX(m.createdAt) DESC
           """)
    List<SessionSummary> findSessionSummaries(@Param("ownerUsername") String ownerUsername);

    interface SessionSummary {
        String getSessionId();
        String getFirstMessage();
        Instant getLastMessageAt();
    }
}