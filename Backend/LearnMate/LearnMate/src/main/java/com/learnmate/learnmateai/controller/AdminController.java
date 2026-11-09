package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.model.School;
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.UserRepository;
import com.learnmate.learnmateai.security.LoginAttemptService;
import com.learnmate.learnmateai.security.PasswordPolicy;
import com.learnmate.learnmateai.service.SchoolAccess;
import com.learnmate.learnmateai.service.SchoolService;
import com.learnmate.learnmateai.service.StudentImportService;
import com.learnmate.learnmateai.service.UserDataService;
import com.learnmate.learnmateai.service.PromotionService;
import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    private static final Set<String> ASSIGNABLE_ROLES = Set.of("USER", "TEACHER", "ADMIN");

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final SchoolService schoolService;
    private final StudentImportService studentImportService;
    private final PromotionService promotionService;
    private final SchoolAccess access;
    private final UserDataService userData;
    private final LoginAttemptService loginAttempts;

    public AdminController(UserRepository userRepository, PasswordEncoder passwordEncoder,
                           SchoolService schoolService, StudentImportService studentImportService,
                           PromotionService promotionService, SchoolAccess access, UserDataService userData,
                           LoginAttemptService loginAttempts) {
        this.loginAttempts = loginAttempts;
        this.access = access;
        this.userData = userData;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.schoolService = schoolService;
        this.studentImportService = studentImportService;
        this.promotionService = promotionService;
    }

    // ------------------------------------------------------------------ year-end promotion

    // Classes with their students and a suggested next class, plus the last promotion (for undo).
    @GetMapping("/promotion")
    public PromotionService.Plan promotionPlan(@RequestParam(value = "institution", required = false) String institution) {
        return promotionService.plan(adminSchool(institution));
    }

    // Body: { "targets": { "9": "10", "10": "Passed out 2027" }, "holdBack": ["ravi.kumar"] }
    @PostMapping("/promotion")
    public PromotionService.Result promote(@RequestBody Map<String, Object> body,
                                           @RequestParam(value = "institution", required = false) String institution) {
        @SuppressWarnings("unchecked")
        Map<String, String> targets = (Map<String, String>) body.getOrDefault("targets", Map.of());
        @SuppressWarnings("unchecked")
        List<String> holdBack = (List<String>) body.getOrDefault("holdBack", List.of());
        String admin = SecurityContextHolder.getContext().getAuthentication().getName();
        return promotionService.promote(adminSchool(institution), targets, Set.copyOf(holdBack), admin);
    }

    @PostMapping("/promotion/undo")
    public Map<String, Object> undoPromotion(@RequestParam(value = "institution", required = false) String institution) {
        return Map.of("restored", promotionService.undoLast(adminSchool(institution)));
    }

    // Promotion acts on the admin's own school; the owner names which school.
    private String adminSchool(String requested) {
        return SchoolAccess.requiredSchool(access.current(), requested);
    }

    // ------------------------------------------------------------------ bulk import

    // Creates student accounts from an Excel/CSV class list. dryRun=true (the
    // default) only checks the file; call again with dryRun=false to create
    // them. Nothing is created unless every row is valid. The school defaults
    // to the admin's own; a different one must be one of the configured schools.
    @PostMapping(value = "/users/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public StudentImportService.ImportResult importStudents(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "dryRun", defaultValue = "true") boolean dryRun,
            @RequestParam(value = "institution", required = false) String institution) {
        String requested = SchoolAccess.requiredSchool(access.current(), institution);
        String school = schoolService.list().stream()
                .map(School::getName)
                .filter(n -> n.equalsIgnoreCase(requested.trim()))
                .findFirst()
                .orElse(requested);
        return studentImportService.importStudents(file, school, dryRun);
    }

    // Validation problems are the caller's mistake: answer 400 with
    // { "message": ... } so the admin screen can show the reason.
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
    }

    // ------------------------------------------------------------------ schools (customers)

    // Every customer school with its sign-up code and how many people have joined.
    // A school admin only sees their own school here (to share its code).
    @GetMapping("/schools")
    public List<Map<String, Object>> listSchools() {
        User actor = access.current();
        Map<String, Long> members = userRepository.findAll().stream()
                .filter(u -> u.getInstitution() != null)
                .collect(Collectors.groupingBy(u -> u.getInstitution().toLowerCase(), Collectors.counting()));
        return schoolService.list().stream()
                .filter(s -> SchoolAccess.canAccess(actor, s.getName()))
                .map(s -> schoolRow(s, members.getOrDefault(s.getName().toLowerCase(), 0L)))
                .toList();
    }

    // Institution matching elsewhere is exact, so if users already belong to this
    // school under a different capitalisation, reuse that spelling; otherwise new
    // sign-ups would land in a separate, empty pool of material and quizzes.
    @PostMapping("/schools")
    public Map<String, Object> createSchool(@RequestBody Map<String, String> body) {
        SchoolAccess.requireOwner(access.current());
        String requested = body.get("name") == null ? "" : body.get("name").trim().replaceAll("\\s{2,}", " ");
        String name = userRepository.findAll().stream()
                .map(User::getInstitution)
                .filter(i -> i != null && i.trim().equalsIgnoreCase(requested))
                .findFirst()
                .orElse(requested);
        long members = userRepository.findAll().stream()
                .filter(u -> name.equals(u.getInstitution()))
                .count();
        return schoolRow(schoolService.create(name), members);
    }

    @PostMapping("/schools/{id}/regenerate-code")
    public Map<String, Object> regenerateSchoolCode(@PathVariable Long id) {
        if (!SchoolAccess.canAccess(access.current(), schoolService.get(id).getName())) {
            throw new IllegalArgumentException("You can only manage your own school.");
        }
        return schoolRow(schoolService.regenerateCode(id), null);
    }

    @PutMapping("/schools/{id}/active")
    public Map<String, Object> setSchoolActive(@PathVariable Long id, @RequestBody Map<String, Boolean> body) {
        SchoolAccess.requireOwner(access.current());
        return schoolRow(schoolService.setActive(id, Boolean.TRUE.equals(body.get("active"))), null);
    }

    // Owner only: the last day a trial school can use LearnMate. Body: { "date": "2026-11-19" },
    // or { "date": null } to remove the limit (e.g. once the school buys).
    @PutMapping("/schools/{id}/access-ends")
    public Map<String, Object> setSchoolAccessEnds(@PathVariable Long id, @RequestBody Map<String, String> body) {
        SchoolAccess.requireOwner(access.current());
        String date = body.get("date");
        java.time.LocalDate ends;
        try {
            ends = date == null || date.isBlank() ? null : java.time.LocalDate.parse(date.trim());
        } catch (java.time.format.DateTimeParseException e) {
            throw new IllegalArgumentException("Use a date like 2026-11-19.");
        }
        return schoolRow(schoolService.setAccessEndsOn(id, ends), null);
    }

    private static Map<String, Object> schoolRow(School s, Long memberCount) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", s.getId());
        row.put("name", s.getName());
        row.put("joinCode", s.getJoinCode());
        row.put("active", s.isActive());
        row.put("createdAt", s.getCreatedAt());
        row.put("accessEndsOn", s.getAccessEndsOn() == null ? "" : s.getAccessEndsOn().toString());
        if (memberCount != null) row.put("memberCount", memberCount);
        return row;
    }

    // Password hashes never leave this method — only safe fields go out.
    @GetMapping("/users")
    public List<Map<String, Object>> listUsers() {
        User actor = access.current();
        return userRepository.findAll().stream()
                .filter(u -> SchoolAccess.isOwner(actor)
                        || (!SchoolAccess.isOwner(u) && SchoolAccess.canAccess(actor, u.getInstitution())))
                .map(u -> {
                    Map<String, Object> row = new java.util.HashMap<>();
                    row.put("id", u.getId());
                    row.put("username", u.getUsername());
                    row.put("fullName", u.getFullName() == null ? "" : u.getFullName());
                    row.put("email", u.getEmail() == null ? "" : u.getEmail());
                    row.put("mobile", u.getMobile() == null ? "" : u.getMobile());
                    row.put("gender", u.getGender() == null ? "" : u.getGender());
                    row.put("address", u.getAddress() == null ? "" : u.getAddress());
                    row.put("role", u.getRole());
                    row.put("institution", u.getInstitution() == null ? "" : u.getInstitution());
                    row.put("standard", u.getStandard() == null ? "" : u.getStandard());
                    row.put("locked", u.isLocked());
                    row.put("owner", u.isOwner());
                    return row;
                })
                .collect(Collectors.toList());
    }

    // Admins manage across institutions rather than belonging to one, so
    // this is how they see who's grouped under each institution.
    @GetMapping("/institutions")
    public List<Map<String, Object>> listInstitutions() {
        User actor = access.current();
        return userRepository.findAll().stream()
                .filter(u -> u.getInstitution() != null && !u.getInstitution().isBlank())
                .filter(u -> SchoolAccess.canAccess(actor, u.getInstitution()))
                .collect(Collectors.groupingBy(User::getInstitution))
                .entrySet().stream()
                .map(entry -> {
                    List<Map<String, Object>> members = entry.getValue().stream()
                            .sorted((a, b) -> a.getUsername().compareToIgnoreCase(b.getUsername()))
                            .map(u -> Map.<String, Object>of(
                                    "username", u.getUsername(),
                                    "email", u.getEmail() == null ? "" : u.getEmail(),
                                    "role", u.getRole(),
                                    "standard", u.getStandard() == null ? "" : u.getStandard()
                            ))
                            .collect(Collectors.toList());
                    return Map.<String, Object>of(
                            "institution", entry.getKey(),
                            "userCount", members.size(),
                            "users", members
                    );
                })
                .sorted((a, b) -> ((String) a.get("institution")).compareToIgnoreCase((String) b.get("institution")))
                .collect(Collectors.toList());
    }

    @PutMapping("/users/{username}/role")
    public Map<String, Object> updateRole(@PathVariable String username, @RequestBody Map<String, String> body) {
        String newRole = body.get("role");
        if (newRole == null || !ASSIGNABLE_ROLES.contains(newRole.toUpperCase())) {
            throw new IllegalArgumentException("Role must be one of: " + ASSIGNABLE_ROLES);
        }

        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Unknown user: " + username));
        SchoolAccess.requireCanManage(access.current(), user);

        user.setRole(newRole.toUpperCase());
        user.setTokenVersion(user.getTokenVersion() + 1); // sign in again with the new role
        userRepository.save(user);

        return Map.of("username", user.getUsername(), "role", user.getRole());
    }

    // Owner only: makes an admin an owner (sees every school) or a school's own admin
    // (sees only their school, which must then be set). Body: { "owner": true }.
    @PutMapping("/users/{username}/owner")
    public Map<String, Object> setOwner(@PathVariable String username, @RequestBody Map<String, Boolean> body) {
        User actor = access.current();
        SchoolAccess.requireOwner(actor);
        boolean owner = Boolean.TRUE.equals(body.get("owner"));
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Unknown user: " + username));
        if (owner && !"ADMIN".equals(user.getRole())) {
            throw new IllegalArgumentException("Make them an admin first.");
        }
        if (!owner && user.getUsername().equals(actor.getUsername())) {
            throw new IllegalArgumentException("You can't remove your own owner access.");
        }
        if (!owner && (user.getInstitution() == null || user.getInstitution().isBlank())) {
            throw new IllegalArgumentException("Set their school first, so they know which school to manage.");
        }
        user.setOwner(owner);
        userRepository.save(user);
        return Map.of("username", user.getUsername(), "owner", user.isOwner());
    }

    // One-time bulk fix: sets institution for every user currently missing one.
    // Safe to call multiple times — only touches null/blank institution rows.
    @PostMapping("/users/backfill-institution")
    public Map<String, Object> backfillInstitution(@RequestBody Map<String, String> body) {
        SchoolAccess.requireOwner(access.current());
        String defaultInstitution = body.get("institution");
        if (defaultInstitution == null || defaultInstitution.isBlank()) {
            throw new IllegalArgumentException("institution is required");
        }

        List<User> affected = userRepository.findAll().stream()
                .filter(u -> !"ADMIN".equals(u.getRole()))
                .filter(u -> u.getInstitution() == null || u.getInstitution().isBlank())
                .toList();

        affected.forEach(u -> u.setInstitution(defaultInstitution));
        userRepository.saveAll(affected);

        return Map.of("updatedCount", affected.size());
    }

    // Lets an admin fix institution/standard on individual users afterward —
    // e.g. correcting a student's class, or splitting users across two schools
    // if the backfill set everyone to one default.
    @PutMapping("/users/{username}/profile")
    public Map<String, Object> updateProfile(@PathVariable String username, @RequestBody Map<String, String> body) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Unknown user: " + username));
        User actor = access.current();
        SchoolAccess.requireCanManage(actor, user);

        if (body.containsKey("institution")) {
            String institution = body.get("institution");
            // Only the owner has no school; everyone else, school admins included, belongs to one.
            if (!user.isOwner() && (institution == null || institution.isBlank())) {
                throw new IllegalArgumentException("institution cannot be blank");
            }
            // A school admin can't move anyone into another school.
            String school = institution == null || institution.isBlank() ? null : SchoolAccess.school(actor, institution);
            user.setInstitution(school);
        }
        if (body.containsKey("standard")) {
            user.setStandard(body.get("standard"));
        }
        if (body.containsKey("email")) {
            user.setEmail(emptyToNull(body.get("email")));
        }
        if (body.containsKey("fullName")) {
            user.setFullName(emptyToNull(body.get("fullName")));
        }
        if (body.containsKey("mobile")) {
            user.setMobile(emptyToNull(body.get("mobile")));
        }
        if (body.containsKey("gender")) {
            user.setGender(emptyToNull(body.get("gender")));
        }
        if (body.containsKey("address")) {
            user.setAddress(emptyToNull(body.get("address")));
        }

        userRepository.save(user);

        return Map.of(
                "username", user.getUsername(),
                "fullName", user.getFullName() == null ? "" : user.getFullName(),
                "email", user.getEmail() == null ? "" : user.getEmail(),
                "mobile", user.getMobile() == null ? "" : user.getMobile(),
                "gender", user.getGender() == null ? "" : user.getGender(),
                "address", user.getAddress() == null ? "" : user.getAddress(),
                "institution", user.getInstitution() == null ? "" : user.getInstitution(),
                "standard", user.getStandard() == null ? "" : user.getStandard()
        );
    }

    private String emptyToNull(String value) {
        return (value == null || value.isBlank()) ? null : value;
    }

    // Admin-initiated password reset.
    @PutMapping("/users/{username}/reset-password")
    public Map<String, Object> resetPassword(@PathVariable String username, @RequestBody Map<String, String> body) {
        String newPassword = body.get("newPassword");

        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Unknown user: " + username));
        SchoolAccess.requireCanManage(access.current(), user);
        PasswordPolicy.check(newPassword, user.getRole(), user.getUsername());

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        // Logs out every session on the old password, and lifts any pause from wrong guesses.
        user.setTokenVersion(user.getTokenVersion() + 1);
        userRepository.save(user);
        loginAttempts.clearAccount(user.getUsername());

        return Map.of("username", user.getUsername(), "reset", true);
    }

    // Blocks/unblocks a user's access to quiz + chat without deleting them.
    // Actual enforcement lives in the security layer (see UserDetailsService/
    // JWT filter) — this just flips the flag.
    @PutMapping("/users/{username}/lock")
    public Map<String, Object> setLocked(@PathVariable String username, @RequestBody Map<String, Boolean> body) {
        Boolean locked = body.get("locked");
        if (locked == null) {
            throw new IllegalArgumentException("locked is required");
        }

        String currentAdmin = SecurityContextHolder.getContext().getAuthentication().getName();
        if (username.equals(currentAdmin)) {
            throw new IllegalArgumentException("You cannot lock your own account.");
        }

        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Unknown user: " + username));
        SchoolAccess.requireCanManage(access.current(), user);

        user.setLocked(locked);
        // Locking ends every open session for good, even after an unlock.
        if (locked) user.setTokenVersion(user.getTokenVersion() + 1);
        userRepository.save(user);

        return Map.of("username", user.getUsername(), "locked", user.isLocked());
    }

    // Permanently removes a user account.
    @DeleteMapping("/users/{username}")
    public Map<String, Object> deleteUser(@PathVariable String username) {
        String currentAdmin = SecurityContextHolder.getContext().getAuthentication().getName();
        if (username.equals(currentAdmin)) {
            throw new IllegalArgumentException("You cannot delete your own account.");
        }

        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Unknown user: " + username));
        SchoolAccess.requireCanManage(access.current(), user);

        // Their results, chats and messages go too, so a new account that reuses
        // the username starts empty.
        userData.deleteActivity(user.getUsername());
        userRepository.delete(user);

        return Map.of("username", username, "deleted", true);
    }
}