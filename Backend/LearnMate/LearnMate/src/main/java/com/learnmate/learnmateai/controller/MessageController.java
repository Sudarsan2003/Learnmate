package com.learnmate.learnmateai.controller;

import com.learnmate.learnmateai.service.MessageService;
import com.learnmate.learnmateai.service.SchoolAccess;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Students and staff messaging each other inside a school (rules in MessageService).
 * The app polls /conversations and /with/{username}?after= while the page is open.
 */
@RestController
@RequestMapping("/api/messages")
public class MessageController {

    private final MessageService messages;
    private final SchoolAccess access;

    public MessageController(MessageService messages, SchoolAccess access) {
        this.messages = messages;
        this.access = access;
    }

    @GetMapping("/contacts")
    public List<MessageService.Contact> contacts(Authentication auth) {
        return messages.contacts(auth.getName());
    }

    @GetMapping("/conversations")
    public List<MessageService.Conversation> conversations(Authentication auth) {
        return messages.conversations(auth.getName());
    }

    @GetMapping("/unread-count")
    public Map<String, Long> unreadCount(Authentication auth) {
        return Map.of("count", messages.unreadCount(auth.getName()));
    }

    @GetMapping("/with/{username}")
    public List<MessageService.Item> thread(@PathVariable String username,
                                            @RequestParam(value = "after", defaultValue = "0") long after,
                                            Authentication auth) {
        return messages.thread(auth.getName(), username, after);
    }

    @PostMapping("/with/{username}")
    public MessageService.Item send(@PathVariable String username, @RequestBody Map<String, String> body,
                                    Authentication auth) {
        return messages.send(auth.getName(), username, body.get("body"));
    }

    // Admins review their school's conversations (the owner names any school).
    @GetMapping("/school")
    @PreAuthorize("hasRole('ADMIN')")
    public List<MessageService.SchoolConversation> schoolConversations(
            @RequestParam(value = "institution", required = false) String institution) {
        return messages.schoolConversations(SchoolAccess.requiredSchool(access.current(), institution));
    }

    @GetMapping("/school/thread")
    @PreAuthorize("hasRole('ADMIN')")
    public List<MessageService.Item> schoolThread(@RequestParam("a") String a, @RequestParam("b") String b,
                                                  @RequestParam(value = "institution", required = false) String institution) {
        return messages.schoolThread(SchoolAccess.requiredSchool(access.current(), institution), a, b);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
    }
}
