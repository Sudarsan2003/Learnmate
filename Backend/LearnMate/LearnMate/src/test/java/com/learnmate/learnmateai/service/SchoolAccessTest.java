package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.model.School;
import com.learnmate.learnmateai.model.User;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SchoolAccessTest {

    private static User user(String name, String role, String school, boolean owner) {
        User u = new User();
        u.setUsername(name);
        u.setRole(role);
        u.setInstitution(school);
        u.setOwner(owner);
        return u;
    }

    private final User owner = user("sudarsan", "ADMIN", null, true);
    private final User srvAdmin = user("srv_admin", "ADMIN", "SRV", false);
    private final User wellspringAdmin = user("ws_admin", "ADMIN", "Wellspring", false);
    private final User srvStudent = user("ravi", "USER", "SRV", false);
    private final User wellspringStudent = user("anu", "USER", "Wellspring", false);

    @Test
    void theOwnerActsOnAnySchoolASchoolAdminOnlyOnTheirOwn() {
        assertThat(SchoolAccess.school(owner, "Wellspring")).isEqualTo("Wellspring");
        assertThat(SchoolAccess.school(owner, null)).isNull();   // owner: every school
        assertThat(SchoolAccess.school(srvAdmin, null)).isEqualTo("SRV");
        assertThat(SchoolAccess.school(srvAdmin, "srv")).isEqualTo("SRV");
        assertThatThrownBy(() -> SchoolAccess.school(srvAdmin, "Wellspring"))
                .hasMessageContaining("your own school");
        assertThatThrownBy(() -> SchoolAccess.requiredSchool(owner, " "))
                .hasMessageContaining("Choose a school");
        User ownerOfSrv = user("founder", "ADMIN", "SRV", true);
        assertThat(SchoolAccess.requiredSchool(ownerOfSrv, null)).isEqualTo("SRV");
        assertThat(SchoolAccess.requiredSchool(ownerOfSrv, "Wellspring")).isEqualTo("Wellspring");
    }

    @Test
    void schoolAdminsManageOnlyTheirOwnSchoolAndNeverTheOwner() {
        SchoolAccess.requireCanManage(srvAdmin, srvStudent);
        SchoolAccess.requireCanManage(owner, wellspringStudent);
        assertThatThrownBy(() -> SchoolAccess.requireCanManage(srvAdmin, wellspringStudent))
                .hasMessageContaining("your own school");
        assertThatThrownBy(() -> SchoolAccess.requireCanManage(wellspringAdmin, srvAdmin))
                .hasMessageContaining("your own school");
        assertThatThrownBy(() -> SchoolAccess.requireCanManage(srvAdmin, owner))
                .hasMessageContaining("your own school");
        assertThatThrownBy(() -> SchoolAccess.requireOwner(srvAdmin)).hasMessageContaining("owner");
    }

    @Test
    void anAdminWhoIsNotFlaggedOwnerIsNotTheOwner() {
        assertThat(SchoolAccess.isOwner(user("x", "ADMIN", null, false))).isFalse();
        assertThat(SchoolAccess.isOwner(user("x", "TEACHER", null, true))).isFalse();
        assertThatThrownBy(() -> SchoolAccess.school(user("x", "ADMIN", null, false), "SRV"))
                .hasMessageContaining("no school set");
    }

    @Test
    void aTrialEndsAfterItsLastDay() {
        School s = new School();
        s.setAccessEndsOn(LocalDate.of(2026, 11, 19));
        assertThat(s.accessEnded(LocalDate.of(2026, 11, 19))).isFalse();
        assertThat(s.accessEnded(LocalDate.of(2026, 11, 20))).isTrue();
        s.setAccessEndsOn(null);
        assertThat(s.accessEnded(LocalDate.of(2030, 1, 1))).isFalse();
    }
}
