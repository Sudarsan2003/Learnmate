package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.game.GameCatalog;
import com.learnmate.learnmateai.model.AnnouncedGame;
import com.learnmate.learnmateai.model.Notification;
import com.learnmate.learnmateai.model.Quiz;
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.AnnouncedGameRepository;
import com.learnmate.learnmateai.repository.NotificationRepository;
import com.learnmate.learnmateai.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Students' notification bell: "New quiz: Fractions", "3 new games to try".
 *
 * Quiz notifications go to the students of the quiz's class when a teacher
 * creates it. Game notifications are sent once, at startup, for any game in
 * GameCatalog that hasn't been announced yet, so shipping a new game is all it
 * takes. Notifications older than 90 days are cleared at startup.
 */
@Service
public class NotificationService implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);
    private static final Duration KEEP = Duration.ofDays(90);
    private static final DateTimeFormatter OPENS =
            DateTimeFormatter.ofPattern("d MMM, h:mm a", Locale.ENGLISH).withZone(ZoneId.systemDefault());

    private final NotificationRepository notifications;
    private final AnnouncedGameRepository announcedGames;
    private final UserRepository users;

    public NotificationService(NotificationRepository notifications, AnnouncedGameRepository announcedGames,
                               UserRepository users) {
        this.notifications = notifications;
        this.announcedGames = announcedGames;
        this.users = users;
    }

    /** Tells every student in the quiz's class about it. */
    @Transactional
    public void quizCreated(Quiz quiz) {
        List<User> students = students().stream()
                .filter(u -> sameText(u.getInstitution(), quiz.getInstitution()) && sameText(u.getStandard(), quiz.getStandard()))
                .toList();
        if (students.isEmpty()) return;

        StringBuilder message = new StringBuilder();
        if (quiz.getSubject() != null && !quiz.getSubject().isBlank()) message.append(quiz.getSubject()).append(" quiz");
        else message.append("Quiz");
        message.append(" for Class ").append(quiz.getStandard());
        if (quiz.getDurationMinutes() != null && quiz.getDurationMinutes() > 0) {
            message.append(" · ").append(quiz.getDurationMinutes()).append(" min");
        }
        if (quiz.getMode() == Quiz.QuizMode.SCHEDULED && quiz.getOpensAt() != null && quiz.getOpensAt().isAfter(Instant.now())) {
            message.append(" · opens ").append(OPENS.format(quiz.getOpensAt()));
        }
        send(students, Notification.QUIZ, "New quiz: " + quiz.getTitle(), message.toString(), "quizzes");
    }

    /** At startup: announce games added since the last run, and clear out old notifications. */
    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        int removed = notifications.deleteOlderThan(Instant.now().minus(KEEP));
        if (removed > 0) log.info("Removed {} notifications older than {} days", removed, KEEP.toDays());

        Set<String> done = announcedGames.findAll().stream().map(AnnouncedGame::getGameType).collect(Collectors.toSet());
        List<GameCatalog.Game> fresh = GameCatalog.GAMES.stream().filter(g -> !done.contains(g.type())).toList();
        if (fresh.isEmpty()) return;

        List<GameCatalog.Game> toAnnounce = fresh.stream().filter(GameCatalog.Game::announce).toList();
        if (!toAnnounce.isEmpty()) {
            String title = toAnnounce.size() == 1
                    ? "New game: " + toAnnounce.get(0).title()
                    : toAnnounce.size() + " new games to try";
            String names = toAnnounce.stream().map(GameCatalog.Game::title).collect(Collectors.joining(", "));
            GameCatalog.Game first = toAnnounce.get(0);
            String where = "aptitude".equals(first.section()) ? "the Aptitude tab" : "Games";
            String message = toAnnounce.size() == 1
                    ? "Find it in " + where + "."
                    : names + ". Find them in " + where + ".";
            int sent = send(students(), Notification.GAME, title, message, "games:" + first.type());
            log.info("Announced {} new game(s) to {} students", toAnnounce.size(), sent);
        }
        Instant now = Instant.now();
        announcedGames.saveAll(fresh.stream().map(g -> new AnnouncedGame(g.type(), now)).toList());
    }

    public List<Notification> latest(String username) {
        return notifications.findTop30ByUsernameOrderByCreatedAtDesc(username);
    }

    public long unreadCount(String username) {
        return notifications.countByUsernameAndReadAtIsNull(username);
    }

    @Transactional
    public void markRead(String username, Long id) {
        notifications.findByIdAndUsername(id, username).ifPresent(n -> {
            if (n.getReadAt() == null) {
                n.setReadAt(Instant.now());
                notifications.save(n);
            }
        });
    }

    public void markAllRead(String username) {
        notifications.markAllRead(username, Instant.now());
    }

    /** Sends one notification to each named user (used by AnnouncementJob). */
    @Transactional
    public int sendTo(List<String> usernames, String type, String title, String message, String link) {
        List<User> recipients = usernames.stream().map(users::findByUsername).flatMap(java.util.Optional::stream).toList();
        return send(recipients, type, title, message, link);
    }

    private int send(List<User> recipients, String type, String title, String message, String link) {
        List<Notification> batch = new ArrayList<>(recipients.size());
        Instant now = Instant.now();
        for (User u : recipients) {
            Notification n = new Notification();
            n.setUsername(u.getUsername());
            n.setType(type);
            n.setTitle(title);
            n.setMessage(message);
            n.setLink(link);
            n.setCreatedAt(now);
            batch.add(n);
        }
        notifications.saveAll(batch);
        return batch.size();
    }

    private List<User> students() {
        return users.findAll().stream().filter(u -> "USER".equals(u.getRole()) && !u.isLocked()).toList();
    }

    // Same rule the quiz list uses to decide which students see a quiz.
    private static boolean sameText(String a, String b) {
        return a != null && b != null && a.trim().equalsIgnoreCase(b.trim());
    }
}
