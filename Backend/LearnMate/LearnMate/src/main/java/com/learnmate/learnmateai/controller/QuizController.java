package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.dto.*;
import com.learnmate.learnmateai.model.Quiz;
import com.learnmate.learnmateai.service.QuizService;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

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

    // Teacher/Admin only: photograph handwritten (or printed) exam questions
    // and get back structured MCQs, in the exact shape the Create Quiz form
    // already uses for manualQuestions. Nothing is saved by this call --
    // the caller reviews/edits, then POSTs the normal create request.
    @PostMapping(value = "/scan", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyRole('ADMIN', 'TEACHER')")
    public List<QuizCreateRequest.ManualQuestion> scan(
            @RequestParam("image") MultipartFile image, Authentication auth) {
        return quizService.scanQuestionsFromImage(image, auth.getName());
    }

    @GetMapping("/available")
    public List<Quiz> available(Authentication auth) {
        return quizService.listAvailableQuizzesForStudent(auth.getName());
    }

    // Every quiz the calling admin/teacher created, persisted server-side so
    // it's visible from any browser/device instead of relying on localStorage.
    @GetMapping("/mine")
    @PreAuthorize("hasAnyRole('ADMIN', 'TEACHER')")
    public List<QuizSummaryDto> mine(Authentication auth) {
        return quizService.listMyQuizzes(auth.getName());
    }

    // Admin dashboard feed: every quiz in the system, whoever created it, with
    // creator + creation time. Per-student results for any quiz come from
    // GET /{quizId}/results, which already allows admins on quizzes they didn't create.
    @GetMapping("/all")
    @PreAuthorize("hasRole('ADMIN')")
    public List<QuizAdminSummaryDto> all(Authentication auth) {
        return quizService.listAllQuizzes(auth.getName());
    }

    // Every quiz the calling student has submitted, with marks + submission date.
    @GetMapping("/my-results")
    public List<QuizMyResultDto> myResults(Authentication auth) {
        return quizService.listMyResults(auth.getName());
    }

    // Full per-question review of the caller's own submitted attempt.
    @GetMapping("/{quizId}/my-attempt")
    public QuizAttemptDetailDto myAttempt(@PathVariable Long quizId, Authentication auth) {
        return quizService.getMyAttemptDetail(quizId, auth.getName());
    }

    // NOTE: no more GET /{quizId}/questions — starting a quiz now has a
    // side effect (creating the attempt + timer), so it's a POST.
    @PostMapping("/{quizId}/start")
    public QuizStartDto start(@PathVariable Long quizId, Authentication auth) {
        return quizService.startQuiz(quizId, auth.getName());
    }

    @PostMapping("/{quizId}/submit")
    public QuizSubmitResult submit(@PathVariable Long quizId, @RequestBody QuizSubmitRequest req, Authentication auth) {
        return quizService.submit(quizId, auth.getName(), req);
    }

    @PostMapping("/{quizId}/ask")
    public QuizAskResponse ask(@PathVariable Long quizId, @RequestBody QuizAskRequest req, Authentication auth) {
        return new QuizAskResponse(quizService.askAboutQuiz(quizId, auth.getName(), req));
    }

    // Live leaderboard. Students must have submitted the quiz; staff always allowed.
    @GetMapping("/{quizId}/leaderboard")
    public QuizLeaderboardDto leaderboard(@PathVariable Long quizId, Authentication auth) {
        return quizService.getLeaderboard(quizId, auth.getName());
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