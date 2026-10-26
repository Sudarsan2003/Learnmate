package com.learnmate.learnmateai.model;

import jakarta.persistence.*;
import java.time.Instant;

/** A quiz a student generated for themselves in chat, plus their saved answers and grading. */
@Entity
@Table(name = "chat_quiz_attempts")
public class ChatQuizAttempt {

    public static final String IN_PROGRESS = "IN_PROGRESS";
    public static final String COMPLETED = "COMPLETED";
    public static final String ABANDONED = "ABANDONED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String username;
    private String sessionId;
    private String topic;
    private String difficulty;
    private String status = IN_PROGRESS;

    @Column(columnDefinition = "TEXT")
    private String questionsJson;

    @Column(columnDefinition = "TEXT")
    private String studyMaterial;

    // NEW: the student's raw answers exactly as submitted ({"1":"B","6":"..."}).
    // Saved BEFORE grading so they are never lost if grading fails.
    @Column(columnDefinition = "TEXT")
    private String answersJson;

    @Column(columnDefinition = "TEXT")
    private String resultsJson;   // per question: student's answer, verdict, score, feedback

    private Integer scorePercent;
    private Integer correctCount;
    private Integer totalQuestions;
    private Instant createdAt = Instant.now();
    private Instant completedAt;

    public Long getId() { return id; }
    public String getUsername() { return username; }
    public void setUsername(String v) { this.username = v; }
    public String getSessionId() { return sessionId; }
    public void setSessionId(String v) { this.sessionId = v; }
    public String getTopic() { return topic; }
    public void setTopic(String v) { this.topic = v; }
    public String getDifficulty() { return difficulty; }
    public void setDifficulty(String v) { this.difficulty = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getQuestionsJson() { return questionsJson; }
    public void setQuestionsJson(String v) { this.questionsJson = v; }
    public String getStudyMaterial() { return studyMaterial; }
    public void setStudyMaterial(String v) { this.studyMaterial = v; }
    public String getAnswersJson() { return answersJson; }
    public void setAnswersJson(String v) { this.answersJson = v; }
    public String getResultsJson() { return resultsJson; }
    public void setResultsJson(String v) { this.resultsJson = v; }
    public Integer getScorePercent() { return scorePercent; }
    public void setScorePercent(Integer v) { this.scorePercent = v; }
    public Integer getCorrectCount() { return correctCount; }
    public void setCorrectCount(Integer v) { this.correctCount = v; }
    public Integer getTotalQuestions() { return totalQuestions; }
    public void setTotalQuestions(Integer v) { this.totalQuestions = v; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant v) { this.completedAt = v; }
}