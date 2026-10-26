package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.llm.LlmClient;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Base64;
import java.util.Set;

/**
 * Turns a photographed page of exam questions (handwritten or printed) into
 * plain transcribed text. Deliberately does nothing else -- no answering, no
 * MCQ formatting, no grading. That structuring step belongs to
 * EvaluationAgent.structureScannedQuestions(), kept separate so a change to
 * "how we turn questions into MCQs" never has to touch image-handling code.
 */
@Service
public class VisionService {

    private static final Set<String> SUPPORTED_MEDIA_TYPES = Set.of(
            "image/jpeg", "image/png", "image/gif", "image/webp"
    );
    private static final long MAX_IMAGE_BYTES = 5L * 1024 * 1024; // 5 MB

    private final LlmClient llmClient;

    public VisionService(LlmClient llmClient) {
        this.llmClient = llmClient;
    }

    public String extractQuestionsText(MultipartFile image) {
        if (image == null || image.isEmpty()) {
            throw new IllegalArgumentException("No image was uploaded.");
        }
        if (image.getSize() > MAX_IMAGE_BYTES) {
            throw new IllegalArgumentException("Image is too large (max 5 MB).");
        }

        String mediaType = image.getContentType();
        if (mediaType == null || !SUPPORTED_MEDIA_TYPES.contains(mediaType.toLowerCase())) {
            throw new IllegalArgumentException(
                    "Unsupported image type: " + mediaType + ". Use JPEG, PNG, GIF or WEBP."
            );
        }

        String base64Data;
        try {
            base64Data = Base64.getEncoder().encodeToString(image.getBytes());
        } catch (IOException e) {
            throw new IllegalArgumentException("Could not read the uploaded image.", e);
        }

        String systemPrompt = """
                You transcribe exam questions from a photograph of a page (handwritten
                or printed) into clean plain text.

                RULES:
                - Transcribe ONLY what is actually written on the page. Never invent,
                  complete, or guess at a question that is illegible or cut off --
                  transcribe as much as you can read and prefix that line with
                  "[unclear]" instead of making up the rest.
                - Output one question per line, in the order they appear on the page.
                - Strip stray numbering, bullets, or page artifacts, but keep the
                  question text itself exactly as written.
                - Do not answer the questions.
                - Do not add multiple-choice options, explanations, or commentary.
                - If the page contains no legible questions at all, output exactly:
                  NO_QUESTIONS_FOUND
                """;

        String userPrompt = "Transcribe the exam questions from this image.";

        String raw = llmClient.completeWithImage(systemPrompt, userPrompt, base64Data, mediaType.toLowerCase());

        if (raw == null || raw.isBlank() || raw.trim().equals("NO_QUESTIONS_FOUND")) {
            throw new IllegalArgumentException("No legible questions were found in the image.");
        }

        return raw.trim();
    }
}