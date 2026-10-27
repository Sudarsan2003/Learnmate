package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.model.Notification;
import com.learnmate.learnmateai.model.Quiz;
import com.learnmate.learnmateai.model.QuizAttempt;
import com.learnmate.learnmateai.model.SentAnnouncement;
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.QuizAttemptRepository;
import com.learnmate.learnmateai.repository.QuizRepository;
import com.learnmate.learnmateai.repository.SentAnnouncementRepository;
import com.learnmate.learnmateai.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Hourly check that sends the notifications tied to the calendar:
 *   - quiz results: medal winners hear "You came 1st in Fractions!" once a quiz closes
 *   - weekly toppers (after each Monday-Sunday week) and monthly toppers
 *   - every Monday, teachers get a count of students who were inactive all week
 * Each announcement is recorded in sent_announcements, so it goes out exactly
 * once even after restarts, and nothing is lost if the server was down when
 * it fell due: the next hourly run catches up.
 */
@Component
public class AnnouncementJob {

    private static final Logger log = LoggerFactory.getLogger(AnnouncementJob.class);
    // Results only for recent quizzes, so the first run after deploying doesn't
    // dig up every quiz the school has ever closed.
    private static final Duration RESULTS_LOOKBACK = Duration.ofDays(30);
    private static final String[] PLACE = {"", "1st", "2nd", "3rd"};
    private static final String[] MEDAL = {"", "🥇", "🥈", "🥉"};

    private final QuizRepository quizzes;
    private final QuizAttemptRepository attempts;
    private final UserRepository users;
    private final SentAnnouncementRepository sent;
    private final NotificationService notifications;
    private final ReportService reports;
    private final AchievementService achievements;
    private final ZoneId zone;
    private final Clock clock;

    @Autowired // the constructor below is for tests, with a fixed clock
    public AnnouncementJob(QuizRepository quizzes, QuizAttemptRepository attempts, UserRepository users,
                           SentAnnouncementRepository sent, NotificationService notifications, ReportService reports,
                           AchievementService achievements, @Value("${learnmate.timezone:Asia/Kolkata}") String timezone) {
        this(quizzes, attempts, users, sent, notifications, reports, achievements, ZoneId.of(timezone), Clock.systemUTC());
    }

    AnnouncementJob(QuizRepository quizzes, QuizAttemptRepository attempts, UserRepository users,
                    SentAnnouncementRepository sent, NotificationService notifications, ReportService reports,
                    AchievementService achievements, ZoneId zone, Clock clock) {
        this.quizzes = quizzes;
        this.attempts = attempts;
        this.users = users;
        this.sent = sent;
        this.notifications = notifications;
        this.reports = reports;
        this.achievements = achievements;
        this.zone = zone;
        this.clock = clock;
    }

    @Scheduled(initialDelayString = "PT2M", fixedDelayString = "PT1H")
    public void run() {
        try {
            quizResults();
            periodToppers("WEEK");
            periodToppers("MONTH");
            inactiveAlerts();
        } catch (RuntimeException e) {
            log.error("Announcement run failed; will retry next hour", e);
        }
    }

    // ------------------------------------------------------------------ quiz results

    /** Medal winners on quizzes that have closed (by a teacher, or a schedule running out). */
    void quizResults() {
        Instant now = clock.instant();
        for (Quiz q : quizzes.findByCreatedAtAfter(now.minus(RESULTS_LOOKBACK))) {
            boolean closed = q.getStatus() == Quiz.QuizStatus.CLOSED
                    || (q.getClosesAt() != null && q.getClosesAt().isBefore(now));
            if (closed) announceQuizResults(q);
        }
    }

    /** Also called straight away when a teacher closes a quiz. */
    public void announceQuizResults(Quiz q) {
        String key = "QUIZ_RESULTS|" + q.getId();
        if (sent.existsById(key)) return;
        Set<String> students = users.findByInstitutionAndRole(q.getInstitution(), "USER").stream()
                .map(User::getUsername).collect(Collectors.toSet());
        List<QuizAttempt> field = attempts.findByQuizIdInAndSubmittedAtIsNotNull(List.of(q.getId())).stream()
                .filter(a -> students.contains(a.getUsername()))
                .toList();
        Map<String, Integer> ranks = ReportService.rankAttempts(field);
        int sentCount = 0;
        for (QuizAttempt a : field) {
            int rank = ranks.get(a.getUsername());
            if (rank > 3 || a.getScore() <= 0) continue;
            int pct = Math.round(100f * a.getScore() / Math.max(1, a.getTotalQuestions()));
            sentCount += notifications.sendTo(List.of(a.getUsername()), Notification.ACHIEVEMENT,
                    MEDAL[rank] + " You came " + PLACE[rank] + " in " + q.getTitle() + "!",
                    "You scored " + pct + "%, " + PLACE[rank] + " of " + field.size() + " in Class " + q.getStandard() + ".",
                    "dashboard");
        }
        markSent(key);
        if (sentCount > 0) log.info("Sent {} medal notifications for quiz {}", sentCount, q.getId());
    }

    // ------------------------------------------------------------------ weekly and monthly toppers

    /** Toppers of the last finished week or month, for every class that had quizzes in it. */
    void periodToppers(String period) {
        LocalDate today = LocalDate.now(clock.withZone(zone));
        boolean week = "WEEK".equals(period);
        LocalDate start = week
                ? today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).minusWeeks(1)
                : today.withDayOfMonth(1).minusMonths(1);
        LocalDate end = week ? start.plusDays(6) : start.with(TemporalAdjusters.lastDayOfMonth());
        Instant from = start.atStartOfDay(zone).toInstant();
        Instant until = end.plusDays(1).atStartOfDay(zone).toInstant();

        Set<List<String>> classes = quizzes.findByCreatedAtAfter(from).stream()
                .filter(q -> q.getCreatedAt().isBefore(until))
                .map(q -> List.of(q.getInstitution(), q.getStandard()))
                .collect(Collectors.toSet());
        String when = week
                ? start.format(DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH)) + "–"
                        + end.format(DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH))
                : start.format(DateTimeFormatter.ofPattern("MMMM yyyy", Locale.ENGLISH));

        for (List<String> c : classes) {
            String key = period + "_TOPPERS|" + start + "|" + c.get(0) + "|" + c.get(1);
            if (sent.existsById(key)) continue;
            ReportService.Toppers t = reports.toppers(c.get(0), c.get(1), period, start);
            for (ReportService.Topper top : t.toppers()) {
                notifications.sendTo(List.of(top.username()), Notification.ACHIEVEMENT,
                        MEDAL[top.rank()] + " You were " + PLACE[top.rank()] + " in Class " + c.get(1)
                                + (week ? " last week!" : " in " + start.format(DateTimeFormatter.ofPattern("MMMM", Locale.ENGLISH)) + "!"),
                        "Average " + top.averagePercent() + "% over " + t.quizzesSet() + (t.quizzesSet() == 1 ? " quiz" : " quizzes")
                                + " (" + when + "). Keep it up!",
                        "dashboard");
            }
            markSent(key);
        }
    }

    // ------------------------------------------------------------------ inactive students, for teachers

    /** Each Monday: tell a school's teachers and admins how many students were inactive all last week. */
    void inactiveAlerts() {
        LocalDate monday = LocalDate.now(clock.withZone(zone)).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        Map<String, List<User>> staffBySchool = users.findAll().stream()
                .filter(u -> ("TEACHER".equals(u.getRole()) || "ADMIN".equals(u.getRole())) && !u.isLocked())
                .filter(u -> u.getInstitution() != null && !u.getInstitution().isBlank())
                .collect(Collectors.groupingBy(User::getInstitution));

        for (Map.Entry<String, List<User>> school : staffBySchool.entrySet()) {
            String key = "INACTIVE|" + monday + "|" + school.getKey();
            if (sent.existsById(key)) continue;
            List<String> parts = new ArrayList<>();
            int total = 0;
            for (String standard : achievements.classesOf(school.getKey()).keySet()) {
                int n = achievements.inactive(school.getKey(), standard, 7).students().size();
                if (n > 0) {
                    parts.add("Class " + standard + ": " + n);
                    total += n;
                }
            }
            if (total > 0) {
                notifications.sendTo(school.getValue().stream().map(User::getUsername).toList(), Notification.ALERT,
                        total + (total == 1 ? " student hasn't" : " students haven't") + " been active this week",
                        String.join(" · ", parts) + ". See Class reports → Needs attention.",
                        "reports");
            }
            markSent(key);
        }
    }

    private void markSent(String key) {
        sent.save(new SentAnnouncement(key, clock.instant()));
    }
}
