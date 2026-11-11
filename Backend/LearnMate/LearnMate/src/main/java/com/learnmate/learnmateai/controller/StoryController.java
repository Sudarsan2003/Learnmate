package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.model.Story;
import com.learnmate.learnmateai.service.SchoolAccess;
import com.learnmate.learnmateai.service.StoryService;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Picture-book stories (see StoryService). Teachers and admins make, check and
 * publish them; students read their own class's published stories.
 */
@RestController
@RequestMapping("/api/stories")
public class StoryController {

    private final StoryService stories;
    private final SchoolAccess access;

    public StoryController(StoryService stories, SchoolAccess access) {
        this.stories = stories;
        this.access = access;
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
    }

    @ExceptionHandler(SecurityException.class)
    public ResponseEntity<Map<String, String>> forbidden(SecurityException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", e.getMessage()));
    }

    // Whether pictures can be made on this server (REPLICATE_API_TOKEN set).
    @GetMapping("/settings")
    public Map<String, Object> settings() {
        return Map.of("picturesEnabled", stories.picturesEnabled(), "languages", List.of("English", "Kannada", "Telugu", "Hindi"));
    }

    @GetMapping
    public List<Map<String, Object>> list(@RequestParam(required = false) String institution) {
        return stories.list(access.current(), institution).stream().map(stories::summary).toList();
    }

    // Body: { "standard": "LKG", "topic": "Fruits we eat", "language": "English", "pages": 6, "institution": "..." }
    @PostMapping
    public Map<String, Object> create(@RequestBody Map<String, Object> body) {
        Story s = stories.create(access.current(), str(body.get("institution")), str(body.get("standard")),
                str(body.get("topic")), str(body.get("language")), toInt(body.get("pages")));
        return stories.summary(s);
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable Long id) {
        var u = access.current();
        return stories.detail(u, stories.readable(u, id));
    }

    // Body: { "text": "...", "scene": "..." } (either may be left out)
    @PutMapping("/{id}/pages/{pageNo}")
    public Map<String, Object> editPage(@PathVariable Long id, @PathVariable int pageNo, @RequestBody Map<String, Object> body) {
        var u = access.current();
        stories.editPage(u, id, pageNo, str(body.get("text")), str(body.get("scene")));
        return stories.detail(u, stories.get(id));
    }

    // Draws the page's picture again; body: { "scene": "..." } to change what it shows (optional).
    @PostMapping("/{id}/pages/{pageNo}/redraw")
    public Map<String, Object> redraw(@PathVariable Long id, @PathVariable int pageNo,
                                      @RequestBody(required = false) Map<String, Object> body) {
        var u = access.current();
        stories.redraw(u, id, pageNo, body == null ? null : str(body.get("scene")));
        return stories.detail(u, stories.get(id));
    }

    @PostMapping("/{id}/publish")
    public Map<String, Object> publish(@PathVariable Long id) {
        return stories.summary(stories.publish(access.current(), id, true));
    }

    @PostMapping("/{id}/unpublish")
    public Map<String, Object> unpublish(@PathVariable Long id) {
        return stories.summary(stories.publish(access.current(), id, false));
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable Long id) {
        stories.delete(access.current(), id);
        return Map.of("deleted", true);
    }

    @GetMapping("/{id}/pages/{pageNo}/image")
    public ResponseEntity<byte[]> picture(@PathVariable Long id, @PathVariable int pageNo) throws IOException {
        Path f = stories.picture(access.current(), id, pageNo);
        if (f == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("image/webp"))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(7)).cachePrivate())
                .body(Files.readAllBytes(f));
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }

    private static int toInt(Object o) {
        if (o instanceof Number n) return n.intValue();
        try {
            return o == null ? 0 : Integer.parseInt(o.toString().trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
