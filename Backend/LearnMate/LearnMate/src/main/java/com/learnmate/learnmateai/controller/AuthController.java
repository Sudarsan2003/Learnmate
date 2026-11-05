package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.dto.AuthResponse;
import com.learnmate.learnmateai.dto.LoginRequest;
import com.learnmate.learnmateai.dto.RegisterRequest;
import com.learnmate.learnmateai.model.School;
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.UserRepository;
import com.learnmate.learnmateai.security.JwtService;
import com.learnmate.learnmateai.service.SchoolService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final SchoolService schoolService;

    public AuthController(UserRepository userRepository, PasswordEncoder passwordEncoder,
                          AuthenticationManager authenticationManager, JwtService jwtService,
                          SchoolService schoolService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
        this.schoolService = schoolService;
    }

    // "Username already taken", "school code isn't valid", ... are the caller's
    // mistake: answer 400 with { "message": ... } so the form can show it.
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<java.util.Map<String, String>> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(java.util.Map.of("message", e.getMessage()));
    }

    static final int MAX_ACCOUNTS_PER_MOBILE = 2;

    /** "+91 98765 43210", "098765-43210" -> "9876543210"; anything else is refused. */
    static String indianMobile(String raw) {
        String digits = raw == null ? "" : raw.replaceAll("[^0-9]", "");
        if (digits.length() == 12 && digits.startsWith("91")) digits = digits.substring(2);
        else if (digits.length() == 11 && digits.startsWith("0")) digits = digits.substring(1);
        if (!digits.matches("[6-9][0-9]{9}")) {
            throw new IllegalArgumentException("Enter a valid 10-digit mobile number, like 98765 43210.");
        }
        return digits;
    }

    @PostMapping("/register")
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        String username = request.username().trim();
        // Case-insensitive, so "sudarsan" and "Sudarsan" can't both exist.
        if (userRepository.existsByUsernameIgnoreCase(username)) {
            throw new IllegalArgumentException("That username is already taken. Please choose another.");
        }
        if (request.password().length() < 6) {
            throw new IllegalArgumentException("Password must be at least 6 characters.");
        }
        // A parent's number may be shared by brothers and sisters, so up to
        // MAX_ACCOUNTS_PER_MOBILE accounts can use it.
        String mobile = indianMobile(request.mobile());
        if (userRepository.countByMobileDigits(mobile) >= MAX_ACCOUNTS_PER_MOBILE) {
            throw new IllegalArgumentException("This mobile number is already used by " + MAX_ACCOUNTS_PER_MOBILE
                    + " accounts. A number can be shared by at most " + MAX_ACCOUNTS_PER_MOBILE
                    + " children; please use another parent's number.");
        }
        // The school comes from its join code, so a student can only join a
        // school whose code they were given -- not any school they can name.
        School school = schoolService.forJoinCode(request.schoolCode());

        // Public self-registration is always a plain USER. TEACHER/ADMIN can
        // only be granted via promoteToTeacher() below, which requires an
        // existing ADMIN's token — never trust role from client input here.
        User user = new User();
        user.setUsername(username);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setRole("USER");
        user.setEmail(request.email());
        user.setMobile(mobile);
        user.setGender(request.gender());
        user.setAddress(request.address());
        user.setInstitution(school.getName());
        user.setStandard(request.standard()); // was missing — students never got their class saved
        userRepository.save(user);

        String token = jwtService.generateToken(user.getUsername(), user.getRole());
        return new AuthResponse(token, user.getUsername(), user.getRole());
    }

    // Admin-only: promote an existing user to TEACHER so they can upload
// documents. Called from an admin dashboard, not public signup.
    @GetMapping("/me")
    public java.util.Map<String, Object> me(org.springframework.security.core.Authentication auth) {
        User user = userRepository.findByUsername(auth.getName())
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));

        return java.util.Map.of(
                "username", user.getUsername(),
                "email", user.getEmail() == null ? "" : user.getEmail(),
                "role", user.getRole(),
                "owner", user.isOwner(),
                "institution", user.getInstitution() == null ? "" : user.getInstitution(),
                "standard", user.getStandard() == null ? "" : user.getStandard()
        );
    }

    // Self-service: a student can set their own class, but NOT their
    // institution — institution stays admin-only (see AdminController) so a
    // user can't assign themselves into a different school's quiz pool.
    @PutMapping("/me/standard")
    public java.util.Map<String, Object> updateMyStandard(@RequestBody java.util.Map<String, String> body,
                                                          org.springframework.security.core.Authentication auth) {
        User user = userRepository.findByUsername(auth.getName())
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));

        String standard = body.get("standard");
        if (standard == null || standard.isBlank()) {
            throw new IllegalArgumentException("standard is required");
        }

        user.setStandard(standard.trim());
        userRepository.save(user);

        return java.util.Map.of(
                "username", user.getUsername(),
                "standard", user.getStandard()
        );
    }

    @PostMapping("/promote-teacher")
    @org.springframework.security.access.prepost.PreAuthorize("hasRole('ADMIN')")
    public AuthResponse promoteToTeacher(@RequestParam String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Unknown user: " + username));
        User admin = userRepository.findByUsername(
                        org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication().getName())
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));
        com.learnmate.learnmateai.service.SchoolAccess.requireCanManage(admin, user);

        user.setRole("TEACHER");
        userRepository.save(user);

        return new AuthResponse(null, user.getUsername(), user.getRole());
    }

    @PutMapping("/change-password")
    public java.util.Map<String, Object> changePassword(
            @RequestBody java.util.Map<String, String> body,
            org.springframework.security.core.Authentication auth) {

        User user = userRepository.findByUsername(auth.getName())
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));

        String currentPassword = body.get("currentPassword");
        String newPassword = body.get("newPassword");

        if (currentPassword == null || currentPassword.isBlank()) {
            throw new IllegalArgumentException("Current password is required");
        }

        if (newPassword == null || newPassword.isBlank()) {
            throw new IllegalArgumentException("New password is required");
        }

        if (newPassword.length() < 6) {
            throw new IllegalArgumentException("New password must be at least 6 characters");
        }

        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new IllegalArgumentException("Current password incorrect");
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);

        return java.util.Map.of(
                "success", true,
                "message", "Password updated successfully"
        );
    }
    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.username(), request.password())
        );

        User user = userRepository.findByUsername(request.username())
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));
        user.setLastLoginAt(java.time.Instant.now());
        userRepository.save(user);

        String token = jwtService.generateToken(user.getUsername(), user.getRole());
        return new AuthResponse(token, user.getUsername(), user.getRole(), user.isOwner());
    }
}