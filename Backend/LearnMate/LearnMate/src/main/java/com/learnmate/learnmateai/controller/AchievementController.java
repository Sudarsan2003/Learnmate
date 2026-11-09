package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.service.AchievementService;
import com.learnmate.learnmateai.service.WeaknessService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/** A student's own medals and their class's toppers (the dashboard's Hall of fame). */
@RestController
@RequestMapping("/api/me")
public class AchievementController {

    private final AchievementService achievements;
    private final WeaknessService weaknesses;

    public AchievementController(AchievementService achievements, WeaknessService weaknesses) {
        this.achievements = achievements;
        this.weaknesses = weaknesses;
    }

    // Every chapter I've been quizzed on, weakest first (the dashboard's "Your weak chapters").
    @GetMapping("/weak-chapters")
    public java.util.List<WeaknessService.ChapterScore> weakChapters(Authentication auth) {
        return weaknesses.forStudent(auth.getName());
    }

    @GetMapping("/achievements")
    public AchievementService.Achievements mine(Authentication auth) {
        return achievements.forStudent(auth.getName());
    }
}
