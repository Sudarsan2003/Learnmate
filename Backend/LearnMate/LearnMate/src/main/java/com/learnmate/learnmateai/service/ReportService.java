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
import org.springframework.beans.factory.annotation.Value;
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

    /** One place on a quiz's podium (1st, 2nd, 3rd; tied students share a place). */
    public record PodiumEntry(int rank, String username, String fullName, int score, int total, int percent,
                              long timeTakenSeconds) {}

    public record QuizColumn(Long id, String title, String subject, Instant createdAt,
                             int participants, List<PodiumEntry> podium) {}

    // rank: this student's place among the class on that quiz (1 = top)
    public record QuizScore(int score, int total, int percent, Instant submittedAt, long timeTakenSeconds,
                            int rank, int participants) {}

    public record Topper(int rank, String username, String fullName, int averagePercent, int quizzesTaken) {}

    /** Best students over one week (Monday to Sunday) or one calendar month. */
    public record Toppers(String period, LocalDate start, LocalDate end, int quizzesSet, List<Topper> toppers) {}

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
    // The school's own time zone, so "this week" and date ranges follow the school
    // calendar even when the server runs on UTC.
    private final ZoneId zone;

    public ReportService(UserRepository userRepository, QuizRepository quizRepository,
                         QuizAttemptRepository attemptRepository, ChatQuizAttemptRepository chatQuizRepository,
                         GameProgressRepository gameProgressRepository,
                         @Value("${learnmate.timezone:Asia/Kolkata}") String timezone) {
        this.zone = ZoneId.of(timezone);
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

        // Each quiz's ranking among this class's students: quizId -> username -> rank.
        Map<String, User> byUsername = students.stream().collect(Collectors.toMap(User::getUsername, u -> u));
        Map<Long, List<QuizAttempt>> perQuiz = new HashMap<>();
        attempts.forEach((user, map) -> {
            if (byUsername.containsKey(user)) map.forEach((qid, a) -> perQuiz.computeIfAbsent(qid, k -> new ArrayList<>()).add(a));
        });
        Map<Long, Map<String, Integer>> ranks = new HashMap<>();
        perQuiz.forEach((qid, list) -> ranks.put(qid, rankAttempts(list)));

        List<StudentRow> rows = new ArrayList<>();
        for (User u : students) {
            Map<Long, QuizScore> scores = new LinkedHashMap<>();
            Instant lastActive = null;
            for (Map.Entry<Long, QuizAttempt> e : attempts.getOrDefault(u.getUsername(), Map.of()).entrySet()) {
                QuizAttempt a = e.getValue();
                scores.put(e.getKey(), new QuizScore(a.getScore(), a.getTotalQuestions(),
                        percent(a.getScore(), a.getTotalQuestions()), a.getSubmittedAt(), secondsTaken(a),
                        ranks.get(e.getKey()).get(u.getUsername()), perQuiz.get(e.getKey()).size()));
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
                .map(q -> {
                    List<QuizAttempt> list = perQuiz.getOrDefault(q.getId(), List.of());
                    Map<String, Integer> r = ranks.getOrDefault(q.getId(), Map.of());
                    // A medal needs at least one right answer: a 0% "3rd place" in a small
                    // group would only embarrass a student on a printed sheet.
                    List<PodiumEntry> podium = list.stream()
                            .filter(a -> r.get(a.getUsername()) <= 3 && a.getScore() > 0)
                            .sorted(Comparator.comparing((QuizAttempt a) -> r.get(a.getUsername()))
                                    .thenComparing(a -> displayName(byUsername.get(a.getUsername())), String.CASE_INSENSITIVE_ORDER))
                            .map(a -> new PodiumEntry(r.get(a.getUsername()), a.getUsername(),
                                    byUsername.get(a.getUsername()).getFullName(), a.getScore(), a.getTotalQuestions(),
                                    percent(a.getScore(), a.getTotalQuestions()), secondsTaken(a)))
                            .toList();
                    return new QuizColumn(q.getId(), q.getTitle(), q.getSubject(), q.getCreatedAt(), list.size(), podium);
                })
                .toList();
        return new ClassReport(institution, standard, from, to, Instant.now(), columns, rows, classAverage);
    }

    /**
     * Toppers for the week (Monday to Sunday) or calendar month containing `date`.
     * Each student's score is their average over every quiz set for the class in
     * that period, counting a missed quiz as 0, so taking one easy quiz can't beat
     * doing them all. Ties go to whoever took more quizzes, then the faster total
     * time; only an exact tie shares a place. Returns places 1 to 3, and only
     * students who scored something.
     */
    @Transactional(readOnly = true)
    public Toppers toppers(String institution, String standard, String period, LocalDate date) {
        if (standard == null || standard.isBlank()) throw new IllegalArgumentException("Choose a class.");
        LocalDate day = date == null ? LocalDate.now(zone) : date;
        boolean week = !"MONTH".equalsIgnoreCase(period);
        LocalDate start = week ? day.with(java.time.temporal.TemporalAdjusters.previousOrSame(java.time.DayOfWeek.MONDAY))
                : day.withDayOfMonth(1);
        LocalDate end = week ? start.plusDays(6) : day.with(java.time.temporal.TemporalAdjusters.lastDayOfMonth());
        Instant from = start.atStartOfDay(zone).toInstant();
        Instant until = end.plusDays(1).atStartOfDay(zone).toInstant();

        List<Quiz> quizzes = quizRepository.findByInstitutionAndStandardOrderByCreatedAtAsc(institution, standard).stream()
                .filter(q -> inRange(q.getCreatedAt(), from, until))
                .toList();
        String label = week ? "WEEK" : "MONTH";
        if (quizzes.isEmpty()) return new Toppers(label, start, end, 0, List.of());

        Map<String, User> students = userRepository.findByInstitutionAndStandardAndRoleOrderByUsernameAsc(
                institution, standard, "USER").stream().collect(Collectors.toMap(User::getUsername, u -> u));
        Map<String, List<QuizAttempt>> byStudent = attemptRepository
                .findByQuizIdInAndSubmittedAtIsNotNull(quizzes.stream().map(Quiz::getId).toList()).stream()
                .filter(a -> students.containsKey(a.getUsername()))
                .collect(Collectors.groupingBy(QuizAttempt::getUsername));

        record Total(String username, double average, int taken, long seconds) {}
        List<Total> totals = byStudent.entrySet().stream()
                .map(e -> new Total(e.getKey(),
                        e.getValue().stream().mapToDouble(a -> 100.0 * a.getScore() / Math.max(1, a.getTotalQuestions())).sum()
                                / quizzes.size(),
                        e.getValue().size(),
                        e.getValue().stream().mapToLong(ReportService::secondsTaken).sum()))
                .filter(t -> t.average() > 0) // no medal for scoring nothing
                .sorted(Comparator.comparingDouble(Total::average).reversed()
                        .thenComparing(Comparator.comparingInt(Total::taken).reversed())
                        .thenComparingLong(Total::seconds)
                        .thenComparing(t -> displayName(students.get(t.username())), String.CASE_INSENSITIVE_ORDER))
                .toList();

        List<Topper> toppers = new ArrayList<>();
        int rank = 0;
        Total previous = null;
        for (int i = 0; i < totals.size(); i++) {
            Total t = totals.get(i);
            boolean tied = previous != null && Math.abs(t.average() - previous.average()) < 1e-9
                    && t.taken() == previous.taken() && t.seconds() == previous.seconds();
            if (!tied) rank = i + 1;
            if (rank > 3) break;
            toppers.add(new Topper(rank, t.username(), students.get(t.username()).getFullName(),
                    (int) Math.round(t.average()), t.taken()));
            previous = t;
        }
        return new Toppers(label, start, end, quizzes.size(), toppers);
    }

    /**
     * Places on one quiz, the same rule as the quiz leaderboard students see:
     * most marks first, then whoever finished faster; only an exact tie (same
     * marks and same time) shares a place.
     */
    static Map<String, Integer> rankAttempts(List<QuizAttempt> attempts) {
        List<QuizAttempt> sorted = attempts.stream()
                .sorted(Comparator.comparingInt(QuizAttempt::getScore).reversed()
                        .thenComparingLong(ReportService::secondsTaken))
                .toList();
        Map<String, Integer> ranks = new HashMap<>();
        int rank = 0;
        for (int i = 0; i < sorted.size(); i++) {
            QuizAttempt a = sorted.get(i);
            QuizAttempt prev = i == 0 ? null : sorted.get(i - 1);
            if (prev == null || prev.getScore() != a.getScore() || secondsTaken(prev) != secondsTaken(a)) rank = i + 1;
            ranks.put(a.getUsername(), rank);
        }
        return ranks;
    }

    static long secondsTaken(QuizAttempt a) {
        if (a.getStartedAt() == null || a.getSubmittedAt() == null) return Long.MAX_VALUE / 4;
        return Math.max(0, java.time.Duration.between(a.getStartedAt(), a.getSubmittedAt()).getSeconds());
    }

    private static String displayName(User u) {
        return u.getFullName() != null && !u.getFullName().isBlank() ? u.getFullName() : u.getUsername();
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
