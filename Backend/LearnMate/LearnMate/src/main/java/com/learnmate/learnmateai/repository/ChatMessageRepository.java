package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.ChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    List<ChatMessage> findByOwnerUsernameOrderByCreatedAtAsc(String ownerUsername);

    @Modifying
    @Transactional
    void deleteByOwnerUsername(String ownerUsername);
}