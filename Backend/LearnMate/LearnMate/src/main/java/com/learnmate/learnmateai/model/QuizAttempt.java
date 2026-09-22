package com.learnmate.learnmateai.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(
        name = "quiz_attempts",
        // One attempt per student per quiz. The service relies on this
        // (findByQuizIdAndUsername returns a single row), and it stops two
        // simultaneous "start" requests from creating duplicate attempts.
        uniqueConstraints = @UniqueConstraint(name = "uk_attempt_quiz_user", columnNames = {"quiz_id", "username"})
)
@Data
@NoArgsConstructor
public class QuizAttempt {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "quiz_id", nullable = false)
    private Quiz quiz;

    @Column(nullable = false)
    private String username;

    @Column(nullable = false)
    private Instant startedAt = Instant.now();

    private Instant submittedAt;

    private int score;
    private int totalQuestions;
}