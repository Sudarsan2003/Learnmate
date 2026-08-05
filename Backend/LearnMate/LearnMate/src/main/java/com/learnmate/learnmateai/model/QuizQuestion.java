package com.learnmate.learnmateai.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "quiz_questions")
@Data
@NoArgsConstructor
public class QuizQuestion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "quiz_id", nullable = false)
    private Quiz quiz;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String questionText;

    @Column(nullable = false) private String optionA;
    @Column(nullable = false) private String optionB;
    @Column(nullable = false) private String optionC;
    @Column(nullable = false) private String optionD;

    // Stored as "A" / "B" / "C" / "D" — never sent to students before submission.
    @Column(nullable = false)
    private String correctOption;

    @Column(nullable = false)
    private int orderIndex;

    // AI_GENERATED or MANUAL — lets admins see which questions came from
    // the model vs. themselves later, if that ever matters for review.
    private String source;
}