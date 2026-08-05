package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.dto.*;
import com.learnmate.learnmateai.model.Quiz;
import com.learnmate.learnmateai.service.QuizService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/quizzes")
@CrossOrigin(origins = "*")
public class QuizController {

    private final QuizService quizService;

    public QuizController(QuizService quizService) {
        this.quizService = quizService;
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'TEACHER')")
    public Quiz create(@RequestBody QuizCreateRequest req, Authentication auth) {
        return quizService.createQuiz(req, auth.getName());
    }

    @GetMapping("/available")
    public List<Quiz> available(Authentication auth) {
        return quizService.listAvailableQuizzesForStudent(auth.getName());
    }

    @GetMapping("/{quizId}/questions")
    public List<QuizQuestionForStudentDto> questions(@PathVariable Long quizId, Authentication auth) {
        return quizService.getQuestionsForStudent(quizId, auth.getName());
    }

    @PostMapping("/{quizId}/submit")
    public QuizSubmitResult submit(@PathVariable Long quizId, @RequestBody QuizSubmitRequest req, Authentication auth) {
        return quizService.submit(quizId, auth.getName(), req);
    }

    @GetMapping("/{quizId}/results")
    @PreAuthorize("hasAnyRole('ADMIN', 'TEACHER')")
    public QuizResultsDto results(@PathVariable Long quizId, Authentication auth) {
        return quizService.getResults(quizId, auth.getName());
    }

    @PutMapping("/{quizId}/close")
    @PreAuthorize("hasAnyRole('ADMIN', 'TEACHER')")
    public void close(@PathVariable Long quizId, Authentication auth) {
        quizService.closeQuiz(quizId, auth.getName());
    }
}