package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.model.Quiz;
import com.learnmate.learnmateai.model.SentAnnouncement;
import com.learnmate.learnmateai.repository.*;
import org.junit.jupiter.api.Test;

import java.time.*;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AnnouncementJobTest {

    private final QuizRepository quizzes = mock(QuizRepository.class);
    private final SentAnnouncementRepository sent = mock(SentAnnouncementRepository.class);
    private final NotificationService notifications = mock(NotificationService.class);
    private final ReportService reports = mock(ReportService.class);
    private final Set<String> sentKeys = new HashSet<>();

    // Wednesday 28 Oct 2026, 10:00 IST
    private final AnnouncementJob job = new AnnouncementJob(quizzes, mock(QuizAttemptRepository.class),
            mock(UserRepository.class), sent, notifications, reports, mock(AchievementService.class),
            ZoneId.of("Asia/Kolkata"), Clock.fixed(Instant.parse("2026-10-28T04:30:00Z"), ZoneOffset.UTC));

    AnnouncementJobTest() {
        when(sent.existsById(anyString())).thenAnswer(inv -> sentKeys.contains((String) inv.getArgument(0)));
        when(sent.save(any())).thenAnswer(inv -> {
            sentKeys.add(((SentAnnouncement) inv.getArgument(0)).getAnnouncementKey());
            return inv.getArgument(0);
        });
    }

    @Test
    void lastWeeksToppersAreAnnouncedExactlyOnce() {
        Quiz lastWeek = new Quiz();
        lastWeek.setInstitution("S");
        lastWeek.setStandard("9");
        lastWeek.setCreatedAt(Instant.parse("2026-10-21T05:00:00Z")); // Wed of the week 19-25 Oct
        Quiz thisWeek = new Quiz();
        thisWeek.setInstitution("S");
        thisWeek.setStandard("10");
        thisWeek.setCreatedAt(Instant.parse("2026-10-27T05:00:00Z")); // still running, not announced yet
        when(quizzes.findByCreatedAtAfter(any())).thenReturn(List.of(lastWeek, thisWeek));
        when(reports.toppers("S", "9", "WEEK", LocalDate.parse("2026-10-19"))).thenReturn(new ReportService.Toppers(
                "WEEK", LocalDate.parse("2026-10-19"), LocalDate.parse("2026-10-25"), 2,
                List.of(new ReportService.Topper(1, "asha", "Asha", 95, 2))));

        job.periodToppers("WEEK");
        job.periodToppers("WEEK"); // the next hourly run

        verify(notifications, times(1)).sendTo(eq(List.of("asha")), eq("ACHIEVEMENT"),
                eq("🥇 You were 1st in Class 9 last week!"), contains("Average 95% over 2 quizzes (19 Oct–25 Oct)"), eq("dashboard"));
        verify(reports, never()).toppers(eq("S"), eq("10"), any(), any());
        assertTrue(sentKeys.contains("WEEK_TOPPERS|2026-10-19|S|9"));
    }
}
