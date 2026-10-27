package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.model.ChatQuizAttempt;
import com.learnmate.learnmateai.model.GameProgress;
import com.learnmate.learnmateai.model.Quiz;
import com.learnmate.learnmateai.model.QuizAttempt;
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.ChatQuizAttemptRepository;
import com.learnmate.learnmateai.repository.GameProgressRepository;
import com.learnmate.learnmateai.repository.QuizAttemptRepository;
import com.learnmate.learnmateai.repository.QuizRepository;
import com.learnmate.learnmateai.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Class-wise reports for teachers: every student in one class with their
 * scores on the class's quizzes, practice quizzes from chat and games, for an
 * optional date range (e.g. one term). The frontend turns this into a class
 * sheet (CSV / print) and one printable report card per student for parents.
 */
@Service
public class ReportService {

    public record ClassSummary(String standard, long studentCount) {}

    public record QuizColumn(Long id, String title, String subject, Instant createdAt) {}

    public record QuizScore(int score, int total, int percent, Instant submittedAt) {}

    public record StudentRow(
            String username,
            String fullName,                   // null when the account has no real name set
            String email,
            Map<Long, QuizScore> quizScores,   // quizId -> score; missing = not attempted
            int quizzesTaken,
            Integer averagePercent,            // null when no quiz was taken
            int practiceQuizzes,
            Integer practiceAveragePercent,
            int gameStars,
            int gameRounds,
            Instant lastActive
    ) {}

    public record ClassReport(
            String institution,
            String standard,
            LocalDate from,
            LocalDate to,
            Instant generatedAt,
            List<QuizColumn> quizzes,
            List<StudentRow> students,
            Integer classAveragePercent
    ) {}

    private final UserRepository userRepository;
    private final QuizRepository quizRepository;
    private final QuizAttemptRepository attemptRepository;
    private final ChatQuizAttemptRepository chatQuizRepository;
    private final GameProgressRepository gameProgressRepository;

    public ReportService(UserRepository userRepository, QuizRepository quizRepository,
                         QuizAttemptRepository attemptRepository, ChatQuizAttemptRepository chatQuizRepository,
                         GameProgressRepository gameProgressRepository) {
        this.userRepository = userRepository;
        this.quizRepository = quizRepository;
        this.attemptRepository = attemptRepository;
        this.chatQuizRepository = chatQuizRepository;
        this.gameProgressRepository = gameProgressRepository;
    }

    /** Classes at a school that have students, in class order ("1", "2", ..., "10"). */
    public List<ClassSummary> classes(String institution) {
        Map<String, Long> counts = userRepository.findByInstitutionAndRole(institution, "USER").stream()
                .filter(u -> u.getStandard() != null && !u.getStandard().isBlank())
                .collect(Collectors.groupingBy(User::getStandard, Collectors.counting()));
        return counts.entrySet().stream()
                .sorted(Map.Entry.comparingByKey(ReportService::compareStandards))
                .map(e -> new ClassSummary(e.getKey(), e.getValue()))
                .toList();
    }

    @Transactional(readOnly = true)
    public ClassReport classReport(String institution, String standard, LocalDate from, LocalDate to) {
        if (standard == null || standard.isBlank()) {
            throw new IllegalArgumentException("Choose a class.");
        }
        if (from != null && to != null && from.isAfter(to)) {
            throw new IllegalArgumentException("The start date is after the end date.");
        }
        ZoneId zone = ZoneId.systemDefault();
        Instant start = from == null ? null : from.atStartOfDay(zone).toInstant();
        Instant end = to == null ? null : to.plusDays(1).atStartOfDay(zone).toInstant();

        List<User> students = userRepository.findByInstitutionAndStandardAndRoleOrderByUsernameAsc(
                institution, standard, "USER");
        List<String> usernames = students.stream().map(User::getUsername).toList();

        List<Quiz> quizzes = quizRepository.findByInstitutionAndStandardOrderByCreatedAtAsc(institution, standard)
                .stream()
                .filter(q -> inRange(q.getCreatedAt(), start, end))
                .toList();
        List<Long> quizIds = quizzes.stream().map(Quiz::getId).toList();

        // username -> quizId -> attempt
        Map<String, Map<Long, QuizAttempt>> attempts = new HashMap<>();
        if (!quizIds.isEmpty()) {
            for (QuizAttempt a : attemptRepository.findByQuizIdInAndSubmittedAtIsNotNull(quizIds)) {
                if (!inRange(a.getSubmittedAt(), start, end)) continue;
                attempts.computeIfAbsent(a.getUsername(), k -> new HashMap<>()).put(a.getQuiz().getId(), a);
            }
        }

        Map<String, List<ChatQuizAttempt>> practice = usernames.isEmpty() ? Map.of()
                : chatQuizRepository.findByUsernameInAndStatus(usernames, ChatQuizAttempt.COMPLETED).stream()
                        .filter(p -> inRange(p.getCompletedAt(), start, end))
                        .collect(Collectors.groupingBy(ChatQuizAttempt::getUsername));

        // Game totals are lifetime figures (progress isn't stored per date).
        Map<String, List<GameProgress>> games = usernames.isEmpty() ? Map.of()
                : gameProgressRepository.findByUsernameIn(usernames).stream()
                        .collect(Collectors.groupingBy(GameProgress::getUsername));

        List<StudentRow> rows = new ArrayList<>();
        for (User u : students) {
            Map<Long, QuizScore> scores = new LinkedHashMap<>();
            Instant lastActive = null;
            for (Map.Entry<Long, QuizAttempt> e : attempts.getOrDefault(u.getUsername(), Map.of()).entrySet()) {
                QuizAttempt a = e.getValue();
                scores.put(e.getKey(), new QuizScore(a.getScore(), a.getTotalQuestions(),
                        percent(a.getScore(), a.getTotalQuestions()), a.getSubmittedAt()));
                lastActive = later(lastActive, a.getSubmittedAt());
            }
            List<ChatQuizAttempt> myPractice = practice.getOrDefault(u.getUsername(), List.of());
            for (ChatQuizAttempt p : myPractice) lastActive = later(lastActive, p.getCompletedAt());

            List<GameProgress> myGames = games.getOrDefault(u.getUsername(), List.of());
            for (GameProgress g : myGames) {
                if (g.getLastPlayedAt() != null) {
                    lastActive = later(lastActive, g.getLastPlayedAt().atZone(zone).toInstant());
                }
            }

            rows.add(new StudentRow(
                    u.getUsername(),
                    u.getFullName(),
                    u.getEmail() == null ? "" : u.getEmail(),
                    scores,
                    scores.size(),
                    average(scores.values().stream().map(QuizScore::percent).toList()),
                    myPractice.size(),
                    average(myPractice.stream().map(ChatQuizAttempt::getScorePercent).filter(Objects::nonNull).toList()),
                    myGames.stream().mapToInt(GameProgress::getTotalStars).sum(),
                    myGames.stream().mapToInt(GameProgress::getGamesPlayed).sum(),
                    lastActive
            ));
        }

        Integer classAverage = average(rows.stream().map(StudentRow::averagePercent).filter(Objects::nonNull).toList());
        List<QuizColumn> columns = quizzes.stream()
                .map(q -> new QuizColumn(q.getId(), q.getTitle(), q.getSubject(), q.getCreatedAt()))
                .toList();
        return new ClassReport(institution, standard, from, to, Instant.now(), columns, rows, classAverage);
    }

    private static boolean inRange(Instant t, Instant start, Instant end) {
        if (t == null) return start == null && end == null;
        return (start == null || !t.isBefore(start)) && (end == null || t.isBefore(end));
    }

    private static int percent(int score, int total) {
        return total <= 0 ? 0 : Math.round(100f * score / total);
    }

    private static Integer average(List<Integer> values) {
        return values.isEmpty() ? null
                : (int) Math.round(values.stream().mapToInt(Integer::intValue).average().orElse(0));
    }

    private static Instant later(Instant a, Instant b) {
        if (a == null) return b;
        if (b == null) return a;
        return b.isAfter(a) ? b : a;
    }

    /** "2" before "10": numeric classes by number, anything else alphabetically after them. */
    static int compareStandards(String a, String b) {
        boolean na = a.matches("\\d+");
        boolean nb = b.matches("\\d+");
        if (na && nb) return Integer.compare(Integer.parseInt(a), Integer.parseInt(b));
        if (na != nb) return na ? -1 : 1;
        return a.compareToIgnoreCase(b);
    }
}
