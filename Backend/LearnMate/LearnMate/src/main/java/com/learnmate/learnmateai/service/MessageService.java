package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.model.Message;
import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.MessageRepository;
import com.learnmate.learnmateai.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

/**
 * Direct messages inside a school:
 *  - a student can message any teacher or admin of their school;
 *  - staff (teachers and school admins) can message students and each other;
 *  - students can't message each other, and nobody can message another school.
 * A school's admins can read its conversations; the owner can read every school's.
 */
@Service
public class MessageService {

    public static final int MAX_LENGTH = 2000;

    public record Contact(String username, String fullName, String role, String standard) {}

    public record Conversation(String username, String fullName, String role, String standard,
                               String lastMessage, String lastFrom, Instant lastAt, long unread) {}

    public record Item(Long id, String from, String to, String body, Instant createdAt, Instant readAt) {
        static Item of(Message m) {
            return new Item(m.getId(), m.getFromUsername(), m.getToUsername(), m.getBody(), m.getCreatedAt(), m.getReadAt());
        }
    }

    /** One conversation in a school, for its admins: the two people and the latest message. */
    public record SchoolConversation(Contact a, Contact b, String lastMessage, String lastFrom, Instant lastAt,
                                     int messageCount) {}

    private final MessageRepository messages;
    private final UserRepository users;
    private final NotificationService notifications;

    public MessageService(MessageRepository messages, UserRepository users, NotificationService notifications) {
        this.messages = messages;
        this.users = users;
        this.notifications = notifications;
    }

    static boolean isStaff(User u) {
        return ("TEACHER".equals(u.getRole()) || "ADMIN".equals(u.getRole())) && !u.isOwner();
    }

    static boolean isStudent(User u) {
        return "USER".equals(u.getRole());
    }

    static boolean sameSchool(User a, User b) {
        return a.getInstitution() != null && !a.getInstitution().isBlank() && b.getInstitution() != null
                && a.getInstitution().trim().equalsIgnoreCase(b.getInstitution().trim());
    }

    /** Whether {@code from} may start or continue a conversation with {@code to}. */
    static boolean canMessage(User from, User to) {
        if (from.getUsername().equals(to.getUsername()) || from.isOwner() || to.isOwner()) return false;
        if (!sameSchool(from, to)) return false;
        if (isStudent(from)) return isStaff(to);
        return isStaff(from) && (isStaff(to) || isStudent(to));
    }

    /** People {@code me} can start a conversation with: staff first, then students by class. */
    public List<Contact> contacts(String me) {
        User user = user(me);
        return users.findAll().stream()
                .filter(u -> !u.isLocked() && canMessage(user, u))
                .sorted(Comparator.comparing((User u) -> isStaff(u) ? 0 : 1)
                        .thenComparing(u -> u.getStandard() == null ? "" : u.getStandard())
                        .thenComparing(u -> displayName(u).toLowerCase()))
                .map(MessageService::contact)
                .toList();
    }

    /** {@code me}'s conversations, most recent first, with unread counts. */
    public List<Conversation> conversations(String me) {
        Map<String, Message> latest = new LinkedHashMap<>();
        Map<String, Long> unread = new HashMap<>();
        for (Message m : messages.findInvolving(me)) {
            String other = m.getFromUsername().equals(me) ? m.getToUsername() : m.getFromUsername();
            latest.putIfAbsent(other, m);
            if (m.getToUsername().equals(me) && m.getReadAt() == null) unread.merge(other, 1L, Long::sum);
        }
        Map<String, User> people = byUsername(latest.keySet());
        List<Conversation> out = new ArrayList<>();
        latest.forEach((other, m) -> {
            User u = people.get(other);
            Contact c = u == null ? new Contact(other, other, "", "") : contact(u);
            out.add(new Conversation(c.username(), c.fullName(), c.role(), c.standard(),
                    preview(m.getBody()), m.getFromUsername(), m.getCreatedAt(), unread.getOrDefault(other, 0L)));
        });
        return out;
    }

    public long unreadCount(String me) {
        return messages.countByToUsernameAndReadAtIsNull(me);
    }

    /** Messages with {@code other} after {@code afterId}; marks the ones sent to me as read. */
    @Transactional
    public List<Item> thread(String me, String other, long afterId) {
        User user = user(me);
        User them = user(other);
        if (!canMessage(user, them) && messages.findThread(me, other, 0).isEmpty()) {
            throw new IllegalArgumentException("You can't message this person.");
        }
        messages.markRead(me, other, Instant.now());
        return messages.findThread(me, other, afterId).stream().map(Item::of).toList();
    }

    @Transactional
    public Item send(String me, String to, String body) {
        String text = body == null ? "" : body.strip();
        if (text.isEmpty()) throw new IllegalArgumentException("Write a message first.");
        if (text.length() > MAX_LENGTH) {
            throw new IllegalArgumentException("Messages can be up to " + MAX_LENGTH + " characters.");
        }
        User sender = user(me);
        User recipient = user(to);
        if (sender.isLocked()) throw new IllegalArgumentException("Your account is locked.");
        if (!canMessage(sender, recipient)) throw new IllegalArgumentException("You can't message this person.");

        // One bell notification per burst: only when this is their first unread message from me.
        boolean firstUnread = messages.countByToUsernameAndFromUsernameAndReadAtIsNull(to, me) == 0;

        Message m = new Message();
        m.setInstitution(sender.getInstitution().trim());
        m.setFromUsername(me);
        m.setToUsername(to);
        m.setBody(text);
        m.setCreatedAt(Instant.now());
        messages.save(m);

        if (firstUnread) {
            notifications.sendTo(List.of(to), "MESSAGE", "New message from " + displayName(sender),
                    preview(text), "messages:" + me);
        }
        return Item.of(m);
    }

    // ------------------------------------------------------------------ admins: review a school's messages

    /** Every conversation in a school, most recent first. */
    public List<SchoolConversation> schoolConversations(String institution) {
        Map<String, List<Message>> byPair = new LinkedHashMap<>();
        for (Message m : messages.findByInstitutionIgnoreCaseOrderByIdDesc(institution)) {
            byPair.computeIfAbsent(pairKey(m.getFromUsername(), m.getToUsername()), k -> new ArrayList<>()).add(m);
        }
        Set<String> names = new HashSet<>();
        byPair.values().forEach(list -> {
            names.add(list.get(0).getFromUsername());
            names.add(list.get(0).getToUsername());
        });
        Map<String, User> people = byUsername(names);
        List<SchoolConversation> out = new ArrayList<>();
        byPair.forEach((key, list) -> {
            Message last = list.get(0);
            String[] pair = key.split("\n");
            out.add(new SchoolConversation(contactOf(pair[0], people), contactOf(pair[1], people),
                    preview(last.getBody()), last.getFromUsername(), last.getCreatedAt(), list.size()));
        });
        return out;
    }

    /** A conversation between two people, for an admin of their school. Doesn't mark anything read. */
    public List<Item> schoolThread(String institution, String a, String b) {
        return messages.findThread(a, b, 0).stream()
                .filter(m -> m.getInstitution().equalsIgnoreCase(institution))
                .map(Item::of)
                .toList();
    }

    // ------------------------------------------------------------------ helpers

    private User user(String username) {
        return users.findByUsername(username).orElseThrow(() -> new IllegalArgumentException("Unknown user: " + username));
    }

    private Map<String, User> byUsername(Collection<String> names) {
        Map<String, User> out = new HashMap<>();
        for (String n : names) users.findByUsername(n).ifPresent(u -> out.put(n, u));
        return out;
    }

    private static Contact contactOf(String username, Map<String, User> people) {
        User u = people.get(username);
        return u == null ? new Contact(username, username, "", "") : contact(u);
    }

    private static Contact contact(User u) {
        return new Contact(u.getUsername(), displayName(u), u.getRole(), u.getStandard() == null ? "" : u.getStandard());
    }

    private static String displayName(User u) {
        return u.getFullName() != null && !u.getFullName().isBlank() ? u.getFullName() : u.getUsername();
    }

    private static String preview(String body) {
        String one = body.replaceAll("\\s+", " ").strip();
        return one.length() > 120 ? one.substring(0, 117) + "..." : one;
    }

    private static String pairKey(String a, String b) {
        return a.compareTo(b) < 0 ? a + "\n" + b : b + "\n" + a;
    }
}
