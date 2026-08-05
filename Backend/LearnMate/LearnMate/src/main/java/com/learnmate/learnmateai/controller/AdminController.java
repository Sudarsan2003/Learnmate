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
                        "institution", u.getInstitution() == null ? "" : u.getInstitution()
                ))
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
}