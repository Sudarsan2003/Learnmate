package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.model.User;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MessageServiceTest {

    private static User user(String name, String role, String school) {
        User u = new User();
        u.setUsername(name);
        u.setRole(role);
        u.setInstitution(school);
        return u;
    }

    private final User student = user("ravi", "USER", "SRV");
    private final User classmate = user("sita", "USER", "SRV");
    private final User teacher = user("lakshmi", "TEACHER", "SRV");
    private final User schoolAdmin = user("principal", "ADMIN", "SRV");
    private final User otherSchoolTeacher = user("ws_teacher", "TEACHER", "Wellspring");

    @Test
    void studentsMessageAnyTeacherOrAdminOfTheirSchoolButNotEachOther() {
        assertThat(MessageService.canMessage(student, teacher)).isTrue();
        assertThat(MessageService.canMessage(student, schoolAdmin)).isTrue();
        assertThat(MessageService.canMessage(student, classmate)).isFalse();
        assertThat(MessageService.canMessage(student, student)).isFalse();
    }

    @Test
    void staffMessageStudentsAndEachOther() {
        assertThat(MessageService.canMessage(teacher, student)).isTrue();
        assertThat(MessageService.canMessage(teacher, schoolAdmin)).isTrue();
        assertThat(MessageService.canMessage(schoolAdmin, teacher)).isTrue();
    }

    @Test
    void schoolsNeverMixAndTheOwnerIsNotInChats() {
        assertThat(MessageService.canMessage(student, otherSchoolTeacher)).isFalse();
        assertThat(MessageService.canMessage(otherSchoolTeacher, teacher)).isFalse();
        User owner = user("sudarsan", "ADMIN", null);
        owner.setOwner(true);
        assertThat(MessageService.canMessage(student, owner)).isFalse();
        assertThat(MessageService.canMessage(owner, student)).isFalse();
        assertThat(MessageService.canMessage(user("x", "USER", null), teacher)).isFalse();
    }
}
