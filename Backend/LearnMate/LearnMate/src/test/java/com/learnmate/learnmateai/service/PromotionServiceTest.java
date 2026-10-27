package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.model.PromotionMove;
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.PromotionMoveRepository;
import com.learnmate.learnmateai.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PromotionServiceTest {

    private final UserRepository users = mock(UserRepository.class);
    private final PromotionMoveRepository moves = mock(PromotionMoveRepository.class);
    private final PromotionService service = new PromotionService(users, moves, "Asia/Kolkata");

    private static User student(String name, String cls) {
        User u = new User();
        u.setUsername(name);
        u.setRole("USER");
        u.setInstitution("S");
        u.setStandard(cls);
        return u;
    }

    @Test
    void suggestsNextClassAndPassesOutTheTopOne() {
        String passed = "Passed out " + LocalDate.now(ZoneId.of("Asia/Kolkata")).getYear();
        assertEquals("10", service.suggest("9", 10));
        assertEquals(passed, service.suggest("10", 10));
        assertEquals("UKG", service.suggest("LKG", 10));
        assertEquals("1", service.suggest("UKG", 10));
        assertEquals("Special", service.suggest("Special", 10));
    }

    @Test
    void movesEveryoneFromTheirOldClassAtOnceAndKeepsHeldBackStudents() {
        User a = student("a", "9"), b = student("b", "9"), c = student("c", "10");
        when(users.findByInstitutionAndRole("S", "USER")).thenReturn(List.of(a, b, c));

        PromotionService.Result r = service.promote("S", Map.of("9", "10", "10", "Passed out 2027"), Set.of("b"), "admin");

        assertEquals("10", a.getStandard(), "9 -> 10, and not on to 'passed out'");
        assertEquals("9", b.getStandard(), "held back");
        assertEquals("Passed out 2027", c.getStandard());
        assertEquals(2, r.moved());
        assertEquals(1, r.heldBack());
    }

    @Test
    void undoRestoresOnlyStudentsStillWhereThePromotionPutThem() {
        PromotionMove m1 = move("a", "9", "10"), m2 = move("b", "9", "10");
        when(moves.findFirstByInstitutionOrderByCreatedAtDesc("S")).thenReturn(Optional.of(m1));
        when(moves.findByBatchId("batch")).thenReturn(List.of(m1, m2));
        User a = student("a", "10");
        User b = student("b", "8"); // moved by hand after the promotion
        when(users.findByUsername("a")).thenReturn(Optional.of(a));
        when(users.findByUsername("b")).thenReturn(Optional.of(b));

        assertEquals(1, service.undoLast("S"));
        assertEquals("9", a.getStandard());
        assertEquals("8", b.getStandard(), "a later manual change is left alone");
        assertNotNull(m1.getUndoneAt());
        // and it can't be undone twice
        assertThrows(IllegalArgumentException.class, () -> service.undoLast("S"));
    }

    private static PromotionMove move(String user, String from, String to) {
        PromotionMove m = new PromotionMove();
        m.setBatchId("batch");
        m.setInstitution("S");
        m.setUsername(user);
        m.setFromStandard(from);
        m.setToStandard(to);
        m.setDoneBy("admin");
        return m;
    }
}
