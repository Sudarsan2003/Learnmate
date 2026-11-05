package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.UserRepository;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * Who may act on which school. Several schools share one LearnMate server:
 *  - the owner (an ADMIN with {@link User#isOwner()}) sees and manages every school;
 *  - every other ADMIN, and every TEACHER, acts only on their own school.
 * Every "pick a school" request parameter goes through {@link #school} so a
 * school admin can never reach another school's users, material or reports.
 */
@Component
public class SchoolAccess {

    private final UserRepository users;

    public SchoolAccess(UserRepository users) {
        this.users = users;
    }

    public static boolean isOwner(User u) {
        return u != null && "ADMIN".equals(u.getRole()) && u.isOwner();
    }

    /** The signed-in user. */
    public User current() {
        String name = SecurityContextHolder.getContext().getAuthentication().getName();
        return users.findByUsername(name).orElseThrow(() -> new IllegalArgumentException("Unknown user"));
    }

    public boolean currentIsOwner() {
        return isOwner(current());
    }

    /**
     * The school {@code actor} acts on. The owner gets the requested school (or
     * null for "every school" when none is named); anyone else always gets their
     * own school, and asking for a different one is refused.
     */
    public static String school(User actor, String requested) {
        String wanted = requested == null || requested.isBlank() ? null : requested.trim();
        if (isOwner(actor)) return wanted;
        String own = actor.getInstitution();
        if (own == null || own.isBlank()) {
            throw new IllegalArgumentException("Your account has no school set. Ask the LearnMate owner to set it.");
        }
        if (wanted != null && !wanted.equalsIgnoreCase(own.trim())) {
            throw new IllegalArgumentException("You can only manage your own school.");
        }
        return own;
    }

    /**
     * Like {@link #school} but always one school: an owner who names none gets
     * their own account's school (screens like year-end promotion don't ask),
     * and must choose one if their account has none.
     */
    public static String requiredSchool(User actor, String requested) {
        String school = school(actor, requested);
        if (school == null && actor.getInstitution() != null && !actor.getInstitution().isBlank()) {
            school = actor.getInstitution();
        }
        if (school == null) throw new IllegalArgumentException("Choose a school.");
        return school;
    }

    /** True when {@code actor} may see or manage things belonging to {@code institution}. */
    public static boolean canAccess(User actor, String institution) {
        if (isOwner(actor)) return true;
        return actor != null && actor.getInstitution() != null && institution != null
                && actor.getInstitution().trim().equalsIgnoreCase(institution.trim());
    }

    /** Refuses unless {@code actor} may manage {@code target}: same school, and never the owner unless you are one. */
    public static void requireCanManage(User actor, User target) {
        if (isOwner(actor)) return;
        if (isOwner(target) || !canAccess(actor, target.getInstitution())) {
            throw new IllegalArgumentException("You can only manage people in your own school.");
        }
    }

    public static void requireOwner(User actor) {
        if (!isOwner(actor)) throw new IllegalArgumentException("Only the LearnMate owner can do this.");
    }
}
