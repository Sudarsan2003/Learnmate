package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.agent.EvaluationAgent;
import com.learnmate.learnmateai.agent.RetrievalAgent;
import com.learnmate.learnmateai.dto.*;
import com.learnmate.learnmateai.model.*;
import com.learnmate.learnmateai.repository.*;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.*;

@Service
public class QuizService {

    private final QuizRepository quizRepository;
    private final QuizQuestionRepository questionRepository;
    private final QuizAttemptRepository attemptRepository;
    private final QuizAnswerRepository answerRepository;
    private final UserRepository userRepository;
    private final RetrievalAgent retrievalAgent;
    private final EvaluationAgent evaluationAgent;

    public QuizService(QuizRepository quizRepository,
                       QuizQuestionRepository questionRepository,
                       QuizAttemptRepository attemptRepository,
                       QuizAnswerRepository answerRepository,
                       UserRepository userRepository,
                       RetrievalAgent retrievalAgent,
                       EvaluationAgent evaluationAgent) {
        this.quizRepository = quizRepository;
        this.questionRepository = questionRepository;
        this.attemptRepository = attemptRepository;
        this.answerRepository = answerRepository;
        this.userRepository = userRepository;
        this.retrievalAgent = retrievalAgent;
        this.evaluationAgent = evaluationAgent;
    }

    public Quiz createQuiz(QuizCreateRequest req, String createdByUsername) {
        User creator = userRepository.findByUsername(createdByUsername)
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));

        boolean isAdmin = "ADMIN".equals(creator.getRole());
        String institution;
        if (isAdmin) {
            institution = req.institution();
            if (institution == null || institution.isBlank()) {
                throw new IllegalArgumentException("institution is required when creating a quiz as an admin.");
            }
        } else {
            if (creator.getInstitution() == null || creator.getInstitution().isBlank()) {
                throw new IllegalArgumentException("Set an institution on your profile before creating a quiz.");
            }
            institution = creator.getInstitution();
        }
        if (req.standard() == null || req.standard().isBlank()) {
            throw new IllegalArgumentException("standard is required (e.g. \"1\" through \"10\")");
        }
        if (req.durationMinutes() != null && (req.durationMinutes() < 1 || req.durationMinutes() > 180)) {
            throw new IllegalArgumentException("durationMinutes must be between 1 and 180.");
        }

        Quiz quiz = new Quiz();
        quiz.setTitle(req.title());
        quiz.setSubject(req.subject());
        quiz.setStandard(req.standard().trim());
        quiz.setInstitution(institution.trim());
        quiz.setCreatedByUsername(createdByUsername);
        quiz.setMode(req.mode());
        quiz.setDurationMinutes(req.durationMinutes());

        if (req.mode() == Quiz.QuizMode.SCHEDULED) {
            quiz.setOpensAt(req.opensAt() != null ? Instant.parse(req.opensAt()) : Instant.now());
            quiz.setClosesAt(req.closesAt() != null ? Instant.parse(req.closesAt()) : null);
            quiz.setStatus(Quiz.QuizStatus.OPEN);
        } else {
            quiz.setStatus(Quiz.QuizStatus.OPEN);
        }

        quiz = quizRepository.save(quiz);

        List<QuizCreateRequest.ManualQuestion> allQuestions = new ArrayList<>();
        int orderIndex = 0;

        if (req.manualQuestions() != null) {
            for (var q : req.manualQuestions()) {
                saveQuestion(quiz, q, "MANUAL", orderIndex++);
            }
        }

        if (req.aiGenerateCount() != null && req.aiGenerateCount() > 0) {
            var chunks = retrievalAgent.retrieve(
                    req.subject() == null ? req.title() : req.subject(),
                    req.subject(), institution, req.standard(), 10);
            if (chunks.isEmpty()) {
                throw new IllegalArgumentException(
                        "No study material found for subject '" + req.subject() + "' and standard '"
                                + req.standard() + "' to generate AI questions from.");
            }
            var generated = evaluationAgent.generateMcqQuestions(chunks, req.aiGenerateCount());
            for (var q : generated) {
                saveQuestion(quiz, q, "AI_GENERATED", orderIndex++);
            }
        }

        return quiz;
    }

    private void saveQuestion(Quiz quiz, QuizCreateRequest.ManualQuestion q, String source, int orderIndex) {
        QuizQuestion question = new QuizQuestion();
        question.setQuiz(quiz);
        question.setQuestionText(q.questionText());
        question.setOptionA(q.optionA());
        question.setOptionB(q.optionB());
        question.setOptionC(q.optionC());
        question.setOptionD(q.optionD());
        question.setCorrectOption(q.correctOption().toUpperCase());
        question.setOrderIndex(orderIndex);
        question.setSource(source);
        questionRepository.save(question);
    }

    public List<Quiz> listAvailableQuizzesForStudent(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));

        if (user.getInstitution() == null || user.getInstitution().isBlank()) {
            return List.of();
        }

        Instant now = Instant.now();
        return quizRepository.findAll().stream()
                .filter(q -> matchesScope(q.getInstitution(), user.getInstitution())
                        && matchesScope(q.getStandard(), user.getStandard()))
                .filter(q -> q.getStatus() == Quiz.QuizStatus.OPEN)
                .filter(q -> q.getMode() == Quiz.QuizMode.OPEN || isWithinSchedule(q, now))
                // NEW: hide quizzes this student has already started/submitted
                .filter(q -> attemptRepository.findByQuizIdAndUsername(q.getId(), username).isEmpty())
                .toList();
    }

    private boolean matchesScope(String quizValue, String userValue) {
        if (quizValue == null || userValue == null) return false;
        return quizValue.trim().equalsIgnoreCase(userValue.trim());
    }

    private boolean isWithinSchedule(Quiz q, Instant now) {
        boolean afterOpen = q.getOpensAt() == null || !now.isBefore(q.getOpensAt());
        boolean beforeClose = q.getClosesAt() == null || now.isBefore(q.getClosesAt());
        return afterOpen && beforeClose;
    }

    /**
     * Starts (or resumes) a student's attempt: creates the QuizAttempt row on
     * first call so the timer has a fixed startedAt, returns the same
     * startedAt/deadline on subsequent calls (e.g. page refresh) instead of
     * resetting the clock, and hands back the questions in a per-student
     * shuffled order.
     */
    public QuizStartDto startQuiz(Long quizId, String username) {
        Quiz quiz = requireVisible(quizId, username);

        QuizAttempt attempt = attemptRepository.findByQuizIdAndUsername(quizId, username)
                .orElseGet(() -> {
                    QuizAttempt a = new QuizAttempt();
                    a.setQuiz(quiz);
                    a.setUsername(username);
                    a.setStartedAt(Instant.now());
                    return attemptRepository.save(a);
                });

        if (attempt.getSubmittedAt() != null) {
            throw new IllegalArgumentException("You have already submitted this quiz.");
        }

        Instant deadline = quiz.getDurationMinutes() != null
                ? attempt.getStartedAt().plus(Duration.ofMinutes(quiz.getDurationMinutes()))
                : null;

        List<QuizQuestionForStudentDto> questions = jumbledQuestions(quizId, username).stream()
                .map(q -> new QuizQuestionForStudentDto(
                        q.getId(), q.getQuestionText(), q.getOptionA(), q.getOptionB(), q.getOptionC(), q.getOptionD()))
                .toList();

        return new QuizStartDto(quiz.getId(), quiz.getTitle(), questions, quiz.getDurationMinutes(), deadline);
    }

    // Deterministic per-student order: same student always sees the same
    // order across reloads, but different students see different orders.
    private List<QuizQuestion> jumbledQuestions(Long quizId, String username) {
        List<QuizQuestion> questions = new ArrayList<>(questionRepository.findByQuizIdOrderByOrderIndexAsc(quizId));
        long seed = Objects.hash(quizId, username);
        Collections.shuffle(questions, new Random(seed));
        return questions;
    }

    public QuizSubmitResult submit(Long quizId, String username, QuizSubmitRequest req) {
        Quiz quiz = requireVisible(quizId, username);

        QuizAttempt attempt = attemptRepository.findByQuizIdAndUsername(quizId, username)
                .orElseThrow(() -> new IllegalArgumentException("Start the quiz before submitting."));

        if (attempt.getSubmittedAt() != null) {
            throw new IllegalArgumentException("You have already submitted this quiz.");
        }

        List<QuizQuestion> questions = questionRepository.findByQuizIdOrderByOrderIndexAsc(quizId);

        int score = 0;
        for (QuizQuestion question : questions) {
            String selected = req.answers().stream()
                    .filter(a -> a.questionId().equals(question.getId()))
                    .map(QuizSubmitRequest.AnswerInput::selectedOption)
                    .findFirst()
                    .orElse(null);

            boolean correct = selected != null && selected.equalsIgnoreCase(question.getCorrectOption());
            if (correct) score++;

            QuizAnswer answer = new QuizAnswer();
            answer.setAttempt(attempt);
            answer.setQuestion(question);
            answer.setSelectedOption(selected);
            answer.setCorrect(correct);
            answerRepository.save(answer);
        }

        attempt.setSubmittedAt(Instant.now());
        attempt.setScore(score);
        attempt.setTotalQuestions(questions.size());
        attemptRepository.save(attempt);

        return new QuizSubmitResult(score, questions.size());
    }

    /**
     * "Ask LearnMate" — only available once the student has submitted, and
     * scoped strictly to that student's own quiz questions/answers so the
     * AI can't be used as a general chat backdoor.
     */
    public String askAboutQuiz(Long quizId, String username, QuizAskRequest req) {
        QuizAttempt attempt = attemptRepository.findByQuizIdAndUsername(quizId, username)
                .filter(a -> a.getSubmittedAt() != null)
                .orElseThrow(() -> new IllegalArgumentException("Submit the quiz before asking LearnMate about it."));

        if (req.question() == null || req.question().isBlank()) {
            throw new IllegalArgumentException("question is required.");
        }

        List<QuizQuestion> questions = questionRepository.findByQuizIdOrderByOrderIndexAsc(quizId);
        Map<Long, QuizAnswer> answersByQuestion = new HashMap<>();
        for (QuizAnswer a : answerRepository.findByAttemptId(attempt.getId())) {
            answersByQuestion.put(a.getQuestion().getId(), a);
        }

        if (req.questionId() != null) {
            questions = questions.stream().filter(q -> q.getId().equals(req.questionId())).toList();
            if (questions.isEmpty()) {
                throw new IllegalArgumentException("That question isn't part of this quiz.");
            }
        }

        String context = buildQuizContext(questions, answersByQuestion);
        return evaluationAgent.explainQuizAnswer(context, req.question());
    }

    private String buildQuizContext(List<QuizQuestion> questions, Map<Long, QuizAnswer> answersByQuestion) {
        StringBuilder sb = new StringBuilder();
        for (QuizQuestion q : questions) {
            QuizAnswer ans = answersByQuestion.get(q.getId());
            sb.append("Question: ").append(q.getQuestionText()).append("\n");
            sb.append("A) ").append(q.getOptionA()).append("\n");
            sb.append("B) ").append(q.getOptionB()).append("\n");
            sb.append("C) ").append(q.getOptionC()).append("\n");
            sb.append("D) ").append(q.getOptionD()).append("\n");
            sb.append("Correct answer: ").append(q.getCorrectOption()).append("\n");
            if (ans != null) {
                sb.append("Student's answer: ").append(ans.getSelectedOption() == null ? "(no answer)" : ans.getSelectedOption())
                        .append(ans.isCorrect() ? " (correct)" : " (incorrect)").append("\n");
            }
            sb.append("\n---\n\n");
        }
        return sb.toString();
    }

    public QuizResultsDto getResults(Long quizId, String requestingAdminUsername) {
        Quiz quiz = quizRepository.findById(quizId)
                .orElseThrow(() -> new IllegalArgumentException("Quiz not found"));

        User requester = userRepository.findByUsername(requestingAdminUsername)
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));
        boolean isCreator = quiz.getCreatedByUsername().equals(requestingAdminUsername);
        boolean isAdmin = "ADMIN".equals(requester.getRole());
        if (!isCreator && !isAdmin) {
            throw new IllegalArgumentException("Not authorized to view results for this quiz.");
        }

        List<QuizResultsDto.StudentScore> scores = attemptRepository.findByQuizIdOrderByScoreDesc(quizId).stream()
                .filter(a -> a.getSubmittedAt() != null) // exclude in-progress attempts from results
                .map(a -> new QuizResultsDto.StudentScore(a.getUsername(), a.getScore(), a.getTotalQuestions(), a.getSubmittedAt()))
                .toList();

        List<QuizResultsDto.MissedQuestion> missed = answerRepository.findMissCountsByQuiz(quizId).stream()
                .map(row -> new QuizResultsDto.MissedQuestion((Long) row[0], (String) row[1], (Long) row[2]))
                .toList();

        return new QuizResultsDto(quiz.getId(), quiz.getTitle(), scores, missed);
    }

    /**
     * Every quiz this admin/teacher has created, with a live submission
     * count — backs the "quizzes you've created" dashboard so it survives
     * across browsers/devices instead of living only in localStorage.
     */
    public List<QuizSummaryDto> listMyQuizzes(String username) {
        return quizRepository.findByCreatedByUsernameOrderByCreatedAtDesc(username).stream()
                .map(q -> new QuizSummaryDto(
                        q.getId(), q.getTitle(), q.getSubject(), q.getStandard(), q.getInstitution(),
                        q.getMode(), q.getStatus(), q.getDurationMinutes(),
                        attemptRepository.countByQuizIdAndSubmittedAtIsNotNull(q.getId())))
                .toList();
    }

    /**
     * Every quiz this student has submitted, with their marks and the date
     * they submitted — so results stay visible to the student long after
     * the "submitted successfully" screen is gone.
     */
    public List<QuizMyResultDto> listMyResults(String username) {
        return attemptRepository.findByUsernameAndSubmittedAtIsNotNullOrderBySubmittedAtDesc(username).stream()
                .map(a -> new QuizMyResultDto(
                        a.getQuiz().getId(), a.getQuiz().getTitle(), a.getQuiz().getSubject(),
                        a.getQuiz().getStandard(), a.getScore(), a.getTotalQuestions(), a.getSubmittedAt()))
                .toList();
    }

    /**
     * Full per-question review of a student's own submitted attempt —
     * scoped strictly to that student's own attempt, same as askAboutQuiz.
     */
    public QuizAttemptDetailDto getMyAttemptDetail(Long quizId, String username) {
        Quiz quiz = quizRepository.findById(quizId)
                .orElseThrow(() -> new IllegalArgumentException("Quiz not found"));

        QuizAttempt attempt = attemptRepository.findByQuizIdAndUsername(quizId, username)
                .filter(a -> a.getSubmittedAt() != null)
                .orElseThrow(() -> new IllegalArgumentException("You haven't submitted this quiz yet."));

        List<QuizQuestion> questions = questionRepository.findByQuizIdOrderByOrderIndexAsc(quizId);
        Map<Long, QuizAnswer> answersByQuestion = new HashMap<>();
        for (QuizAnswer a : answerRepository.findByAttemptId(attempt.getId())) {
            answersByQuestion.put(a.getQuestion().getId(), a);
        }

        List<QuizAttemptDetailDto.QuestionReview> reviews = questions.stream()
                .map(q -> {
                    QuizAnswer ans = answersByQuestion.get(q.getId());
                    return new QuizAttemptDetailDto.QuestionReview(
                            q.getId(), q.getQuestionText(), q.getOptionA(), q.getOptionB(),
                            q.getOptionC(), q.getOptionD(), q.getCorrectOption(),
                            ans != null ? ans.getSelectedOption() : null,
                            ans != null && ans.isCorrect());
                })
                .toList();

        return new QuizAttemptDetailDto(quiz.getId(), quiz.getTitle(), attempt.getScore(),
                attempt.getTotalQuestions(), attempt.getSubmittedAt(), reviews);
    }

    public void closeQuiz(Long quizId, String username) {
        Quiz quiz = quizRepository.findById(quizId)
                .orElseThrow(() -> new IllegalArgumentException("Quiz not found"));

        User requester = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));
        boolean isCreator = quiz.getCreatedByUsername().equals(username);
        boolean isAdmin = "ADMIN".equals(requester.getRole());
        if (!isCreator && !isAdmin) {
            throw new IllegalArgumentException("Not authorized to close this quiz.");
        }

        quiz.setStatus(Quiz.QuizStatus.CLOSED);
        quizRepository.save(quiz);
    }

    private Quiz requireVisible(Long quizId, String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));
        Quiz quiz = quizRepository.findById(quizId)
                .orElseThrow(() -> new IllegalArgumentException("Quiz not found"));

        if (!matchesScope(quiz.getInstitution(), user.getInstitution())
                || !matchesScope(quiz.getStandard(), user.getStandard())) {
            throw new IllegalArgumentException("This quiz is not available to you.");
        }
        if (quiz.getStatus() != Quiz.QuizStatus.OPEN) {
            throw new IllegalArgumentException("This quiz is not currently open.");
        }
        if (quiz.getMode() == Quiz.QuizMode.SCHEDULED && !isWithinSchedule(quiz, Instant.now())) {
            throw new IllegalArgumentException("This quiz is not open right now.");
        }
        return quiz;
    }
}