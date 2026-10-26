package com.learnmate.learnmateai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.learnmate.learnmateai.agent.EvaluationAgent;
import com.learnmate.learnmateai.agent.EvaluationAgent.QuizQuestion;
import com.learnmate.learnmateai.dto.RetrievedChunk;
import com.learnmate.learnmateai.model.ChatQuizAttempt;
import com.learnmate.learnmateai.repository.ChatQuizAttemptRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** Saves quizzes a student generates in chat, grades their answers, and stores the result. */
@Service
public class ChatQuizAttemptService {

    public record QuestionResult(
            int number, String type, String questionText,
            String optionA, String optionB, String optionC, String optionD,
            String correctOption, String selectedOption, String studentAnswer,
            String verdict, int score, String feedback, String whatToReview,
            String explanation, String referenceAnswer) {
    }

    public record AttemptSummary(
            Long id, String topic, String difficulty,
            Integer scorePercent, Integer correctCount, Integer totalQuestions, Instant completedAt) {
    }

    public record AttemptDetail(AttemptSummary summary, List<QuestionResult> results) {
    }

    /** A question as the student sees it while taking the quiz: no answers, no explanations. */
    public record PublicQuestion(
            int number, String type, String questionText,
            String optionA, String optionB, String optionC, String optionD) {
    }

    /**
     * Everything the quiz card needs to render and resume: the questions (answer-free),
     * the answers saved so far, and, once graded, the full result.
     */
    public record AttemptState(
            Long id, String topic, String difficulty, String status,
            List<PublicQuestion> questions, Map<Integer, String> answers,
            AttemptDetail detail) {
    }

    private static final int MAX_ANSWER_CHARS = 8000;

    private final ChatQuizAttemptRepository repo;
    private final EvaluationAgent evaluationAgent;
    // Own instance (same as EvaluationAgent): Spring Boot 4 only provides a Jackson 3 mapper bean.
    private final ObjectMapper mapper = new ObjectMapper();

    public ChatQuizAttemptService(ChatQuizAttemptRepository repo, EvaluationAgent evaluationAgent) {
        this.repo = repo;
        this.evaluationAgent = evaluationAgent;
    }

    // ------------------------------------------------------------ lifecycle

    public ChatQuizAttempt start(String username, String sessionId,
                                 EvaluationAgent.GeneratedQuiz quiz, String studyMaterial) {
        findActive(username, sessionId).ifPresent(this::abandon);

        ChatQuizAttempt a = new ChatQuizAttempt();
        a.setUsername(username);
        a.setSessionId(sessionId);
        a.setTopic(quiz.topic());
        a.setDifficulty(quiz.difficulty());
        a.setStudyMaterial(studyMaterial);
        a.setTotalQuestions(quiz.questions().size());
        a.setQuestionsJson(toJson(quiz.questions()));
        return repo.save(a);
    }

    public Optional<ChatQuizAttempt> findActive(String username, String sessionId) {
        if (sessionId == null || sessionId.isBlank()) return Optional.empty();
        return repo.findFirstByUsernameAndSessionIdAndStatusOrderByCreatedAtDesc(
                username, sessionId, ChatQuizAttempt.IN_PROGRESS);
    }

    /** Looks up one attempt, only if it belongs to this student. */
    public Optional<ChatQuizAttempt> find(Long id, String username) {
        return repo.findByIdAndUsername(id, username);
    }

    public void abandon(ChatQuizAttempt a) {
        a.setStatus(ChatQuizAttempt.ABANDONED);
        repo.save(a);
    }

    public static String buildStudyMaterial(List<RetrievedChunk> chunks) {
        return chunks.stream()
                .map(c -> "[Source: %s]\n%s".formatted(c.sourceId(), c.content()))
                .collect(Collectors.joining("\n\n---\n\n"));
    }

    // ------------------------------------------------------------ answer parsing

    /** Finds "1." / "Q2)" / "3:" / "4-" markers in order and returns the text after each. */
    public static Map<Integer, String> parseAnswers(String text, int total) {
        Map<Integer, String> out = new LinkedHashMap<>();
        if (text == null) return out;

        List<int[]> marks = new ArrayList<>();   // {number, markerStart, markerEnd}
        int from = 0;
        for (int n = 1; n <= total; n++) {
            Matcher m = Pattern.compile("(?<![\\w])[Qq]?" + n + "\\s*[.):\\-]\\s*").matcher(text);
            if (m.find(from)) {
                marks.add(new int[]{n, m.start(), m.end()});
                from = m.end();
            }
        }
        for (int i = 0; i < marks.size(); i++) {
            int end = i + 1 < marks.size() ? marks.get(i + 1)[1] : text.length();
            out.put(marks.get(i)[0], text.substring(marks.get(i)[2], end).trim());
        }
        return out;
    }

    public int questionCount(ChatQuizAttempt a) {
        return a.getTotalQuestions() != null ? a.getTotalQuestions() : readQuestions(a).size();
    }

    // ------------------------------------------------------------ taking the quiz (interactive card)

    /** Builds the quiz card's view of an attempt. Never exposes correct answers before grading. */
    public AttemptState state(ChatQuizAttempt a) {
        List<QuizQuestion> questions = readQuestions(a);
        List<PublicQuestion> shown = new ArrayList<>();
        for (int i = 0; i < questions.size(); i++) {
            QuizQuestion q = questions.get(i);
            boolean mcq = "MCQ".equals(q.type());
            shown.add(new PublicQuestion(i + 1, q.type(), q.questionText(),
                    mcq ? q.optionA() : null, mcq ? q.optionB() : null,
                    mcq ? q.optionC() : null, mcq ? q.optionD() : null));
        }
        AttemptDetail detail = ChatQuizAttempt.COMPLETED.equals(a.getStatus())
                ? new AttemptDetail(summary(a), readResults(a))
                : null;
        return new AttemptState(a.getId(), a.getTopic(), a.getDifficulty(), a.getStatus(),
                shown, readAnswers(a), detail);
    }

    /**
     * Saves the student's in-progress answers, replacing what was saved before (the card sends
     * its full answer map each time, so the latest save always wins). Blank answers are dropped
     * and numbers outside the quiz are ignored.
     */
    public ChatQuizAttempt saveProgress(ChatQuizAttempt a, Map<String, String> raw) {
        int total = questionCount(a);
        Map<Integer, String> clean = new TreeMap<>();
        if (raw != null) {
            for (Map.Entry<String, String> e : raw.entrySet()) {
                int n;
                try {
                    n = Integer.parseInt(e.getKey().trim());
                } catch (NumberFormatException ex) {
                    continue;
                }
                String v = e.getValue();
                if (n < 1 || n > total || v == null || v.isBlank()) continue;
                clean.put(n, v.length() > MAX_ANSWER_CHARS ? v.substring(0, MAX_ANSWER_CHARS) : v);
            }
        }
        return saveAnswers(a, clean);
    }

    /** Grades whatever answers are saved. Safe to call twice: a finished attempt is returned as is. */
    public ChatQuizAttempt submit(ChatQuizAttempt a) {
        if (ChatQuizAttempt.COMPLETED.equals(a.getStatus())) return a;
        return grade(a, readAnswers(a));
    }

    public AttemptDetail detailOf(ChatQuizAttempt a) {
        return new AttemptDetail(summary(a), readResults(a));
    }

    // ------------------------------------------------------------ saving answers

    /** Persists the student's raw answers immediately, before any grading is attempted. */
    public ChatQuizAttempt saveAnswers(ChatQuizAttempt a, Map<Integer, String> answers) {
        a.setAnswersJson(toJson(answers));
        return repo.save(a);
    }

    // ------------------------------------------------------------ grading

    public ChatQuizAttempt grade(ChatQuizAttempt a, Map<Integer, String> answers) {
        List<QuizQuestion> questions = readQuestions(a);
        List<QuestionResult> results = new ArrayList<>();

        for (int i = 0; i < questions.size(); i++) {
            QuizQuestion q = questions.get(i);
            int number = i + 1;
            String answer = answers.getOrDefault(number, "");
            results.add("MCQ".equals(q.type())
                    ? gradeMcq(number, q, answer)
                    : gradeDescriptive(number, q, answer, a.getStudyMaterial()));
        }

        // Answers the AI could not grade are saved but don't drag the percentage down.
        int percent = (int) Math.round(results.stream()
                .filter(r -> !"NOT_GRADED".equals(r.verdict()))
                .mapToInt(QuestionResult::score)
                .average().orElse(0));

        a.setResultsJson(toJson(results));
        a.setScorePercent(percent);
        a.setCorrectCount((int) results.stream().filter(r -> "CORRECT".equals(r.verdict())).count());
        a.setTotalQuestions(results.size());
        a.setStatus(ChatQuizAttempt.COMPLETED);
        a.setCompletedAt(Instant.now());
        return repo.save(a);
    }

    private QuestionResult gradeMcq(int number, QuizQuestion q, String answer) {
        Matcher m = Pattern.compile("(?i)^\\W*(?:option\\s*)?([A-D])\\b").matcher(answer);
        String selected = m.find() ? m.group(1).toUpperCase() : null;
        boolean ok = q.correctOption().equals(selected);
        String verdict = ok ? "CORRECT" : (selected == null ? "NOT_ATTEMPTED" : "INCORRECT");
        return new QuestionResult(number, "MCQ", q.questionText(),
                q.optionA(), q.optionB(), q.optionC(), q.optionD(),
                q.correctOption(), selected, answer,
                verdict, ok ? 100 : 0, null, null, q.explanation(), null);
    }

    private QuestionResult gradeDescriptive(int number, QuizQuestion q, String answer, String material) {
        String verdict = "NOT_ATTEMPTED";
        int score = 0;
        String feedback = null, review = null;

        if (!answer.isBlank()) {
            try {
                String json = evaluationAgent.scoreAnswer(q.questionText(), answer, q.referenceAnswer(), material);
                JsonNode node = mapper.readTree(json);
                score = Math.max(0, Math.min(100, node.path("score").asInt(0)));
                verdict = node.path("verdict").asText("INCORRECT");
                feedback = node.path("feedback").asText(null);
                review = node.path("whatToReview").asText(null);
            } catch (Exception e) {
                // Never lose the quiz because one AI call failed: keep the answer, mark it ungraded.
                verdict = "NOT_GRADED";
                score = 0;
                feedback = "I couldn't auto-grade this answer, but it has been saved.";
                review = null;
            }
        }
        return new QuestionResult(number, "DESCRIPTIVE", q.questionText(),
                null, null, null, null, null, null, answer,
                verdict, score, feedback, review, null, q.referenceAnswer());
    }

    // ------------------------------------------------------------ output

    public String formatResultsForChat(ChatQuizAttempt a) {
        StringBuilder sb = new StringBuilder();
        sb.append("## Quiz results: ").append(a.getTopic()).append("\n\n");
        sb.append("**Score: ").append(a.getScorePercent()).append("%** (")
                .append(a.getCorrectCount()).append(" of ").append(a.getTotalQuestions())
                .append(" fully correct)\n\n");

        for (QuestionResult r : readResults(a)) {
            sb.append("### Q").append(r.number()).append(". ").append(r.questionText()).append("\n\n");
            if ("MCQ".equals(r.type())) {
                sb.append(label(r.verdict())).append(" Your answer: ")
                        .append(r.selectedOption() == null ? "none" : r.selectedOption())
                        .append(". Correct answer: ").append(r.correctOption()).append(".\n\n");
                if (r.explanation() != null && !r.explanation().isBlank()) {
                    sb.append(r.explanation()).append("\n\n");
                }
            } else {
                sb.append(label(r.verdict()));
                if (!"NOT_GRADED".equals(r.verdict()) && !"NOT_ATTEMPTED".equals(r.verdict())) {
                    sb.append(" (").append(r.score()).append("/100)");
                }
                sb.append("\n\n");
                if (r.feedback() != null) sb.append(r.feedback()).append("\n\n");
                if (r.whatToReview() != null) sb.append("*To review:* ").append(r.whatToReview()).append("\n\n");
            }
        }
        sb.append("---\n\nYour answers and score are saved under **Quizzes → My results → Practice quizzes**. "
                + "Ask for another quiz any time.");
        return sb.toString();
    }

    private String label(String verdict) {
        return switch (verdict) {
            case "CORRECT" -> "**Correct.**";
            case "PARTIALLY_CORRECT" -> "**Partially correct.**";
            case "NOT_ATTEMPTED" -> "**Not answered.**";
            case "NOT_GRADED" -> "**Not graded.**";
            default -> "**Incorrect.**";
        };
    }

    public List<AttemptSummary> list(String username) {
        return repo.findByUsernameAndStatusOrderByCompletedAtDesc(username, ChatQuizAttempt.COMPLETED)
                .stream().map(this::summary).toList();
    }

    public Optional<AttemptDetail> detail(Long id, String username) {
        return repo.findByIdAndUsername(id, username)
                .filter(a -> ChatQuizAttempt.COMPLETED.equals(a.getStatus()))
                .map(a -> new AttemptDetail(summary(a), readResults(a)));
    }

    private AttemptSummary summary(ChatQuizAttempt a) {
        return new AttemptSummary(a.getId(), a.getTopic(), a.getDifficulty(),
                a.getScorePercent(), a.getCorrectCount(), a.getTotalQuestions(), a.getCompletedAt());
    }

    // ------------------------------------------------------------ json helpers

    public List<QuestionResult> readResults(ChatQuizAttempt a) {
        return read(a.getResultsJson(), new TypeReference<>() {});
    }

    private List<QuizQuestion> readQuestions(ChatQuizAttempt a) {
        return read(a.getQuestionsJson(), new TypeReference<>() {});
    }

    /** Answers saved so far (empty if none). */
    public Map<Integer, String> readAnswers(ChatQuizAttempt a) {
        String json = a.getAnswersJson();
        if (json == null || json.isBlank()) return new LinkedHashMap<>();
        return read(json, new TypeReference<LinkedHashMap<Integer, String>>() {});
    }

    private <T> T read(String json, TypeReference<T> type) {
        try {
            return mapper.readValue(json, type);
        } catch (Exception e) {
            throw new RuntimeException("Could not read stored quiz data", e);
        }
    }

    private String toJson(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new RuntimeException("Could not store quiz data", e);
        }
    }
}