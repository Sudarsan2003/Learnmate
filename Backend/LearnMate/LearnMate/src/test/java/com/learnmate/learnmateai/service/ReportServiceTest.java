package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.model.Quiz;
import com.learnmate.learnmateai.model.QuizAttempt;
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.*;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ReportServiceTest {

    private final UserRepository users = mock(UserRepository.class);
    private final QuizRepository quizzes = mock(QuizRepository.class);
    private final QuizAttemptRepository attempts = mock(QuizAttemptRepository.class);
    private final ReportService service = new ReportService(users, quizzes, attempts,
            mock(ChatQuizAttemptRepository.class), mock(GameProgressRepository.class), "Asia/Kolkata");

    private static QuizAttempt attempt(Quiz q, String user, int score, int total, int seconds) {
        QuizAttempt a = new QuizAttempt();
        a.setQuiz(q);
        a.setUsername(user);
        a.setScore(score);
        a.setTotalQuestions(total);
        a.setStartedAt(Instant.parse("2026-10-20T05:00:00Z"));
        a.setSubmittedAt(Instant.parse("2026-10-20T05:00:00Z").plusSeconds(seconds));
        return a;
    }

    private static Quiz quiz(long id, String createdAt) {
        Quiz q = new Quiz();
        q.setId(id);
        q.setCreatedAt(Instant.parse(createdAt));
        return q;
    }

    private static User student(String name) {
        User u = new User();
        u.setUsername(name);
        u.setRole("USER");
        return u;
    }

    @Test
    void quizPlacesUseMarksThenTimeAndOnlyExactTiesShare() {
        Quiz q = quiz(1, "2026-10-20T04:00:00Z");
        Map<String, Integer> r = ReportService.rankAttempts(List.of(
                attempt(q, "slow10", 10, 10, 300),
                attempt(q, "fast10", 10, 10, 120),
                attempt(q, "tieA", 8, 10, 200),
                attempt(q, "tieB", 8, 10, 200),
                attempt(q, "last", 5, 10, 60)));
        assertEquals(1, r.get("fast10"));
        assertEquals(2, r.get("slow10"));
        assertEquals(3, r.get("tieA"));
        assertEquals(3, r.get("tieB"));
        assertEquals(5, r.get("last"), "after a shared 3rd place the next is 5th");
    }

    @Test
    void weeklyToppersCountAMissedQuizAsZero() {
        // Monday 19 Oct 2026 IST week. Quiz 3 was set Sunday 25 Oct 23:30 IST (18:00 UTC):
        // still this week. Quiz 4 is Monday 26 Oct 00:30 IST (25 Oct 19:00 UTC): next week.
        Quiz q1 = quiz(1, "2026-10-19T04:00:00Z");
        Quiz q2 = quiz(2, "2026-10-21T04:00:00Z");
        Quiz q3 = quiz(3, "2026-10-25T18:00:00Z");
        Quiz q4 = quiz(4, "2026-10-25T19:00:00Z");
        when(quizzes.findByInstitutionAndStandardOrderByCreatedAtAsc("S", "9")).thenReturn(List.of(q1, q2, q3, q4));
        when(users.findByInstitutionAndStandardAndRoleOrderByUsernameAsc("S", "9", "USER"))
                .thenReturn(List.of(student("allRounder"), student("oneHit"), student("steady"), student("absent"), student("zero")));
        when(attempts.findByQuizIdInAndSubmittedAtIsNotNull(anyCollection())).thenAnswer(inv -> {
            List<Long> ids = List.copyOf(inv.getArgument(0));
            assertEquals(List.of(1L, 2L, 3L), ids, "only this week's quizzes");
            return List.of(
                    attempt(q1, "allRounder", 9, 10, 100), attempt(q2, "allRounder", 9, 10, 100), attempt(q3, "allRounder", 9, 10, 100),
                    attempt(q1, "oneHit", 10, 10, 50),
                    attempt(q1, "steady", 7, 10, 100), attempt(q2, "steady", 7, 10, 100), attempt(q3, "steady", 7, 10, 100),
                    attempt(q1, "zero", 0, 10, 10));
        });

        ReportService.Toppers t = service.toppers("S", "9", "WEEK", LocalDate.parse("2026-10-23"));

        assertEquals(LocalDate.parse("2026-10-19"), t.start());
        assertEquals(LocalDate.parse("2026-10-25"), t.end());
        assertEquals(3, t.quizzesSet());
        assertEquals(List.of("allRounder", "steady", "oneHit"), t.toppers().stream().map(ReportService.Topper::username).toList());
        assertEquals(90, t.toppers().get(0).averagePercent());
        assertEquals(33, t.toppers().get(2).averagePercent(), "one 100% out of three quizzes");
    }

    @Test
    void monthWithNoQuizzesHasNoToppers() {
        when(quizzes.findByInstitutionAndStandardOrderByCreatedAtAsc("S", "9")).thenReturn(List.of());
        ReportService.Toppers t = service.toppers("S", "9", "MONTH", LocalDate.parse("2026-02-10"));
        assertEquals(LocalDate.parse("2026-02-01"), t.start());
        assertEquals(LocalDate.parse("2026-02-28"), t.end());
        assertTrue(t.toppers().isEmpty());
    }
}
