package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.agent.RetrievalAgent;
import com.learnmate.learnmateai.dto.RetrievedChunk;
import com.learnmate.learnmateai.llm.ReplicateImageClient;
import com.learnmate.learnmateai.model.Story;
import com.learnmate.learnmateai.model.StoryPage;
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.StoryPageRepository;
import com.learnmate.learnmateai.repository.StoryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Picture-book stories for young classes. A teacher gives a topic; in the
 * background the AI writes the pages from the school's material (StoryWriter)
 * and FLUX draws each page (ReplicateImageClient). The teacher checks it, can
 * change any page's words or redraw its picture, and publishes it; only then
 * do that class's students see it. Each story is made once and shared by the
 * whole class, which keeps picture costs to about ₹1-2 a story.
 */
@Service
public class StoryService {

    private static final Logger log = LoggerFactory.getLogger(StoryService.class);

    /** Same look on every page and every story; never text in the picture. */
    static final String STYLE = "Children's picture book illustration, soft watercolour and gentle crayon texture, "
            + "bright friendly colours, simple rounded shapes, cheerful and calm, plenty of clear space, "
            + "full scene, no text, no letters, no words, no numbers, no watermark.";

    private final StoryRepository stories;
    private final StoryPageRepository pages;
    private final StoryWriter writer;
    private final ReplicateImageClient images;
    private final RetrievalAgent retrieval;
    private final com.learnmate.learnmateai.llm.LlmUsageRecorder usage;
    private final ExecutorService worker = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "story-maker");
        t.setDaemon(true);
        return t;
    });

    private final Path dir;

    @Value("${learnmate.stories.daily-limit-per-school:20}")
    private int storiesPerSchoolPerDay;

    @Value("${learnmate.stories.daily-picture-limit-per-school:150}")
    private int picturesPerSchoolPerDay;

    public StoryService(StoryRepository stories, StoryPageRepository pages, StoryWriter writer,
                        ReplicateImageClient images, RetrievalAgent retrieval,
                        com.learnmate.learnmateai.llm.LlmUsageRecorder usage,
                        @Value("${learnmate.stories.dir:${user.home}/learnmate-data/stories}") String dir) {
        this.stories = stories;
        this.pages = pages;
        this.writer = writer;
        this.images = images;
        this.retrieval = retrieval;
        this.usage = usage;
        this.dir = Path.of(dir);
    }

    @PreDestroy
    void stop() {
        worker.shutdownNow();
    }

    /** Stories that were being made when the server stopped will never finish: say so. */
    @EventListener(ApplicationReadyEvent.class)
    public void failInterrupted() {
        for (Story s : stories.findByStatus(Story.Status.GENERATING)) {
            s.setStatus(Story.Status.FAILED);
            s.setError("The server restarted while this story was being made. Please make it again.");
            stories.save(s);
        }
    }

    public boolean picturesEnabled() {
        return images.enabled();
    }

    // ------------------------------------------------------------------ access

    static boolean isStaff(User u) {
        return u != null && ("TEACHER".equals(u.getRole()) || "ADMIN".equals(u.getRole()));
    }

    static void requireStaff(User u) {
        if (!isStaff(u)) throw new SecurityException("Only teachers can do that.");
    }

    /** Staff of the story's school (or the owner) may see and change it; its class's students may read it once published. */
    static boolean canRead(User u, Story s) {
        if (isStaff(u)) return SchoolAccess.canAccess(u, s.getInstitution());
        return s.getStatus() == Story.Status.PUBLISHED
                && u.getInstitution() != null && u.getInstitution().trim().equalsIgnoreCase(s.getInstitution().trim())
                && u.getStandard() != null && u.getStandard().trim().equalsIgnoreCase(s.getStandard().trim());
    }

    static void requireCanEdit(User u, Story s) {
        requireStaff(u);
        if (!SchoolAccess.canAccess(u, s.getInstitution())) throw new SecurityException("That story belongs to another school.");
    }

    public Story get(Long id) {
        return stories.findById(id).orElseThrow(() -> new IllegalArgumentException("That story no longer exists."));
    }

    public Story readable(User u, Long id) {
        Story s = get(id);
        if (!canRead(u, s)) throw new SecurityException("You can't open that story.");
        return s;
    }

    // ------------------------------------------------------------------ listing

    /** Students: their class's published stories. Staff: their school's stories (owner: every school, or one). */
    public List<Story> list(User u, String school) {
        if (!isStaff(u)) {
            if (u.getInstitution() == null || u.getStandard() == null) return List.of();
            return stories.findByInstitutionIgnoreCaseAndStandardAndStatusOrderByPublishedAtDesc(
                    u.getInstitution().trim(), u.getStandard().trim(), Story.Status.PUBLISHED);
        }
        String scope = SchoolAccess.school(u, school);
        return scope == null ? stories.findAllByOrderByCreatedAtDesc()
                : stories.findByInstitutionIgnoreCaseOrderByCreatedAtDesc(scope);
    }

    public List<StoryPage> pagesOf(Long storyId) {
        return pages.findByStoryIdOrderByPageNo(storyId);
    }

    // ------------------------------------------------------------------ making

    public Story create(User u, String requestedSchool, String standard, String topic, String language, int pageCount) {
        requireStaff(u);
        String school = SchoolAccess.requiredSchool(u, requestedSchool);
        String cls = standard == null ? "" : StudentImportService.normaliseClass(standard.trim());
        if (cls == null || cls.isBlank()) throw new IllegalArgumentException("Choose the class this story is for.");
        String t = topic == null ? "" : topic.trim();
        if (t.length() < 3) throw new IllegalArgumentException("Write what the story should be about, e.g. \"Fruits we eat\".");
        if (t.length() > 300) throw new IllegalArgumentException("Keep the topic under 300 characters.");
        String lang = language == null || language.isBlank() ? "English" : language.trim();
        if (!StoryWriter.LANGUAGES.contains(lang)) throw new IllegalArgumentException("Choose English, Kannada, Telugu or Hindi.");
        int n = Math.max(StoryWriter.MIN_PAGES, Math.min(StoryWriter.MAX_PAGES, pageCount <= 0 ? 6 : pageCount));
        Instant since = LocalDate.now(AiUsageService.INDIA).atStartOfDay(AiUsageService.INDIA).toInstant();
        if (stories.countByInstitutionIgnoreCaseAndCreatedAtAfter(school, since) >= storiesPerSchoolPerDay) {
            throw new IllegalArgumentException("Your school has made " + storiesPerSchoolPerDay
                    + " stories today, the daily limit. Please make more tomorrow.");
        }

        Story s = new Story();
        s.setInstitution(school);
        s.setStandard(cls);
        s.setTopic(t);
        s.setLanguage(lang);
        s.setCreatedBy(u.getUsername());
        Story saved = stories.save(s);
        runAs(() -> make(saved.getId(), n));
        return saved;
    }

    /** Runs {@code job} in the background as the signed-in user, so AI usage is counted for them. */
    private void runAs(Runnable job) {
        SecurityContext ctx = SecurityContextHolder.getContext();
        worker.submit(() -> {
            SecurityContextHolder.setContext(ctx);
            try {
                job.run();
            } finally {
                SecurityContextHolder.clearContext();
            }
        });
    }

    void make(Long storyId, int pageCount) {
        Story s = get(storyId);
        try {
            List<String> material = new ArrayList<>();
            try {
                for (RetrievedChunk c : retrieval.retrieve(s.getTopic(), null, s.getInstitution(), s.getStandard(), 4)) {
                    material.add(c.content());
                }
            } catch (RuntimeException e) {
                log.info("No material found for story {} ({}); writing from the topic alone", storyId, e.getMessage());
            }
            StoryWriter.Draft d = writer.write(s.getTopic(), s.getStandard(), s.getLanguage(), pageCount, material);
            s.setTitle(d.title());
            s.setCharacterDescription(d.character());
            stories.save(s);
            int no = 1;
            for (StoryWriter.Page p : d.pages()) {
                StoryPage page = new StoryPage();
                page.setStoryId(storyId);
                page.setPageNo(no++);
                page.setText(p.text());
                page.setScene(p.scene());
                pages.save(page);
            }
            if (images.enabled()) {
                for (StoryPage page : pagesOf(storyId)) draw(s, page);
            }
            s.setStatus(Story.Status.READY);
            s.setError(null);
        } catch (RuntimeException e) {
            log.warn("Story {} failed: {}", storyId, e.getMessage());
            s.setStatus(Story.Status.FAILED);
            s.setError(e.getMessage() == null ? "Something went wrong. Please try again." : e.getMessage());
        }
        stories.save(s);
    }

    static String prompt(Story s, StoryPage p) {
        String character = s.getCharacterDescription() == null || s.getCharacterDescription().isBlank()
                ? "" : " Main character: " + s.getCharacterDescription().trim() + ".";
        String scene = p.getScene() == null || p.getScene().isBlank() ? p.getText() : p.getScene();
        return STYLE + character + " Scene: " + scene.trim();
    }

    /** Draws one page's picture, keeping the old one if this fails. */
    private void draw(Story s, StoryPage page) {
        Instant since = LocalDate.now(AiUsageService.INDIA).atStartOfDay(AiUsageService.INDIA).toInstant();
        if (pages.countImagesSince(s.getInstitution(), since) >= picturesPerSchoolPerDay) {
            page.setImageError("Your school reached today's limit of " + picturesPerSchoolPerDay + " pictures.");
            pages.save(page);
            return;
        }
        try {
            byte[] bytes = images.generate(prompt(s, page));
            usage.recordImage();
            Path folder = dir.resolve(String.valueOf(s.getId()));
            Files.createDirectories(folder);
            String name = "page-" + page.getPageNo() + "-" + System.currentTimeMillis() + ".webp";
            Path tmp = folder.resolve(name + ".part");
            Files.write(tmp, bytes);
            Files.move(tmp, folder.resolve(name), StandardCopyOption.ATOMIC_MOVE);
            String old = page.getImageFile();
            page.setImageFile(name);
            page.setImageGeneratedAt(Instant.now());
            page.setImageError(null);
            pages.save(page);
            if (old != null) Files.deleteIfExists(folder.resolve(old));
        } catch (IOException e) {
            log.warn("Could not save picture for story {} page {}: {}", s.getId(), page.getPageNo(), e.getMessage());
            page.setImageError("The picture couldn't be saved on the server.");
            pages.save(page);
        } catch (RuntimeException e) {
            page.setImageError(e.getMessage());
            pages.save(page);
        }
    }

    // ------------------------------------------------------------------ teacher edits

    public StoryPage editPage(User u, Long storyId, int pageNo, String text, String scene) {
        Story s = get(storyId);
        requireCanEdit(u, s);
        StoryPage p = page(storyId, pageNo);
        if (text != null) {
            String t = text.trim();
            if (t.isEmpty()) throw new IllegalArgumentException("A page needs some words.");
            if (t.length() > 400) throw new IllegalArgumentException("Keep each page under 400 characters.");
            p.setText(t);
        }
        if (scene != null && !scene.isBlank()) p.setScene(scene.trim().length() > 400 ? scene.trim().substring(0, 400) : scene.trim());
        return pages.save(p);
    }

    /** Draws a page's picture again (optionally with a new description); waits for it. */
    public StoryPage redraw(User u, Long storyId, int pageNo, String scene) {
        Story s = get(storyId);
        requireCanEdit(u, s);
        if (!images.enabled()) throw new IllegalArgumentException("Story pictures aren't set up on this server yet.");
        if (s.getStatus() == Story.Status.GENERATING) throw new IllegalArgumentException("This story is still being made.");
        StoryPage p = page(storyId, pageNo);
        if (scene != null && !scene.isBlank()) {
            p.setScene(scene.trim().length() > 400 ? scene.trim().substring(0, 400) : scene.trim());
            pages.save(p);
        }
        draw(s, p);
        return page(storyId, pageNo);
    }

    public Story publish(User u, Long storyId, boolean publish) {
        Story s = get(storyId);
        requireCanEdit(u, s);
        if (publish) {
            if (s.getStatus() == Story.Status.GENERATING) throw new IllegalArgumentException("This story is still being made.");
            if (s.getStatus() == Story.Status.FAILED) throw new IllegalArgumentException("This story wasn't made. Make it again.");
            s.setStatus(Story.Status.PUBLISHED);
            s.setPublishedAt(Instant.now());
        } else if (s.getStatus() == Story.Status.PUBLISHED) {
            s.setStatus(Story.Status.READY);
            s.setPublishedAt(null);
        }
        return stories.save(s);
    }

    public void delete(User u, Long storyId) {
        Story s = get(storyId);
        requireCanEdit(u, s);
        if (s.getStatus() == Story.Status.GENERATING) throw new IllegalArgumentException("Wait until this story is made, then delete it.");
        pages.deleteByStoryId(storyId);
        stories.delete(s);
        Path folder = dir.resolve(String.valueOf(storyId));
        try (var files = Files.exists(folder) ? Files.list(folder) : java.util.stream.Stream.<Path>empty()) {
            files.forEach(f -> f.toFile().delete());
            Files.deleteIfExists(folder);
        } catch (IOException e) {
            log.warn("Could not delete pictures of story {}: {}", storyId, e.getMessage());
        }
    }

    private StoryPage page(Long storyId, int pageNo) {
        return pages.findByStoryIdAndPageNo(storyId, pageNo)
                .orElseThrow(() -> new IllegalArgumentException("That page doesn't exist."));
    }

    /** The picture file of a page the user may read, or null if it has none. */
    public Path picture(User u, Long storyId, int pageNo) {
        Story s = readable(u, storyId);
        StoryPage p = page(s.getId(), pageNo);
        if (p.getImageFile() == null) return null;
        Path f = dir.resolve(String.valueOf(storyId)).resolve(p.getImageFile()).normalize();
        if (!f.startsWith(dir.normalize()) || !Files.isRegularFile(f)) return null;
        return f;
    }

    // ------------------------------------------------------------------ JSON

    public Map<String, Object> summary(Story s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", s.getId());
        m.put("title", s.getTitle() == null ? "" : s.getTitle());
        m.put("topic", s.getTopic());
        m.put("standard", s.getStandard());
        m.put("school", s.getInstitution());
        m.put("language", s.getLanguage());
        m.put("status", s.getStatus().name());
        m.put("error", s.getError() == null ? "" : s.getError());
        m.put("createdBy", s.getCreatedBy());
        m.put("createdAt", s.getCreatedAt());
        m.put("publishedAt", s.getPublishedAt());
        List<StoryPage> ps = pagesOf(s.getId());
        m.put("pageCount", ps.size());
        StoryPage cover = ps.stream().filter(p -> p.getImageFile() != null).findFirst().orElse(null);
        m.put("coverPage", cover == null ? null : cover.getPageNo());
        m.put("coverVersion", cover == null ? "" : cover.getImageFile());
        return m;
    }

    public Map<String, Object> detail(User u, Story s) {
        Map<String, Object> m = summary(s);
        boolean staff = isStaff(u);
        List<Map<String, Object>> list = new ArrayList<>();
        for (StoryPage p : pagesOf(s.getId())) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("pageNo", p.getPageNo());
            row.put("text", p.getText());
            row.put("hasImage", p.getImageFile() != null);
            // The file name changes with each redraw, so a new picture is never served from cache.
            row.put("imageVersion", p.getImageFile() == null ? "" : p.getImageFile());
            if (staff) {
                row.put("scene", p.getScene() == null ? "" : p.getScene());
                row.put("imageError", p.getImageError() == null ? "" : p.getImageError());
            }
            list.add(row);
        }
        m.put("pages", list);
        m.put("canEdit", staff && SchoolAccess.canAccess(u, s.getInstitution()));
        return m;
    }
}
