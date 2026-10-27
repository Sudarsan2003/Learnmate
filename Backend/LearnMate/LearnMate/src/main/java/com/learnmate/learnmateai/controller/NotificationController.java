package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.model.Notification;
import com.learnmate.learnmateai.service.NotificationService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** The signed-in user's own notifications; nobody can read or change anyone else's. */
@RestController
@RequestMapping("/api/notifications")
@CrossOrigin(origins = "*")
public class NotificationController {

    private final NotificationService service;

    public NotificationController(NotificationService service) {
        this.service = service;
    }

    // { unreadCount, items: [{ id, type, title, message, link, createdAt, read }] }
    @GetMapping
    public Map<String, Object> mine(Authentication auth) {
        List<Map<String, Object>> items = service.latest(auth.getName()).stream().map(NotificationController::row).toList();
        return Map.of("unreadCount", service.unreadCount(auth.getName()), "items", items);
    }

    @PostMapping("/{id}/read")
    public void markRead(@PathVariable Long id, Authentication auth) {
        service.markRead(auth.getName(), id);
    }

    @PostMapping("/read-all")
    public void markAllRead(Authentication auth) {
        service.markAllRead(auth.getName());
    }

    private static Map<String, Object> row(Notification n) {
        return Map.of(
                "id", n.getId(),
                "type", n.getType(),
                "title", n.getTitle(),
                "message", n.getMessage() == null ? "" : n.getMessage(),
                "link", n.getLink() == null ? "" : n.getLink(),
                "createdAt", n.getCreatedAt(),
                "read", n.getReadAt() != null);
    }
}
