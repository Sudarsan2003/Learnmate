package com.learnmate.learnmateai.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(name = "learning_history")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class LearningHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String username;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String query;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String answer;

    private String subject;
    private String level;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();
}