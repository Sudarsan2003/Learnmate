package com.learnmate.learnmateai.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** One direct message between two people of the same school (see MessageService). */
@Entity
@Table(name = "messages", indexes = {
        @Index(name = "idx_messages_to", columnList = "toUsername,readAt"),
        @Index(name = "idx_messages_from_to", columnList = "fromUsername,toUsername"),
        @Index(name = "idx_messages_institution", columnList = "institution")
})
@Data
@NoArgsConstructor
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // The school both people belong to, so admins can review their own school's messages.
    @Column(nullable = false)
    private String institution;

    @Column(nullable = false)
    private String fromUsername;

    @Column(nullable = false)
    private String toUsername;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String body;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    // When the recipient opened the conversation; null = unread.
    private Instant readAt;
}
