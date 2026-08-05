package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.agent.EvaluationAgent;
import com.learnmate.learnmateai.agent.RetrievalAgent;
import com.learnmate.learnmateai.dto.*;
import com.learnmate.learnmateai.model.*;
import com.learnmate.learnmateai.repository.*;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

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

        if (creator.getInstitution() == null || creator.getInstitution().isBlank()) {
            throw new IllegalArgumentException("Set an institution on your profile before creating a quiz.");
        }
        if (req.standard() == null || req.standard().isBlank()) {
            throw new IllegalArgumentException("standard is required (e.g. \"1\" through \"10\")");
        }

        Quiz quiz = new Quiz();
        quiz.setTitle(req.title());
        quiz.setSubject(req.subject());
        quiz.setStandard(req.standard());
        quiz.setInstitution(creator.getInstitution());
        quiz.setCreatedByUsername(createdByUsername);
        quiz.setMode(req.mode());

        if (req.mode() == Quiz.QuizMode.SCHEDULED) {
            quiz.setOpensAt(req.opensAt() != null ? Instant.parse(req.opensAt()) : Instant.now());
            quiz.setClosesAt(req.closesAt() != null ? Instant.parse(req.closesAt()) : null);
            quiz.setStatus(Quiz.QuizStatus.OPEN); // opensAt/closesAt gate actual availability
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
                    req.subject(),
                    creator.getInstitution(),
                    req.standard(),
                    10);
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
        return quizRepository.findByInstitutionOrderByCreatedAtDesc(user.getInstitution()).stream()
                .filter(q -> q.getStandard() != null && q.getStandard().equals(user.getStandard()))
                .filter(q -> q.getStatus() == Quiz.QuizStatus.OPEN)
                .filter(q -> q.getMode() == Quiz.QuizMode.OPEN
                        || isWithinSchedule(q, now))
                .toList();
    }

    private boolean isWithinSchedule(Quiz q, Instant now) {
        boolean afterOpen = q.getOpensAt() == null || !now.isBefore(q.getOpensAt());
        boolean beforeClose = q.getClosesAt() == null || now.isBefore(q.getClosesAt());
        return afterOpen && beforeClose;
    }

    public List<QuizQuestionForStudentDto> getQuestionsForStudent(Long quizId, String username) {
        Quiz quiz = requireVisible(quizId, username);

        return questionRepository.findByQuizIdOrderByOrderIndexAsc(quiz.getId()).stream()
                .map(q -> new QuizQuestionForStudentDto(
                        q.getId(), q.getQuestionText(), q.getOptionA(), q.getOptionB(), q.getOptionC(), q.getOptionD()))
                .toList();
    }

    public QuizSubmitResult submit(Long quizId, String username, QuizSubmitRequest req) {
        Quiz quiz = requireVisible(quizId, username);

        if (attemptRepository.findByQuizIdAndUsername(quizId, username).isPresent()) {
            throw new IllegalArgumentException("You have already submitted this quiz.");
        }

        List<QuizQuestion> questions = questionRepository.findByQuizIdOrderByOrderIndexAsc(quizId);

        QuizAttempt attempt = new QuizAttempt();
        attempt.setQuiz(quiz);
        attempt.setUsername(username);
        attempt.setSubmittedAt(Instant.now());
        attempt.setTotalQuestions(questions.size());
        attempt = attemptRepository.save(attempt);

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

        attempt.setScore(score);
        attemptRepository.save(attempt);

        return new QuizSubmitResult(score, questions.size());
    }

    public QuizResultsDto getResults(Long quizId, String requestingAdminUsername) {
        Quiz quiz = quizRepository.findById(quizId)
                .orElseThrow(() -> new IllegalArgumentException("Quiz not found"));

        // Only the creator, or any ADMIN, may view results — a teacher at the
        // same institution who didn't create this quiz should not see it.
        User requester = userRepository.findByUsername(requestingAdminUsername)
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));
        boolean isCreator = quiz.getCreatedByUsername().equals(requestingAdminUsername);
        boolean isAdmin = "ADMIN".equals(requester.getRole());
        if (!isCreator && !isAdmin) {
            throw new IllegalArgumentException("Not authorized to view results for this quiz.");
        }

        List<QuizResultsDto.StudentScore> scores = attemptRepository.findByQuizIdOrderByScoreDesc(quizId).stream()
                .map(a -> new QuizResultsDto.StudentScore(a.getUsername(), a.getScore(), a.getTotalQuestions()))
                .toList();

        List<QuizResultsDto.MissedQuestion> missed = answerRepository.findMissCountsByQuiz(quizId).stream()
                .map(row -> new QuizResultsDto.MissedQuestion((Long) row[0], (String) row[1], (Long) row[2]))
                .toList();

        return new QuizResultsDto(quiz.getId(), quiz.getTitle(), scores, missed);
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

        if (!quiz.getInstitution().equals(user.getInstitution())
                || !quiz.getStandard().equals(user.getStandard())) {
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