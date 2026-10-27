package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.service.AchievementService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/** A student's own medals and their class's toppers (the dashboard's Hall of fame). */
@RestController
@RequestMapping("/api/me")
@CrossOrigin(origins = "*")
public class AchievementController {

    private final AchievementService achievements;

    public AchievementController(AchievementService achievements) {
        this.achievements = achievements;
    }

    @GetMapping("/achievements")
    public AchievementService.Achievements mine(Authentication auth) {
        return achievements.forStudent(auth.getName());
    }
}
