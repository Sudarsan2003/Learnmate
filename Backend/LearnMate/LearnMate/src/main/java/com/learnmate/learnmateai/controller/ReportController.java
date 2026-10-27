package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.UserRepository;
import com.learnmate.learnmateai.service.ReportService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Class-wise reports (teachers and admins). Teachers only ever see their own
 * school's classes; an admin may pass ?institution= to look at another one.
 */
@RestController
@RequestMapping("/api/reports")
@CrossOrigin(origins = "*")
@PreAuthorize("hasAnyRole('ADMIN', 'TEACHER')")
public class ReportController {

    private final ReportService reportService;
    private final UserRepository userRepository;

    public ReportController(ReportService reportService, UserRepository userRepository) {
        this.reportService = reportService;
        this.userRepository = userRepository;
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
    }

    @GetMapping("/classes")
    public List<ReportService.ClassSummary> classes(
            @RequestParam(value = "institution", required = false) String institution, Authentication auth) {
        return reportService.classes(schoolFor(auth, institution));
    }

    @GetMapping("/class")
    public ReportService.ClassReport classReport(
            @RequestParam String standard,
            @RequestParam(value = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(value = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(value = "institution", required = false) String institution,
            Authentication auth) {
        return reportService.classReport(schoolFor(auth, institution), standard.trim(), from, to);
    }

    private String schoolFor(Authentication auth, String requested) {
        User user = userRepository.findByUsername(auth.getName())
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));
        boolean isAdmin = auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));
        String school = isAdmin && requested != null && !requested.isBlank() ? requested.trim() : user.getInstitution();
        if (school == null || school.isBlank()) {
            throw new IllegalArgumentException("Your account has no school set, so there is no class to report on.");
        }
        return school;
    }
}
