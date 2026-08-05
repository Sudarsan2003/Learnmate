package com.learnmate.learnmateai.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(name = "quizzes")
@Data
@NoArgsConstructor
public class Quiz {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String title;

    private String subject;

    // Scopes visibility: only students sharing this institution string can
    // see/take the quiz. Set from the creating admin/teacher's own
    // institution at creation time — not user-editable.
    @Column(nullable = false)
    private String institution;

    @Column(nullable = false)
    private String createdByUsername;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private QuizMode mode; // SCHEDULED or OPEN

    private Instant opensAt;   // used when mode == SCHEDULED
    private Instant closesAt;  // used when mode == SCHEDULED; null = admin closes manually

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private QuizStatus status = QuizStatus.DRAFT; // DRAFT, OPEN, CLOSED

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    public enum QuizMode { SCHEDULED, OPEN }
    public enum QuizStatus { DRAFT, OPEN, CLOSED }
}