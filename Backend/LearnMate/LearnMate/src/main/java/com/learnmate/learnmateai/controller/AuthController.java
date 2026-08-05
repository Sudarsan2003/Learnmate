package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.dto.AuthResponse;
import com.learnmate.learnmateai.dto.LoginRequest;
import com.learnmate.learnmateai.dto.RegisterRequest;
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.UserRepository;
import com.learnmate.learnmateai.security.JwtService;
import jakarta.validation.Valid;
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

    public AuthController(UserRepository userRepository, PasswordEncoder passwordEncoder,
                          AuthenticationManager authenticationManager, JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
    }

    @PostMapping("/register")
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        if (userRepository.findByUsername(request.username()).isPresent()) {
            throw new IllegalArgumentException("Username already taken");
        }

        // Public self-registration is always a plain USER. TEACHER/ADMIN can
        // only be granted via promoteToTeacher() below, which requires an
        // existing ADMIN's token — never trust role from client input here.
        User user = new User();
        user.setUsername(request.username());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setRole("USER");
        user.setEmail(request.email());
        user.setMobile(request.mobile());
        user.setGender(request.gender());
        user.setAddress(request.address());
        user.setInstitution(request.institution());
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
                "institution", user.getInstitution() == null ? "" : user.getInstitution(),
                "standard", user.getStandard() == null ? "" : user.getStandard()
        );
    }

    @PostMapping("/promote-teacher")
    @org.springframework.security.access.prepost.PreAuthorize("hasRole('ADMIN')")
    public AuthResponse promoteToTeacher(@RequestParam String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Unknown user: " + username));

        user.setRole("TEACHER");
        userRepository.save(user);

        return new AuthResponse(null, user.getUsername(), user.getRole());
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.username(), request.password())
        );

        User user = userRepository.findByUsername(request.username())
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));

        String token = jwtService.generateToken(user.getUsername(), user.getRole());
        return new AuthResponse(token, user.getUsername(), user.getRole());
    }
}