package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.game.GameCatalog;
import com.learnmate.learnmateai.model.AnnouncedGame;
import com.learnmate.learnmateai.model.Notification;
import com.learnmate.learnmateai.model.Quiz;
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.AnnouncedGameRepository;
import com.learnmate.learnmateai.repository.NotificationRepository;
import com.learnmate.learnmateai.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;

class NotificationServiceTest {

    private final NotificationRepository notifications = mock(NotificationRepository.class);
    private final AnnouncedGameRepository announced = mock(AnnouncedGameRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final NotificationService service = new NotificationService(notifications, announced, users);

    private static User user(String name, String role, String school, String cls, boolean locked) {
        User u = new User();
        u.setUsername(name);
        u.setRole(role);
        u.setInstitution(school);
        u.setStandard(cls);
        u.setLocked(locked);
        return u;
    }

    @SuppressWarnings("unchecked")
    private List<Notification> sent() {
        ArgumentCaptor<List<Notification>> captor = ArgumentCaptor.forClass(List.class);
        verify(notifications, atLeastOnce()).saveAll(captor.capture());
        List<Notification> all = new ArrayList<>();
        captor.getAllValues().forEach(all::addAll);
        return all;
    }

    @Test
    void firstStartAnnouncesOnlyTheNewGamesOnceToActiveStudents() {
        when(announced.findAll()).thenReturn(List.of());
        when(users.findAll()).thenReturn(List.of(
                user("asha", "USER", "S", "9", false),
                user("teach", "TEACHER", "S", "9", false),
                user("blocked", "USER", "S", "9", true)));

        service.run(null);

        List<Notification> out = sent();
        assertEquals(1, out.size(), "one card for one active student");
        assertEquals("asha", out.get(0).getUsername());
        long fresh = GameCatalog.GAMES.stream().filter(GameCatalog.Game::announce).count();
        assertEquals(fresh + " new games to try", out.get(0).getTitle());
        assertFalse(out.get(0).getMessage().contains("Math Adventure"), "original games are not announced");
        assertEquals("games:CODE", out.get(0).getLink());
    }

    @Test
    void restartWithEverythingAnnouncedSendsNothing() {
        when(announced.findAll()).thenReturn(GameCatalog.TYPES.stream().map(t -> new AnnouncedGame(t, null)).toList());
        service.run(null);
        verify(notifications, never()).saveAll(anyList());
    }

    @Test
    void newQuizReachesOnlyThatClassAtThatSchool() {
        when(users.findAll()).thenReturn(List.of(
                user("in9", "USER", "Sri Vidya", "9", false),
                user("in9caps", "USER", "sri vidya ", "9", false),
                user("in10", "USER", "Sri Vidya", "10", false),
                user("other", "USER", "Other School", "9", false)));
        Quiz q = new Quiz();
        q.setTitle("Fractions");
        q.setSubject("Maths");
        q.setInstitution("Sri Vidya");
        q.setStandard("9");
        q.setMode(Quiz.QuizMode.OPEN);
        q.setDurationMinutes(15);

        service.quizCreated(q);

        List<Notification> out = sent();
        assertEquals(List.of("in9", "in9caps"), out.stream().map(Notification::getUsername).toList());
        assertEquals("New quiz: Fractions", out.get(0).getTitle());
        assertEquals("Maths quiz for Class 9 · 15 min", out.get(0).getMessage());
        assertEquals("quizzes", out.get(0).getLink());
    }
}
