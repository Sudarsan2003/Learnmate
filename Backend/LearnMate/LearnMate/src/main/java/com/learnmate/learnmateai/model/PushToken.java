package com.learnmate.learnmateai.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * A phone that should get push notifications for a user: the Expo push token
 * the LearnMate app received when the user allowed notifications. A token
 * belongs to one user at a time (whoever last logged in on that phone).
 */
@Entity
@Table(name = "push_tokens", indexes = @Index(name = "idx_push_tokens_user", columnList = "username"))
@Data
@NoArgsConstructor
public class PushToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String username;

    @Column(nullable = false, unique = true, length = 255)
    private String token;

    /** "android" or "ios". */
    private String platform;

    @Column(nullable = false)
    private Instant updatedAt;
}
