package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.model.PromotionMove;
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.PromotionMoveRepository;
import com.learnmate.learnmateai.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Year-end promotion: moves every student of a school up a class in one go
 * (9 -> 10, the top class -> "Passed out 2027"), with chosen students held
 * back. Every move is recorded, so the most recent promotion can be undone.
 *
 * New classes are worked out from each student's class *before* the
 * promotion, all at once, so 9 -> 10 and 10 -> passed out can never chain
 * into 9 -> passed out.
 */
@Service
public class PromotionService {

    public record StudentRef(String username, String fullName) {}

    public record ClassPlan(String standard, int studentCount, String suggestedTarget, List<StudentRef> students) {}

    public record LastPromotion(String batchId, Instant at, String doneBy, int moved, boolean undone) {}

    public record Plan(String institution, List<ClassPlan> classes, String passedOutLabel, LastPromotion last) {}

    public record Result(String batchId, int moved, int heldBack) {}

    private static final Map<String, String> PRE_PRIMARY = Map.of(
            "nursery", "LKG", "lkg", "UKG", "ukg", "1");

    private final UserRepository users;
    private final PromotionMoveRepository moves;
    private final ZoneId zone;

    public PromotionService(UserRepository users, PromotionMoveRepository moves,
                            @Value("${learnmate.timezone:Asia/Kolkata}") String timezone) {
        this.users = users;
        this.moves = moves;
        this.zone = ZoneId.of(timezone);
    }

    /** "Passed out 2027": the label given to students leaving the top class. */
    public String passedOutLabel() {
        return "Passed out " + LocalDate.now(zone).getYear();
    }

    public Plan plan(String institution) {
        Map<String, List<User>> byClass = students(institution).stream()
                .filter(u -> u.getStandard() != null && !u.getStandard().isBlank() && !isPassedOut(u.getStandard()))
                .collect(Collectors.groupingBy(User::getStandard));
        int topClass = byClass.keySet().stream().filter(s -> s.matches("\\d+")).mapToInt(Integer::parseInt).max().orElse(0);

        List<ClassPlan> classes = byClass.entrySet().stream()
                .sorted(Map.Entry.comparingByKey(ReportService::compareStandards))
                .map(e -> new ClassPlan(e.getKey(), e.getValue().size(), suggest(e.getKey(), topClass),
                        e.getValue().stream()
                                .sorted(Comparator.comparing(PromotionService::nameOf, String.CASE_INSENSITIVE_ORDER))
                                .map(u -> new StudentRef(u.getUsername(), u.getFullName()))
                                .toList()))
                .toList();
        return new Plan(institution, classes, passedOutLabel(), last(institution));
    }

    /**
     * Applies a promotion. `targets` maps each current class to its new class
     * (a class left out, or mapped to itself, stays put). Students in
     * `holdBack` keep their class.
     */
    @Transactional
    public Result promote(String institution, Map<String, String> targets, Set<String> holdBack, String doneBy) {
        if (targets == null || targets.isEmpty()) throw new IllegalArgumentException("Choose where each class moves to.");
        Map<String, String> clean = new HashMap<>();
        targets.forEach((from, to) -> {
            String target = to == null ? "" : to.trim();
            if (target.isEmpty()) throw new IllegalArgumentException("Class " + from + " needs a class to move to.");
            if (!target.equals(from)) clean.put(from, target);
        });
        if (clean.isEmpty()) throw new IllegalArgumentException("Every class is set to stay where it is, so there is nothing to do.");

        String batchId = UUID.randomUUID().toString();
        Set<String> held = holdBack == null ? Set.of() : holdBack;
        List<PromotionMove> log = new ArrayList<>();
        List<User> changed = new ArrayList<>();
        int heldBack = 0;
        for (User u : students(institution)) {
            String target = clean.get(u.getStandard());
            if (target == null) continue;
            if (held.contains(u.getUsername())) {
                heldBack++;
                continue;
            }
            PromotionMove m = new PromotionMove();
            m.setBatchId(batchId);
            m.setInstitution(institution);
            m.setUsername(u.getUsername());
            m.setFromStandard(u.getStandard());
            m.setToStandard(target);
            m.setDoneBy(doneBy);
            log.add(m);
            u.setStandard(target);
            changed.add(u);
        }
        if (changed.isEmpty()) throw new IllegalArgumentException("No students would move. Check the classes and held-back list.");
        users.saveAll(changed);
        moves.saveAll(log);
        return new Result(batchId, changed.size(), heldBack);
    }

    /** Puts students back where the school's most recent promotion found them. */
    @Transactional
    public int undoLast(String institution) {
        PromotionMove latest = moves.findFirstByInstitutionOrderByCreatedAtDesc(institution)
                .orElseThrow(() -> new IllegalArgumentException("There is no promotion to undo."));
        List<PromotionMove> batch = moves.findByBatchId(latest.getBatchId());
        if (batch.stream().anyMatch(m -> m.getUndoneAt() != null)) {
            throw new IllegalArgumentException("The last promotion has already been undone.");
        }
        Instant now = Instant.now();
        int restored = 0;
        for (PromotionMove m : batch) {
            Optional<User> u = users.findByUsername(m.getUsername());
            // Only students still in the class the promotion gave them; anyone an
            // admin has moved by hand since then is left alone.
            if (u.isPresent() && Objects.equals(u.get().getStandard(), m.getToStandard())) {
                u.get().setStandard(m.getFromStandard());
                users.save(u.get());
                restored++;
            }
            m.setUndoneAt(now);
        }
        moves.saveAll(batch);
        return restored;
    }

    private LastPromotion last(String institution) {
        return moves.findFirstByInstitutionOrderByCreatedAtDesc(institution)
                .map(m -> {
                    List<PromotionMove> batch = moves.findByBatchId(m.getBatchId());
                    return new LastPromotion(m.getBatchId(), m.getCreatedAt(), m.getDoneBy(), batch.size(),
                            batch.stream().anyMatch(x -> x.getUndoneAt() != null));
                })
                .orElse(null);
    }

    /** Next class: 9 -> 10, the school's top class -> passed out, LKG -> UKG; unknown names stay. */
    String suggest(String standard, int topClass) {
        String s = standard.trim();
        if (s.matches("\\d+")) {
            int n = Integer.parseInt(s);
            return n >= topClass ? passedOutLabel() : String.valueOf(n + 1);
        }
        return PRE_PRIMARY.getOrDefault(s.toLowerCase(Locale.ROOT), s);
    }

    private List<User> students(String institution) {
        return users.findByInstitutionAndRole(institution, "USER");
    }

    static boolean isPassedOut(String standard) {
        return standard.toLowerCase(Locale.ROOT).startsWith("passed out");
    }

    private static String nameOf(User u) {
        return u.getFullName() != null && !u.getFullName().isBlank() ? u.getFullName() : u.getUsername();
    }
}
