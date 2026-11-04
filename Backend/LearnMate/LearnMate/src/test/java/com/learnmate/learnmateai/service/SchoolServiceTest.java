package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.model.School;
import com.learnmate.learnmateai.repository.SchoolRepository;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class SchoolServiceTest {

    private final SchoolRepository repo = mock(SchoolRepository.class);
    private final SchoolService service = new SchoolService(repo);

    @Test
    void createIssuesUnambiguousEightCharCode() {
        when(repo.save(any(School.class))).thenAnswer(i -> i.getArgument(0));

        School s = service.create("  Sri Vidya   High School ");

        assertEquals("Sri Vidya High School", s.getName());
        assertTrue(s.getJoinCode().matches("[A-HJKMNP-Z2-9]{8}"), s.getJoinCode());
        assertTrue(s.isActive());
    }

    private static School school(String name, boolean active) {
        School s = new School();
        s.setName(name);
        s.setActive(active);
        return s;
    }

    @Test
    void signUpWithoutACodeJoinsTheOnlyActiveSchool() {
        when(repo.findAllByOrderByNameAsc()).thenReturn(java.util.List.of(
                school("Old Campus", false), school("Sri Vidya", true)));
        assertEquals("Sri Vidya", service.defaultSchool().orElseThrow().getName());
    }

    @Test
    void signUpWithoutACodeJoinsNoSchoolWhenThereAreSeveral() {
        when(repo.findAllByOrderByNameAsc()).thenReturn(java.util.List.of(
                school("Sri Vidya", true), school("Green Valley", true)));
        assertTrue(service.defaultSchool().isEmpty());
        when(repo.findAllByOrderByNameAsc()).thenReturn(java.util.List.of());
        assertTrue(service.defaultSchool().isEmpty());
    }

    @Test
    void createRejectsDuplicateName() {
        when(repo.existsByNameIgnoreCase("Sri Vidya")).thenReturn(true);
        assertThrows(IllegalArgumentException.class, () -> service.create("Sri Vidya"));
    }

    @Test
    void joinCodeIgnoresSpacesDashesAndCase() {
        School s = new School();
        s.setName("Sri Vidya");
        s.setActive(true);
        when(repo.findByJoinCodeIgnoreCase("ABCD2345")).thenReturn(Optional.of(s));

        assertSame(s, service.forJoinCode(" abcd-2345 "));
    }

    @Test
    void pausedOrUnknownCodeIsRejected() {
        School paused = new School();
        paused.setActive(false);
        when(repo.findByJoinCodeIgnoreCase("PAUSED22")).thenReturn(Optional.of(paused));

        assertThrows(IllegalArgumentException.class, () -> service.forJoinCode("PAUSED22"));
        assertThrows(IllegalArgumentException.class, () -> service.forJoinCode("NOPE2345"));
        assertThrows(IllegalArgumentException.class, () -> service.forJoinCode(null));
    }
}
