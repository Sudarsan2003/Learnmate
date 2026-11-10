package com.learnmate.learnmateai.orchestrator;

import com.learnmate.learnmateai.agent.EvaluationAgent;
import com.learnmate.learnmateai.agent.LearningAgent;
import com.learnmate.learnmateai.agent.RetrievalAgent;
import com.learnmate.learnmateai.dto.ChatRequest;
import com.learnmate.learnmateai.dto.ChatResponse;
import com.learnmate.learnmateai.dto.RetrievedChunk;
import com.learnmate.learnmateai.model.ChatMessage;
import com.learnmate.learnmateai.model.ChatQuizAttempt;
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.DocumentChunkRepository;
import com.learnmate.learnmateai.repository.UserRepository;
import com.learnmate.learnmateai.service.ChapterCatalog;
import com.learnmate.learnmateai.service.ChapterCatalog.Chapter;
import com.learnmate.learnmateai.service.ChatHistoryService;
import com.learnmate.learnmateai.service.ChatQuizAttemptService;
import com.learnmate.learnmateai.service.IngestionService;
import com.learnmate.learnmateai.service.TextQuality;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class AgentOrchestrator {

    private static final org.slf4j.Logger log =
            org.slf4j.LoggerFactory.getLogger(AgentOrchestrator.class);

    private static final Pattern QUIZ_WORD = Pattern.compile("\\bquiz\\b");
    // "list the topics in social", "what chapters are in science", "show me all units"
    private static final Pattern LIST_TOPICS = Pattern.compile(
            "(?is).*\\b(list|show me|show|what are|which|give me)\\b.*\\b(topics|chapters|units|lessons)\\b.*");
    private static final Pattern LIST_SUBJECT = Pattern.compile(
            "(?i)\\b(?:in|of|for|from)\\s+(?:the\\s+)?([\\p{L}][\\p{L} ]*?)\\s*[?.!]*\\s*$");
    private static final Pattern STARTS_WITH_NUMBERED_ANSWER =
            Pattern.compile("(?s)^\\s*[Qq]?1\\s*[.):\\-].*");
    // Stray quotes / punctuation around a topic, e.g. Class6_Social_Science".
    private static final Pattern TOPIC_EDGE_JUNK =
            Pattern.compile("^[\\s\"'\u201C\u201D\u2018\u2019`]+|[\\s\"'\u201C\u201D\u2018\u2019`.?!,;:]+$");

    private final RetrievalAgent retrievalAgent;
    private final LearningAgent learningAgent;
    private final EvaluationAgent evaluationAgent;
    private final ChatHistoryService chatHistoryService;
    private final UserRepository userRepository;
    private final ChatQuizAttemptService quizAttemptService;
    private final DocumentChunkRepository chunkRepository;
    private final ChapterCatalog chapterCatalog;

    public AgentOrchestrator(
            RetrievalAgent retrievalAgent,
            LearningAgent learningAgent,
            EvaluationAgent evaluationAgent,
            ChatHistoryService chatHistoryService,
            UserRepository userRepository,
            ChatQuizAttemptService quizAttemptService,
            DocumentChunkRepository chunkRepository,
            ChapterCatalog chapterCatalog) {

        this.retrievalAgent = retrievalAgent;
        this.learningAgent = learningAgent;
        this.evaluationAgent = evaluationAgent;
        this.chatHistoryService = chatHistoryService;
        this.userRepository = userRepository;
        this.quizAttemptService = quizAttemptService;
        this.chunkRepository = chunkRepository;
        this.chapterCatalog = chapterCatalog;
    }

    public ChatResponse handle(ChatRequest req, String ownerUsername, String sessionId) {

        User user = userRepository.findByUsername(ownerUsername)
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));

        try {
            var active = quizAttemptService.findActive(ownerUsername, sessionId);
            if (active.isPresent()) {
                ChatQuizAttempt attempt = active.get();

                if (isCancelRequest(req.query())) {
                    quizAttemptService.abandon(attempt);
                    return new ChatResponse("Okay, I've closed that quiz. Ask me for a new one any time.",
                            List.of(), null);
                }

                // A message that starts with "1." is an answer sheet, even if it contains the word "quiz".
                if (!isQuizRequest(req.query()) || startsWithNumberedAnswer(req.query())) {
                    Map<Integer, String> answers = ChatQuizAttemptService.parseAnswers(
                            req.query(), quizAttemptService.questionCount(attempt));
                    if (!answers.isEmpty()) {
                        try {
                            // 1) Save the raw answers first, so they survive even if grading fails.
                            attempt = quizAttemptService.saveAnswers(attempt, answers);
                            // 2) Grade and store the result.
                            ChatQuizAttempt done = quizAttemptService.grade(attempt, answers);
                            return new ChatResponse(quizAttemptService.formatResultsForChat(done),
                                    List.of(), null);
                        } catch (RuntimeException e) {
                            log.error("Grading failed for user '{}'", ownerUsername, e);
                            return new ChatResponse("Your answers are saved, but I couldn't grade them just now. "
                                    + "Please send them again to retry.", List.of(), null);
                        }
                    }
                    // No numbered answers found: treat it as a normal question.
                }
            }

            // Retrieval is filtered by the student's institution + standard. If either is
            // missing, every search returns nothing, so say so instead of "not found".
            if (profileIncomplete(user)) {
                return new ChatResponse(
                        "Your profile doesn't have an institution and class (standard) set, so I can't "
                                + "look up your study material. Please ask your teacher or admin to update "
                                + "it under Manage users.",
                        List.of(), null);
            }

            if (isListTopicsRequest(req.query())) {
                return handleListTopics(req, user);
            }

            if (isQuizRequest(req.query())) {
                if (req.materialIds() != null && !req.materialIds().isEmpty()) {
                    return handleQuiz(req, user, ownerUsername, sessionId);
                }
                return offerMaterials(req, user, ownerUsername, sessionId);
            }
            return handleTutoring(req, ownerUsername, user);

        } catch (RuntimeException e) {
            // Never let the student see a 500: log the real cause, reply politely.
            log.error("Chat request failed for user '{}', query '{}'", ownerUsername, req.query(), e);
            return new ChatResponse(
                    "Sorry, I couldn't answer that just now. Please try again in a moment.",
                    List.of(), null);
        }
    }

    /** Materials the student can be quizzed on: [{id, name, subject}] for their school + class. */
    public List<Map<String, String>> materialsFor(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));
        if (profileIncomplete(user)) return List.of();
        return chunkRepository.findMaterials(user.getInstitution(), user.getStandard()).stream()
                .map(row -> {
                    String id = (String) row[0];
                    String name = row[1] == null ? id : ((String) row[1]).replaceAll("(?i)\\.pdf$", "");
                    String subject = row[2] == null ? "" : (String) row[2];
                    return Map.of("id", id, "name", name, "subject", subject);
                })
                .toList();
    }

    /**
     * What the quiz picker lists: each book [{id, name, subject, chapters: [{id, name}]}],
     * so a student can tick a whole book or just some of its chapters.
     */
    public List<Map<String, Object>> quizMaterials(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Unknown user"));
        List<Map<String, String>> books = materialsFor(username);
        if (books.isEmpty()) return List.of();
        Map<String, List<Map<String, String>>> chaptersByBook = new java.util.HashMap<>();
        for (Chapter c : chapterCatalog.chaptersFor(user.getInstitution(), user.getStandard())) {
            chaptersByBook.computeIfAbsent(c.sourceId(), k -> new ArrayList<>())
                    .add(Map.of("id", c.id(), "name", c.label()));
        }
        return books.stream()
                .map(b -> Map.<String, Object>of("id", b.get("id"), "name", b.get("name"), "subject", b.get("subject"),
                        "chapters", chaptersByBook.getOrDefault(b.get("id"), List.of())))
                .toList();
    }

    // "Quiz me on ...". A chapter it names ("circles", "chapter 9") gets a quiz on that
    // chapter straight away; several matching chapters, a book, a subject or nothing in
    // particular get the picker, whose trailing token carries the ids (books or
    // "sourceId::chapter") to pre-tick. Any other specific topic is quizzed on the
    // passages that best match it.
    private ChatResponse offerMaterials(ChatRequest req, User user, String ownerUsername, String sessionId) {
        List<Map<String, String>> materials = materialsFor(user.getUsername());
        if (materials.isEmpty()) {
            return new ChatResponse("No study material has been uploaded for your class yet, "
                    + "so I can't build a quiz. Ask your teacher to upload some first.", List.of(), null);
        }

        String topic = normalizeTopic(extractQuizTopic(req.query()));
        boolean vague = isVagueTopic(topic);

        if (!vague) {
            List<Chapter> chapters = ChapterCatalog.match(topic,
                    chapterCatalog.chaptersFor(user.getInstitution(), user.getStandard()));
            if (chapters.size() == 1) {
                Chapter c = chapters.get(0);
                List<RetrievedChunk> chunks = retrievalAgent.retrieveFromChapters(
                        chapters, user.getInstitution(), user.getStandard(), 10);
                if (!chunks.isEmpty()) {
                    return quizFrom(chunks, c.label() + " (" + c.book() + ")", c, req, user, ownerUsername, sessionId);
                }
            } else if (chapters.size() > 1) {
                return picker("I found " + chapters.size() + " chapters that match \"" + topic + "\". Keep the "
                        + "one you want ticked, or add more, then start the quiz.",
                        chapters.stream().map(Chapter::id).toList());
            }
        }

        List<String> preselected = vague ? List.of() : matchMaterials(topic, materials);
        if (!vague && preselected.isEmpty()) {
            // A topic inside a chapter ("Pythagoras theorem"): quiz on the passages about it.
            // If the search can't run, fall back to the picker rather than an error.
            try {
                List<RetrievedChunk> chunks = retrievalAgent.retrieve(
                        topic, null, user.getInstitution(), user.getStandard(), 10);
                if (!chunks.isEmpty()) return quizFrom(chunks, topic, null, req, user, ownerUsername, sessionId);
            } catch (RuntimeException e) {
                log.warn("Topic search for quiz '{}' failed, showing the picker: {}", topic, e.getMessage());
            }
        }

        return picker(preselected.isEmpty()
                ? "Which study material would you like to be quizzed on? Pick whole books, or open a book "
                        + "to choose chapters."
                : "I found material that matches \"" + topic + "\". Check the selection below, "
                        + "add or remove anything (open a book to pick chapters), then start the quiz.",
                preselected);
    }

    // Ids are URL-encoded in the token: chapter ids carry the chapter title, which may
    // contain the commas and brackets the token uses as delimiters.
    private static ChatResponse picker(String intro, List<String> preselected) {
        String ids = preselected.stream()
                .map(id -> java.net.URLEncoder.encode(id, java.nio.charset.StandardCharsets.UTF_8).replace("+", "%20"))
                .collect(java.util.stream.Collectors.joining(","));
        return new ChatResponse(intro + "\n\n[[LEARNMATE_MATERIALS:" + ids + "]]", List.of(), null);
    }

    private static final Set<String> MATCH_STOPWORDS = Set.of(
            "chapter", "unit", "lesson", "the", "and", "class", "on", "of", "in", "about", "me", "quiz");

    /** Ids of the materials sharing the most significant words with the topic (none if no overlap). */
    private List<String> matchMaterials(String topic, List<Map<String, String>> materials) {
        Set<String> wanted = matchTokens(topic);
        if (wanted.isEmpty()) return List.of();

        int best = 0;
        List<String> ids = new ArrayList<>();
        for (Map<String, String> m : materials) {
            Set<String> have = matchTokens(m.get("name") + " " + m.get("subject"));
            int score = (int) wanted.stream().filter(have::contains).count();
            if (score > best) {
                best = score;
                ids.clear();
            }
            if (score == best && score > 0) ids.add(m.get("id"));
        }
        return ids;
    }

    private static Set<String> matchTokens(String s) {
        Set<String> out = new HashSet<>();
        for (String t : s.toLowerCase().split("[^\\p{L}\\p{N}]+")) {
            if (MATCH_STOPWORDS.contains(t)) continue;
            // Plurals and "Maths"/"Mathematics" compare equal (normalizeTopic writes "Mathematics").
            if (t.length() >= 3) out.add(ChapterCatalog.fold(t));
            else if (!t.isEmpty() && t.chars().allMatch(Character::isDigit)) out.add(t);
        }
        return out;
    }

    // ------------------------------------------------------------------ quiz (shown in chat, saved so the answers can be graded)

    // Quiz on what the student ticked in the picker: whole books and/or single chapters.
    private ChatResponse handleQuiz(ChatRequest req, User user, String ownerUsername, String sessionId) {

        List<String> bookIds = req.materialIds().stream().filter(id -> !id.contains(ChapterCatalog.ID_SEPARATOR)).toList();
        List<Chapter> chapters = ChapterCatalog.byIds(req.materialIds(),
                chapterCatalog.chaptersFor(user.getInstitution(), user.getStandard()));

        List<RetrievedChunk> quizChunks = retrievalAgent.retrieveFromSelection(
                bookIds, chapters, user.getInstitution(), user.getStandard(), 10);

        if (quizChunks.isEmpty()) {
            return new ChatResponse(
                    "I couldn't find the material you selected. It may have been removed. "
                            + "Ask me to quiz you again to see what's available now.",
                    List.of(), null);
        }

        List<String> names = new ArrayList<>(topicNames(bookIds, user.getUsername()));
        chapters.forEach(c -> names.add(c.label() + " (" + c.book() + ")"));
        Chapter only = bookIds.isEmpty() && chapters.size() == 1 ? chapters.get(0) : null;
        return quizFrom(quizChunks, names.isEmpty() ? "Selected material" : String.join(", ", names), only,
                req, user, ownerUsername, sessionId);
    }

    // chapter: set when the quiz covers exactly one chapter, so its score counts towards weak chapters.
    private ChatResponse quizFrom(List<RetrievedChunk> quizChunks, String topic, Chapter chapter, ChatRequest req,
                                  User user, String ownerUsername, String sessionId) {
        if (looksGarbled(quizChunks)) {
            return new ChatResponse(
                    "The material you picked isn't readable. Its text was not extracted correctly "
                            + "from the uploaded file (this happens with PDFs typed in older, non-Unicode "
                            + "regional-language fonts). Please ask your teacher to upload a version "
                            + "with selectable text, or pick different material.",
                    List.of(), null);
        }

        try {
            EvaluationAgent.GeneratedQuiz quiz = evaluationAgent.generateMixedQuiz(
                    topic, namedBySource(quizChunks, user), 5, 3, req.level());
            ChatQuizAttempt attempt = quizAttemptService.start(ownerUsername, sessionId, quiz,
                    ChatQuizAttemptService.buildStudyMaterial(quizChunks));
            if (chapter != null) attempt = quizAttemptService.tagChapter(attempt, chapter.label(), chapter.book());
            // The trailing token lets the chat UI swap this text for an interactive quiz card
            // (it's stored in chat history too, so the card comes back after a reload).
            return new ChatResponse(
                    formatQuizForChat(quiz) + "\n\n[[LEARNMATE_QUIZ:" + attempt.getId() + "]]",
                    quizChunks, null);

        } catch (IllegalArgumentException e) {
            // e.g. "I couldn't find enough information in the selected chapter..."
            return new ChatResponse(e.getMessage(), quizChunks, null);
        } catch (RuntimeException e) {
            log.error("Quiz generation failed for topic '{}'", topic, e);
            return new ChatResponse(
                    "I couldn't build that quiz just now. Please try again, or pick different material.",
                    quizChunks, null);
        }
    }

    /**
     * Every book uploaded for the student's class, one per line, with its chapters
     * where known: "9thClass Physics SEM-1 Textbook: Chapter 1: Matter in Our
     * Surroundings; Chapter 2: ...". Lets the tutor answer "what's in this book?"
     * from the whole book rather than the handful of passages the search returned.
     */
    String booksOutline(User user) {
        Map<String, List<String>> chapters = new java.util.LinkedHashMap<>();
        for (Object[] row : chunkRepository.findMaterials(user.getInstitution(), user.getStandard())) {
            if (row[1] != null) chapters.put(IngestionService.bookTitle((String) row[1]), new ArrayList<>());
        }
        for (Chapter c : chapterCatalog.chaptersFor(user.getInstitution(), user.getStandard())) {
            List<String> list = chapters.get(c.book());
            if (list != null) list.add(c.label());
        }
        StringBuilder sb = new StringBuilder();
        chapters.forEach((book, list) -> sb.append("- ").append(book)
                .append(list.isEmpty() ? "" : ": " + String.join("; ", list)).append("\n"));
        return sb.toString().trim();
    }

    /**
     * Copies of the chunks labelled with their file name (e.g. "Science Ch 4 Light")
     * instead of the internal source id, for the AI prompts: the model uses the
     * labels to tell chapters apart and cites them in its "Sources" line.
     */
    private List<RetrievedChunk> namedBySource(List<RetrievedChunk> chunks, User user) {
        Map<String, String> names = new java.util.HashMap<>();
        for (Map<String, String> m : materialsFor(user.getUsername())) names.put(m.get("id"), m.get("name"));
        return chunks.stream()
                .map(c -> new RetrievedChunk(c.chunkId(), names.getOrDefault(c.sourceId(), c.sourceId()),
                        c.content(), c.score()))
                .toList();
    }

    /** The selected books' names, for the quiz title, e.g. "Biology Ch 5, Biology Ch 6". */
    private List<String> topicNames(List<String> materialIds, String username) {
        return materialsFor(username).stream()
                .filter(m -> materialIds.contains(m.get("id")))
                .map(m -> m.get("name"))
                .toList();
    }

    // ------------------------------------------------------------------ list topics (database lookup, not similarity search)

    private boolean profileIncomplete(User user) {
        return user.getInstitution() == null || user.getInstitution().isBlank()
                || user.getStandard() == null || user.getStandard().isBlank();
    }

    private boolean isListTopicsRequest(String query) {
        return query != null && LIST_TOPICS.matcher(query).matches();
    }

    private String extractListSubject(String query) {
        Matcher m = LIST_SUBJECT.matcher(query.trim());
        return m.find() ? m.group(1).trim() : "";
    }

    private ChatResponse handleListTopics(ChatRequest req, User user) {
        String institution = user.getInstitution();
        String standard = user.getStandard();
        String subject = extractListSubject(req.query());

        if (!subject.isBlank()) {
            List<String> files = chunkRepository.findDistinctFileNames(institution, standard, subject);
            // "social studies" should still find a subject stored as "social".
            if (files.isEmpty() && subject.contains(" ")) {
                subject = subject.substring(0, subject.indexOf(' '));
                files = chunkRepository.findDistinctFileNames(institution, standard, subject);
            }
            if (!files.isEmpty()) {
                StringBuilder sb = new StringBuilder("## Study material in ").append(subject).append("\n\n");
                for (String f : files) {
                    sb.append("- ").append(f.replaceAll("(?i)\\.pdf$", "")).append("\n");
                }
                sb.append("\nAsk me to explain any of these, or try \"Quiz me on ")
                        .append(files.get(0).replaceAll("(?i)\\.pdf$", "")).append("\".");
                return new ChatResponse(sb.toString(), List.of(), null);
            }
        }

        List<String> subjects = chunkRepository.findDistinctSubjects(institution, standard);
        if (subjects.isEmpty()) {
            return new ChatResponse("No study material has been uploaded for your class yet.",
                    List.of(), null);
        }
        String intro = subject.isBlank()
                ? "Here are the subjects available for your class:"
                : "I couldn't find \"" + subject + "\" for your class. These subjects are available:";
        return new ChatResponse(intro + "\n\n- " + String.join("\n- ", subjects)
                + "\n\nAsk \"list the topics in <subject>\" to see what's uploaded.", List.of(), null);
    }

    // ------------------------------------------------------------------ normal tutoring

    private ChatResponse handleTutoring(ChatRequest req, String ownerUsername, User user) {

        List<ChatMessage> history =
                (req.sessionId() != null && !req.sessionId().isBlank())
                        ? chatHistoryService.getSessionHistory(ownerUsername, req.sessionId())
                        : List.of();

        // A question in Kannada, Telugu or Hindi script is looked up with an English
        // version of it, since the books are in English (it's still answered in that language).
        String ownQuery = learningAgent.englishSearchQuery(req.query());
        String withContext = buildRetrievalQuery(req.query(), history);
        String retrievalQuery = withContext.equals(req.query()) ? ownQuery : learningAgent.englishSearchQuery(withContext);

        // "Explain chapter 9" / "summary of circles": read that chapter itself. Searching
        // for the words "chapter 9" finds pieces that merely contain a 9. The question on
        // its own decides first; a short follow-up ("simpler please") falls back to the
        // previous question's chapter.
        List<Chapter> allChapters = chapterCatalog.chaptersFor(user.getInstitution(), user.getStandard());
        String chapterQuery = ChapterCatalog.match(ownQuery, allChapters).isEmpty() ? retrievalQuery : ownQuery;
        List<Chapter> chapters = ChapterCatalog.match(chapterQuery, allChapters);
        boolean wholeChapter = !chapters.isEmpty() && chapters.size() <= 2
                && chapters.stream().allMatch(c -> ChapterCatalog.asksForWholeChapter(chapterQuery, c));

        var chunks = wholeChapter
                ? retrievalAgent.retrieveFromChapters(chapters, user.getInstitution(), user.getStandard(),
                        chapters.size() == 1 ? 8 : 4)
                : retrievalAgent.retrieve(retrievalQuery, null, user.getInstitution(), user.getStandard(), 6);

        var answer = learningAgent.explain(req.query(), req.level(), user.getStandard(),
                namedBySource(chunks, user), history, booksOutline(user));

        return new ChatResponse(answer, chunks, null);
    }


    /** True when most retrieved chunks are unreadable symbol soup (bad PDF text extraction). */
    private boolean looksGarbled(List<RetrievedChunk> chunks) {
        long bad = chunks.stream().filter(c -> !TextQuality.isReadable(c.content())).count();
        return bad * 2 > chunks.size();
    }

    private boolean isCancelRequest(String query) {
        if (query == null) return false;
        String q = query.toLowerCase().trim();
        return q.contains("cancel quiz") || q.contains("stop quiz") || q.contains("quit quiz")
                || q.contains("exit quiz") || q.contains("end quiz") || q.contains("skip quiz");
    }

    private boolean isVagueTopic(String topic) {
        String t = topic == null ? "" : topic.toLowerCase().replaceAll("[^a-z ]", " ").trim();
        return t.length() < 3
                || List.of("something", "anything", "random", "whatever", "a quiz", "quiz",
                "any topic", "any chapter", "anything else", "something else").contains(t);
    }

    private boolean isQuizRequest(String query) {

        if (query == null || query.isBlank()) {
            return false;
        }

        String q = query.toLowerCase().trim();

        return q.contains("quiz me")
                || q.contains("test me")
                || q.contains("give me questions")
                || q.contains("ask me questions")
                || QUIZ_WORD.matcher(q).find();   // works across newlines, unlike String.matches(".*...*")
    }

    private boolean startsWithNumberedAnswer(String query) {
        return query != null && STARTS_WITH_NUMBERED_ANSWER.matcher(query).matches();
    }

    /** Fixes common typos of subject names so retrieval still finds the chapter. */
    private String normalizeTopic(String topic) {
        if (topic == null) return null;
        return topic
                .replaceAll("(?i)\\bbiologt\\b|\\bbiolgy\\b|\\bbiologi\\b|\\bbiollogy\\b|\\bbioligy\\b", "Biology")
                .replaceAll("(?i)\\bphysicss?\\b|\\bphisics\\b|\\bphysycs\\b", "Physics")
                .replaceAll("(?i)\\bchemestry\\b|\\bchemistery\\b|\\bchemisty\\b", "Chemistry")
                .replaceAll("(?i)\\bmathamatics\\b|\\bmathmatics\\b|\\bmaths\\b", "Mathematics")
                .replaceAll("(?i)\\bchapetr\\b|\\bchaptar\\b|\\bchapter(?=\\d)", "Chapter ");
    }


    private String extractQuizTopic(String query) {

        String topic = query.trim();

        String[] prefixes = {
                "quiz me on ",
                "test me on ",
                "quiz me about ",
                "test me about ",
                "quiz me ",
                "test me ",
                "give me a quiz on ",
                "give me a quiz about ",
                "create a quiz on ",
                "create a quiz about ",
                "make a quiz on ",
                "make a quiz about ",
                "generate a quiz on ",
                "generate a quiz about ",
                "give me questions on ",
                "give me questions about ",
                "ask me questions on ",
                "ask me questions about "
        };

        String lower = topic.toLowerCase();

        for (String prefix : prefixes) {

            if (lower.startsWith(prefix)) {

                topic = topic.substring(prefix.length()).trim();

                break;
            }
        }

        // Strip stray quotes / trailing punctuation (e.g. `Class6_Social_Science".`),
        // which would otherwise break file-name matching and the quoted TOPIC in the prompt.
        topic = TOPIC_EDGE_JUNK.matcher(topic).replaceAll("").trim();

        // Fallback if nothing is left.
        if (topic.isBlank()) {
            return query;
        }

        return topic;
    }



    private String buildRetrievalQuery(
            String currentQuery,
            List<ChatMessage> history) {

        int wordCount =
                currentQuery.trim().split("\\s+").length;

        if (wordCount > 6 || history.isEmpty()) {
            return currentQuery;
        }

        String lastLearnerQuery =
                history.stream()
                        .filter(m -> "learner".equals(m.getRole()))
                        .reduce((first, second) -> second)
                        .map(ChatMessage::getContent)
                        .orElse(null);

        if (lastLearnerQuery == null ||
                lastLearnerQuery.isBlank()) {

            return currentQuery;
        }

        return lastLearnerQuery + " " + currentQuery;
    }

    private String formatQuizForChat(
            EvaluationAgent.GeneratedQuiz quiz) {

        StringBuilder sb = new StringBuilder();

        sb.append("## Quiz: ")
                .append(quiz.topic())
                .append("\n\n");

        sb.append("**Difficulty:** ")
                .append(quiz.difficulty())
                .append("\n\n");

        int questionNumber = 1;

        for (EvaluationAgent.QuizQuestion q : quiz.questions()) {

            sb.append("### Q")
                    .append(questionNumber)
                    .append(". ")
                    .append(q.questionText())
                    .append("\n\n");

            if ("MCQ".equals(q.type())) {

                sb.append("A. ")
                        .append(q.optionA())
                        .append("\n");

                sb.append("B. ")
                        .append(q.optionB())
                        .append("\n");

                sb.append("C. ")
                        .append(q.optionC())
                        .append("\n");

                sb.append("D. ")
                        .append(q.optionD())
                        .append("\n\n");

            } else if ("DESCRIPTIVE".equals(q.type())) {

                sb.append("*Write your answer in your own words.*\n\n");
            }

            questionNumber++;
        }

        long total = quiz.questions().size();
        long mcqCount = quiz.questions().stream().filter(x -> "MCQ".equals(x.type())).count();

        sb.append("---\n\n");
        sb.append("**Reply with all your answers in one message**, numbered like this:\n\n");
        if (mcqCount > 0) {
            sb.append("`1. B  2. D ...` for the multiple-choice questions (1–").append(mcqCount).append(")");
        }
        if (total > mcqCount) {
            if (mcqCount > 0) sb.append(", and ");
            sb.append("`").append(mcqCount + 1).append(". your written answer` for the descriptive ones (")
                    .append(mcqCount + 1).append("–").append(total).append(")");
        }
        sb.append(".\n\n");
        sb.append("I'll grade them and save your answers and score. Type \"cancel quiz\" to close it.");

        return sb.toString();
    }
}