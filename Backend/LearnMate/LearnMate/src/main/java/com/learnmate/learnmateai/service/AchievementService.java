package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.model.GameProgress;
import com.learnmate.learnmateai.model.Quiz;
import com.learnmate.learnmateai.model.QuizAttempt;
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

/**
 * What students see about their own success (medals won on class quizzes,
 * their class's toppers) and what teachers see about students who have gone
 * quiet (no login, quiz, chat, practice or game for a while).
 */
@Service
public class AchievementService {

    /** A 1st/2nd/3rd place on one quiz (only with a score above 0). */
    public record Medal(Long quizId, String title, String subject, int rank, int percent, int participants, Instant date) {}

    /**
     * 1st/2nd/3rd on one of my class's quizzes. While a quiz is still open, its
     * toppers stay hidden (`locked`) until I've submitted it myself, the same
     * rule as the quiz leaderboard, so nobody sees top scores before trying it.
     */
    public record QuizToppers(Long quizId, String title, String subject, Instant createdAt, boolean open,
                              boolean locked, int participants, List<ReportService.PodiumEntry> podium,
                              Integer myRank, Integer myPercent) {}

    public record Achievements(
            String standard,
            int gold, int silver, int bronze,
            List<Medal> medals,                 // newest first
            ReportService.Toppers thisWeek,
            ReportService.Toppers lastWeek,
            ReportService.Toppers thisMonth,
            List<QuizToppers> quizToppers) {}   // my class's quizzes, newest first

    private static final int QUIZ_TOPPERS_SHOWN = 30;

    public record InactiveStudent(String username, String fullName, String mobile, Instant lastActive,
                                  int missedQuizzes) {}

    public record InactiveList(String standard, int days, int quizzesSet, int classSize, List<InactiveStudent> students) {}

    private final UserRepository users;
    private final QuizRepository quizzes;
    private final QuizAttemptRepository attempts;
    private final ChatMessageRepository chatMessages;
    private final ChatQuizAttemptRepository practice;
    private final GameProgressRepository games;
    private final ReportService reports;
    private final ZoneId zone;

    public AchievementService(UserRepository users, QuizRepository quizzes, QuizAttemptRepository attempts,
                              ChatMessageRepository chatMessages, ChatQuizAttemptRepository practice,
                              GameProgressRepository games, ReportService reports,
                              @Value("${learnmate.timezone:Asia/Kolkata}") String timezone) {
        this.users = users;
        this.quizzes = quizzes;
        this.attempts = attempts;
        this.chatMessages = chatMessages;
        this.practice = practice;
        this.games = games;
        this.reports = reports;
        this.zone = ZoneId.of(timezone);
    }

    // ------------------------------------------------------------------ students: medals and toppers

    @Transactional(readOnly = true)
    public Achievements forStudent(String username) {
        User me = users.findByUsername(username).orElseThrow(() -> new IllegalArgumentException("Unknown user"));
        List<Medal> medals = medalsOf(me);
        int gold = (int) medals.stream().filter(m -> m.rank() == 1).count();
        int silver = (int) medals.stream().filter(m -> m.rank() == 2).count();
        int bronze = (int) medals.stream().filter(m -> m.rank() == 3).count();

        ReportService.Toppers thisWeek = null, lastWeek = null, thisMonth = null;
        List<QuizToppers> quizToppers = List.of();
        if (me.getInstitution() != null && me.getStandard() != null && !me.getStandard().isBlank()) {
            LocalDate today = LocalDate.now(zone);
            thisWeek = reports.toppers(me.getInstitution(), me.getStandard(), "WEEK", today);
            lastWeek = reports.toppers(me.getInstitution(), me.getStandard(), "WEEK", today.minusDays(7));
            thisMonth = reports.toppers(me.getInstitution(), me.getStandard(), "MONTH", today);
            quizToppers = quizToppersFor(me);
        }
        return new Achievements(me.getStandard(), gold, silver, bronze, medals, thisWeek, lastWeek, thisMonth, quizToppers);
    }

    private List<QuizToppers> quizToppersFor(User me) {
        ReportService.ClassReport report = reports.classReport(me.getInstitution(), me.getStandard(), null, null);
        Map<Long, Quiz> byId = quizzes.findByInstitutionAndStandardOrderByCreatedAtAsc(me.getInstitution(), me.getStandard())
                .stream().collect(Collectors.toMap(Quiz::getId, q -> q));
        Map<Long, ReportService.QuizScore> mine = report.students().stream()
                .filter(s -> s.username().equals(me.getUsername()))
                .findFirst()
                .map(ReportService.StudentRow::quizScores)
                .orElse(Map.of());
        Instant now = Instant.now();

        List<QuizToppers> out = new ArrayList<>();
        List<ReportService.QuizColumn> newestFirst = new ArrayList<>(report.quizzes());
        Collections.reverse(newestFirst);
        for (ReportService.QuizColumn q : newestFirst) {
            if (out.size() >= QUIZ_TOPPERS_SHOWN) break;
            Quiz quiz = byId.get(q.id());
            boolean open = quiz != null && quiz.getStatus() == Quiz.QuizStatus.OPEN
                    && (quiz.getClosesAt() == null || quiz.getClosesAt().isAfter(now));
            ReportService.QuizScore my = mine.get(q.id());
            boolean locked = open && my == null;
            out.add(new QuizToppers(q.id(), q.title(), q.subject(), q.createdAt(), open, locked, q.participants(),
                    locked ? List.of() : q.podium(),
                    my != null && my.percent() > 0 ? my.rank() : null,
                    my != null ? my.percent() : null));
        }
        return out;
    }

    /**
     * Medals across every quiz the student has submitted, ranked among the
     * students of the same school (teachers' test attempts don't count). Kept
     * after a year-end promotion, since they're tied to the quizzes, not the class.
     */
    private List<Medal> medalsOf(User me) {
        List<QuizAttempt> mine = attempts.findByUsernameAndSubmittedAtIsNotNullOrderBySubmittedAtDesc(me.getUsername());
        if (mine.isEmpty() || me.getInstitution() == null) return List.of();
        Set<String> schoolStudents = users.findByInstitutionAndRole(me.getInstitution(), "USER").stream()
                .map(User::getUsername).collect(Collectors.toSet());
        Map<Long, List<QuizAttempt>> byQuiz = attempts
                .findByQuizIdInAndSubmittedAtIsNotNull(mine.stream().map(a -> a.getQuiz().getId()).toList()).stream()
                .filter(a -> schoolStudents.contains(a.getUsername()))
                .collect(Collectors.groupingBy(a -> a.getQuiz().getId()));

        List<Medal> medals = new ArrayList<>();
        for (QuizAttempt a : mine) {
            if (a.getScore() <= 0) continue;
            List<QuizAttempt> field = byQuiz.getOrDefault(a.getQuiz().getId(), List.of());
            Integer rank = ReportService.rankAttempts(field).get(me.getUsername());
            if (rank == null || rank > 3) continue;
            Quiz q = a.getQuiz();
            medals.add(new Medal(q.getId(), q.getTitle(), q.getSubject(), rank,
                    Math.round(100f * a.getScore() / Math.max(1, a.getTotalQuestions())), field.size(), a.getSubmittedAt()));
        }
        return medals;
    }

    // ------------------------------------------------------------------ teachers: inactive students

    /** Students of one class with no activity in the last `days` days (or ever), quietest first. */
    @Transactional(readOnly = true)
    public InactiveList inactive(String institution, String standard, int days) {
        if (standard == null || standard.isBlank()) throw new IllegalArgumentException("Choose a class.");
        int window = Math.max(1, Math.min(days, 365));
        Instant since = Instant.now().minus(Duration.ofDays(window));
        List<User> students = users.findByInstitutionAndStandardAndRoleOrderByUsernameAsc(institution, standard, "USER");
        Map<String, Instant> last = lastActive(students);

        List<Quiz> recent = quizzes.findByInstitutionAndStandardOrderByCreatedAtAsc(institution, standard).stream()
                .filter(q -> q.getCreatedAt() != null && q.getCreatedAt().isAfter(since))
                .toList();
        Map<String, Set<Long>> done = recent.isEmpty() ? Map.of()
                : attempts.findByQuizIdInAndSubmittedAtIsNotNull(recent.stream().map(Quiz::getId).toList()).stream()
                        .collect(Collectors.groupingBy(QuizAttempt::getUsername,
                                Collectors.mapping(a -> a.getQuiz().getId(), Collectors.toSet())));

        List<InactiveStudent> quiet = students.stream()
                .filter(u -> !u.isLocked())
                .filter(u -> last.get(u.getUsername()) == null || last.get(u.getUsername()).isBefore(since))
                .map(u -> new InactiveStudent(u.getUsername(), u.getFullName(), u.getMobile(), last.get(u.getUsername()),
                        recent.size() - done.getOrDefault(u.getUsername(), Set.of()).size()))
                .sorted(Comparator.comparing(InactiveStudent::lastActive, Comparator.nullsFirst(Comparator.naturalOrder())))
                .toList();
        return new InactiveList(standard, window, recent.size(), students.size(), quiet);
    }

    /**
     * Latest sign of life for each user: login, quiz, chat message, practice
     * quiz or game. Missing from the map = never active.
     */
    public Map<String, Instant> lastActive(Collection<User> people) {
        Map<String, Instant> last = new HashMap<>();
        if (people.isEmpty()) return last;
        List<String> names = people.stream().map(User::getUsername).toList();
        for (User u : people) merge(last, u.getUsername(), u.getLastLoginAt());
        for (Object[] row : attempts.lastSubmissionByUser(names)) merge(last, (String) row[0], (Instant) row[1]);
        for (Object[] row : chatMessages.lastMessageByUser(names)) merge(last, (String) row[0], (Instant) row[1]);
        for (Object[] row : practice.lastPracticeByUser(names)) merge(last, (String) row[0], (Instant) row[1]);
        for (GameProgress g : games.findByUsernameIn(names)) {
            if (g.getLastPlayedAt() != null) merge(last, g.getUsername(), g.getLastPlayedAt().atZone(zone).toInstant());
        }
        return last;
    }

    private static void merge(Map<String, Instant> last, String user, Instant when) {
        if (when == null) return;
        last.merge(user, when, (a, b) -> a.isAfter(b) ? a : b);
    }

    /** All students per class at a school, for the weekly teacher alert. */
    Map<String, List<User>> classesOf(String institution) {
        return users.findByInstitutionAndRole(institution, "USER").stream()
                .filter(u -> u.getStandard() != null && !u.getStandard().isBlank()
                        && !PromotionService.isPassedOut(u.getStandard()) && !u.isLocked())
                .collect(Collectors.groupingBy(User::getStandard,
                        () -> new TreeMap<>(ReportService::compareStandards), Collectors.toList()));
    }
}
