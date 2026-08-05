package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.UserRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

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

    public AdminController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    // Password hashes never leave this method — only safe fields go out.
    @GetMapping("/users")
    public List<Map<String, Object>> listUsers() {
        return userRepository.findAll().stream()
                .map(u -> Map.<String, Object>of(
                        "id", u.getId(),
                        "username", u.getUsername(),
                        "email", u.getEmail() == null ? "" : u.getEmail(),
                        "role", u.getRole(),
                        "institution", u.getInstitution() == null ? "" : u.getInstitution(),
                        "standard", u.getStandard() == null ? "" : u.getStandard()
                ))
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
    // Add these two endpoints to the existing AdminController class

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
            // Admins aren't scoped to one institution — allow clearing it.
            user.setInstitution(isAdmin && (institution == null || institution.isBlank()) ? null : institution);
        }
        if (body.containsKey("standard")) {
            user.setStandard(body.get("standard")); // may be null/blank to clear it
        }

        userRepository.save(user);

        return Map.of(
                "username", user.getUsername(),
                "institution", user.getInstitution() == null ? "" : user.getInstitution(),
                "standard", user.getStandard() == null ? "" : user.getStandard()
        );
    }
}