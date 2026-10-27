package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.model.School;
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.UserRepository;
import com.learnmate.learnmateai.service.SchoolService;
import com.learnmate.learnmateai.service.StudentImportService;
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
@CrossOrigin(origins = "*")
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    private static final Set<String> ASSIGNABLE_ROLES = Set.of("USER", "TEACHER", "ADMIN");

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final SchoolService schoolService;
    private final StudentImportService studentImportService;

    public AdminController(UserRepository userRepository, PasswordEncoder passwordEncoder,
                           SchoolService schoolService, StudentImportService studentImportService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.schoolService = schoolService;
        this.studentImportService = studentImportService;
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
        String admin = SecurityContextHolder.getContext().getAuthentication().getName();
        String school = institution == null || institution.isBlank()
                ? userRepository.findByUsername(admin).map(User::getInstitution).orElse(null)
                : schoolService.list().stream()
                        .map(School::getName)
                        .filter(n -> n.equalsIgnoreCase(institution.trim()))
                        .findFirst()
                        .orElseThrow(() -> new IllegalArgumentException("Unknown school: " + institution));
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
    @GetMapping("/schools")
    public List<Map<String, Object>> listSchools() {
        Map<String, Long> members = userRepository.findAll().stream()
                .filter(u -> u.getInstitution() != null)
                .collect(Collectors.groupingBy(u -> u.getInstitution().toLowerCase(), Collectors.counting()));
        return schoolService.list().stream()
                .map(s -> schoolRow(s, members.getOrDefault(s.getName().toLowerCase(), 0L)))
                .toList();
    }

    // Institution matching elsewhere is exact, so if users already belong to this
    // school under a different capitalisation, reuse that spelling; otherwise new
    // sign-ups would land in a separate, empty pool of material and quizzes.
    @PostMapping("/schools")
    public Map<String, Object> createSchool(@RequestBody Map<String, String> body) {
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
        return schoolRow(schoolService.regenerateCode(id), null);
    }

    @PutMapping("/schools/{id}/active")
    public Map<String, Object> setSchoolActive(@PathVariable Long id, @RequestBody Map<String, Boolean> body) {
        return schoolRow(schoolService.setActive(id, Boolean.TRUE.equals(body.get("active"))), null);
    }

    private static Map<String, Object> schoolRow(School s, Long memberCount) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", s.getId());
        row.put("name", s.getName());
        row.put("joinCode", s.getJoinCode());
        row.put("active", s.isActive());
        row.put("createdAt", s.getCreatedAt());
        if (memberCount != null) row.put("memberCount", memberCount);
        return row;
    }

    // Password hashes never leave this method — only safe fields go out.
    @GetMapping("/users")
    public List<Map<String, Object>> listUsers() {
        return userRepository.findAll().stream()
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
                    return row;
                })
                .collect(Collectors.toList());
    }

    // Admins manage across institutions rather than belonging to one, so
    // this is how they see who's grouped under each institution.
    @GetMapping("/institutions")
    public List<Map<String, Object>> listInstitutions() {
        return userRepository.findAll().stream()
                .filter(u -> u.getInstitution() != null && !u.getInstitution().isBlank())
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

        user.setRole(newRole.toUpperCase());
        userRepository.save(user);

        return Map.of("username", user.getUsername(), "role", user.getRole());
    }

    // One-time bulk fix: sets institution for every user currently missing one.
    // Safe to call multiple times — only touches null/blank institution rows.
    @PostMapping("/users/backfill-institution")
    public Map<String, Object> backfillInstitution(@RequestBody Map<String, String> body) {
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

        if (body.containsKey("institution")) {
            String institution = body.get("institution");
            boolean isAdmin = "ADMIN".equals(user.getRole());
            if (!isAdmin && (institution == null || institution.isBlank())) {
                throw new IllegalArgumentException("institution cannot be blank");
            }
            user.setInstitution(isAdmin && (institution == null || institution.isBlank()) ? null : institution);
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
        if (newPassword == null || newPassword.length() < 6) {
            throw new IllegalArgumentException("newPassword must be at least 6 characters.");
        }

        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Unknown user: " + username));

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);

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

        user.setLocked(locked);
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

        userRepository.delete(user);

        return Map.of("username", username, "deleted", true);
    }
}