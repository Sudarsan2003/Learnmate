package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.model.School;
import com.learnmate.learnmateai.repository.SchoolRepository;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.List;

@Service
public class SchoolService {

    // No 0/O or 1/I/L, so codes read out in class or copied from a board aren't mistyped.
    private static final String CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 8;

    private final SchoolRepository repository;
    private final SecureRandom random = new SecureRandom();

    public SchoolService(SchoolRepository repository) {
        this.repository = repository;
    }

    public List<School> list() {
        return repository.findAllByOrderByNameAsc();
    }

    /** The active school a sign-up code belongs to; rejects unknown or deactivated codes. */
    public School forJoinCode(String code) {
        String cleaned = code == null ? "" : code.replaceAll("[\\s-]", "").toUpperCase();
        return repository.findByJoinCodeIgnoreCase(cleaned)
                .filter(School::isActive)
                .orElseThrow(() -> new IllegalArgumentException(
                        "That school code isn't valid. Ask your teacher for your school's code."));
    }

    public School create(String name) {
        String trimmed = name == null ? "" : name.trim().replaceAll("\\s{2,}", " ");
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("School name is required.");
        }
        if (repository.existsByNameIgnoreCase(trimmed)) {
            throw new IllegalArgumentException("A school called \"" + trimmed + "\" already exists.");
        }
        School school = new School();
        school.setName(trimmed);
        school.setJoinCode(newCode());
        return repository.save(school);
    }

    /** New code for a school whose code leaked; the old code stops working immediately. */
    public School regenerateCode(Long id) {
        School school = get(id);
        school.setJoinCode(newCode());
        return repository.save(school);
    }

    public School setActive(Long id, boolean active) {
        School school = get(id);
        school.setActive(active);
        return repository.save(school);
    }

    private School get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Unknown school."));
    }

    private String newCode() {
        String code;
        do {
            StringBuilder sb = new StringBuilder(CODE_LENGTH);
            for (int i = 0; i < CODE_LENGTH; i++) {
                sb.append(CODE_ALPHABET.charAt(random.nextInt(CODE_ALPHABET.length())));
            }
            code = sb.toString();
        } while (repository.existsByJoinCode(code));
        return code;
    }
}
