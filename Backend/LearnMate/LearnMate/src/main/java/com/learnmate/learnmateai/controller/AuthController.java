package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.dto.AuthResponse;
import com.learnmate.learnmateai.dto.LoginRequest;
import com.learnmate.learnmateai.dto.RegisterRequest;
import com.learnmate.learnmateai.model.School;
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.UserRepository;
import com.learnmate.learnmateai.security.JwtService;
import com.learnmate.learnmateai.security.LoginAttemptService;
import com.learnmate.learnmateai.security.PasswordPolicy;
import com.learnmate.learnmateai.service.Consent;
import com.learnmate.learnmateai.service.SchoolService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final SchoolService schoolService;
    private final LoginAttemptService loginAttempts;

    public AuthController(UserRepository userRepository, PasswordEncoder passwordEncoder,
                          AuthenticationManager authenticationManager, JwtService jwtService,
                          SchoolService schoolService, LoginAttemptService loginAttempts) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
        this.schoolService = schoolService;
        this.loginAttempts = loginAttempts;
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
        // Students are children: a parent or guardian must agree before any of
        // their data is stored (DPDP Act 2023, section 9).
        if (!Boolean.TRUE.equals(request.parentConsent())) {
            throw new IllegalArgumentException("A parent or guardian must agree to the Privacy Policy and Terms "
                    + "before the account is created. (Using the mobile app? Please update it first.)");
        }
        PasswordPolicy.check(request.password(), "USER", username);
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
        Consent.record(user, Consent.BY_PARENT, request.guardianName());
        userRepository.save(user);

        String token = jwtService.generateToken(user.getUsername(), user.getRole(), user.getTokenVersion());
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
                "standard", user.getStandard() == null ? "" : user.getStandard(),
                // The app asks once (a parent, for a student) to agree to the current policy.
                "consentNeeded", Consent.needed(user),
                "consentVersion", Consent.VERSION
        );
    }

    // Agreement to the current Privacy Policy and Terms, for accounts created
    // before consent was asked (or before the policy last changed).
    // Body: { "agree": true, "guardianName": "..." } (guardianName optional).
    @PostMapping("/me/consent")
    public java.util.Map<String, Object> giveConsent(@RequestBody java.util.Map<String, Object> body,
                                                     org.springframework.security.core.Authentication auth) {
        User user = userRepository.findByUsername(auth.getName())
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));
        if (!Boolean.TRUE.equals(body.get("agree"))) {
            throw new IllegalArgumentException("Please tick the box to agree.");
        }
        Object guardian = body.get("guardianName");
        Consent.record(user, Consent.byForSelf(user), guardian == null ? null : guardian.toString());
        userRepository.save(user);
        return java.util.Map.of("consentNeeded", false, "consentVersion", Consent.VERSION);
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
        user.setTokenVersion(user.getTokenVersion() + 1); // sign in again with the new role
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

        PasswordPolicy.check(newPassword, user.getRole(), user.getUsername());

        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new IllegalArgumentException("Current password incorrect");
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        // Logs out every other session; this one gets a fresh token below.
        user.setTokenVersion(user.getTokenVersion() + 1);
        userRepository.save(user);

        return java.util.Map.of(
                "success", true,
                "message", "Password updated successfully",
                "token", jwtService.generateToken(user.getUsername(), user.getRole(), user.getTokenVersion())
        );
    }

    @ExceptionHandler(LoginAttemptService.TooManyLoginAttemptsException.class)
    public ResponseEntity<java.util.Map<String, String>> tooManyAttempts(LoginAttemptService.TooManyLoginAttemptsException e) {
        return ResponseEntity.status(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS)
                .body(java.util.Map.of("message", e.getMessage()));
    }

    // One sign-in for every role: the role always comes from the database,
    // never from the request, so a student can't sign in "as" an admin.
    // Repeated wrong passwords pause sign-in (see LoginAttemptService).
    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request, jakarta.servlet.http.HttpServletRequest http) {
        String ip = LoginAttemptService.clientIp(http);
        loginAttempts.checkAllowed(request.username(), ip);
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.username(), request.password())
            );
        } catch (org.springframework.security.authentication.BadCredentialsException e) {
            // Wrong password or no such user (Spring reports both the same way).
            loginAttempts.recordFailure(request.username(), ip);
            throw e;
        }
        loginAttempts.recordSuccess(request.username());

        User user = userRepository.findByUsername(request.username())
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));
        user.setLastLoginAt(java.time.Instant.now());
        userRepository.save(user);

        String token = jwtService.generateToken(user.getUsername(), user.getRole(), user.getTokenVersion());
        return new AuthResponse(token, user.getUsername(), user.getRole(), user.isOwner());
    }
}