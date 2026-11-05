package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.model.ChatQuizAttempt;
import com.learnmate.learnmateai.model.Quiz;
import com.learnmate.learnmateai.model.QuizAttempt;
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.ChatQuizAttemptRepository;
import com.learnmate.learnmateai.repository.QuizAttemptRepository;
import com.learnmate.learnmateai.repository.QuizRepository;
import com.learnmate.learnmateai.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Which textbook chapters each student is weak in, from their scores on class
 * quizzes and practice quizzes that cover a known chapter (see Quiz.chapter and
 * ChatQuizAttempt.chapter). A chapter averaging under 50% is weak; 50-69% needs
 * practice; 70% and above is strong.
 */
@Service
public class WeaknessService {

    public static final int WEAK_BELOW = 50;
    public static final int PRACTISE_BELOW = 70;

    /** One student's result on one chapter. level: WEAK, PRACTISE or STRONG. */
    public record ChapterScore(String chapter, String book, int quizzes, int averagePercent, int latestPercent,
                               Instant lastAt, String level) {}

    public record StudentScore(String username, String fullName, int averagePercent, int quizzes) {}

    /** One chapter across a class: its average and the students who are weak in it. */
    public record ClassChapter(String chapter, String book, int students, int averagePercent,
                               List<StudentScore> weakStudents) {}

    /** One student's weak and needs-practice chapters, weakest first. */
    public record StudentChapters(String username, String fullName, List<ChapterScore> chapters) {}

    public record ClassWeakness(String standard, List<ClassChapter> chapters, List<StudentChapters> students) {}

    private record Result(String username, String chapter, String book, int percent, Instant at) {}

    private final QuizRepository quizzes;
    private final QuizAttemptRepository attempts;
    private final ChatQuizAttemptRepository practice;
    private final UserRepository users;

    public WeaknessService(QuizRepository quizzes, QuizAttemptRepository attempts,
                           ChatQuizAttemptRepository practice, UserRepository users) {
        this.quizzes = quizzes;
        this.attempts = attempts;
        this.practice = practice;
        this.users = users;
    }

    /** Every chapter the student has been quizzed on, weakest first. */
    @Transactional(readOnly = true)
    public List<ChapterScore> forStudent(String username) {
        User me = users.findByUsername(username).orElseThrow(() -> new IllegalArgumentException("Unknown user"));
        if (me.getInstitution() == null || me.getInstitution().isBlank()) return List.of();
        List<Result> results = new ArrayList<>();
        for (QuizAttempt a : attempts.findByUsernameAndSubmittedAtIsNotNullOrderBySubmittedAtDesc(username)) {
            Quiz q = a.getQuiz();
            if (q.getChapter() != null && sameSchool(q.getInstitution(), me.getInstitution())) results.add(result(a));
        }
        results.addAll(practiceResults(List.of(username)));
        return byChapter(results.stream()).values().stream()
                .sorted(Comparator.comparingInt(ChapterScore::averagePercent))
                .toList();
    }

    /** A class's chapters (weakest first) and each student's weak chapters. */
    @Transactional(readOnly = true)
    public ClassWeakness forClass(String institution, String standard) {
        List<User> students = users.findByInstitutionAndStandardAndRoleOrderByUsernameAsc(institution, standard, "USER");
        Map<String, User> byName = students.stream().collect(Collectors.toMap(User::getUsername, u -> u, (a, b) -> a));

        List<Result> results = new ArrayList<>();
        List<Quiz> chapterQuizzes = quizzes.findByInstitutionAndStandardOrderByCreatedAtAsc(institution, standard).stream()
                .filter(q -> q.getChapter() != null)
                .toList();
        if (!chapterQuizzes.isEmpty()) {
            for (QuizAttempt a : attempts.findByQuizIdInAndSubmittedAtIsNotNull(chapterQuizzes.stream().map(Quiz::getId).toList())) {
                if (byName.containsKey(a.getUsername())) results.add(result(a));
            }
        }
        if (!byName.isEmpty()) results.addAll(practiceResults(byName.keySet()));

        // Per student, per chapter.
        Map<String, Map<String, ChapterScore>> perStudent = results.stream()
                .collect(Collectors.groupingBy(Result::username))
                .entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> byChapter(e.getValue().stream())));

        // Per chapter, across the class.
        Map<String, List<Map.Entry<String, ChapterScore>>> perChapter = new LinkedHashMap<>();
        perStudent.forEach((student, chapters) -> chapters.forEach((key, score) ->
                perChapter.computeIfAbsent(key, k -> new ArrayList<>()).add(Map.entry(student, score))));
        List<ClassChapter> chapters = perChapter.values().stream()
                .map(list -> {
                    ChapterScore any = list.get(0).getValue();
                    int avg = (int) Math.round(list.stream().mapToInt(e -> e.getValue().averagePercent()).average().orElse(0));
                    List<StudentScore> weak = list.stream()
                            .filter(e -> e.getValue().averagePercent() < WEAK_BELOW)
                            .sorted(Comparator.comparingInt(e -> e.getValue().averagePercent()))
                            .map(e -> new StudentScore(e.getKey(), name(byName.get(e.getKey()), e.getKey()),
                                    e.getValue().averagePercent(), e.getValue().quizzes()))
                            .toList();
                    return new ClassChapter(any.chapter(), any.book(), list.size(), avg, weak);
                })
                .sorted(Comparator.comparingInt(ClassChapter::averagePercent))
                .toList();

        List<StudentChapters> studentList = students.stream()
                .map(u -> new StudentChapters(u.getUsername(), name(u, u.getUsername()),
                        perStudent.getOrDefault(u.getUsername(), Map.of()).values().stream()
                                .filter(c -> c.averagePercent() < PRACTISE_BELOW)
                                .sorted(Comparator.comparingInt(ChapterScore::averagePercent))
                                .toList()))
                .filter(s -> !s.chapters().isEmpty())
                .sorted(Comparator.comparing((StudentChapters s) -> -s.chapters().stream()
                                .filter(c -> "WEAK".equals(c.level())).count())
                        .thenComparing(s -> s.chapters().get(0).averagePercent()))
                .toList();
        return new ClassWeakness(standard, chapters, studentList);
    }

    // ------------------------------------------------------------------ helpers

    private List<Result> practiceResults(Collection<String> usernames) {
        return practice.findByUsernameInAndStatus(usernames, ChatQuizAttempt.COMPLETED).stream()
                .filter(p -> p.getChapter() != null && p.getScorePercent() != null)
                .map(p -> new Result(p.getUsername(), p.getChapter(), p.getChapterBook(), p.getScorePercent(),
                        p.getCompletedAt() == null ? p.getCreatedAt() : p.getCompletedAt()))
                .toList();
    }

    private static Result result(QuizAttempt a) {
        int percent = Math.round(100f * a.getScore() / Math.max(1, a.getTotalQuestions()));
        return new Result(a.getUsername(), a.getQuiz().getChapter(), a.getQuiz().getChapterBook(), percent, a.getSubmittedAt());
    }

    /** "book|chapter" -> the scores on it, averaged. */
    private static Map<String, ChapterScore> byChapter(java.util.stream.Stream<Result> results) {
        Map<String, List<Result>> grouped = results.collect(Collectors.groupingBy(
                r -> (r.book() == null ? "" : r.book()) + "|" + r.chapter(), LinkedHashMap::new, Collectors.toList()));
        Map<String, ChapterScore> out = new LinkedHashMap<>();
        grouped.forEach((key, list) -> {
            Result latest = list.stream().max(Comparator.comparing(r -> r.at() == null ? Instant.EPOCH : r.at())).orElseThrow();
            int avg = (int) Math.round(list.stream().mapToInt(Result::percent).average().orElse(0));
            out.put(key, new ChapterScore(latest.chapter(), latest.book(), list.size(), avg, latest.percent(), latest.at(),
                    level(avg)));
        });
        return out;
    }

    static String level(int averagePercent) {
        return averagePercent < WEAK_BELOW ? "WEAK" : averagePercent < PRACTISE_BELOW ? "PRACTISE" : "STRONG";
    }

    private static boolean sameSchool(String a, String b) {
        return a != null && b != null && a.trim().equalsIgnoreCase(b.trim());
    }

    private static String name(User u, String fallback) {
        return u != null && u.getFullName() != null && !u.getFullName().isBlank() ? u.getFullName() : fallback;
    }
}
