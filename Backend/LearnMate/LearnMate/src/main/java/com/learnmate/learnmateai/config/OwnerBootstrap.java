package com.learnmate.learnmateai.config;

import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Admins used to manage every school. Now that school admins are limited to
 * their own school, the first start makes every existing ADMIN an owner, so
 * nobody loses access they had. The owner then turns the flag off for any
 * school's own admin under Manage users. Runs only while nobody is an owner
 * yet, so later changes stick.
 */
@Component
public class OwnerBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(OwnerBootstrap.class);

    private final UserRepository users;

    public OwnerBootstrap(UserRepository users) {
        this.users = users;
    }

    @Override
    public void run(ApplicationArguments args) {
        List<User> all = users.findAll();
        if (all.stream().anyMatch(User::isOwner)) return;
        List<User> owners = all.stream()
                .filter(u -> "ADMIN".equals(u.getRole()))
                .toList();
        owners.forEach(u -> u.setOwner(true));
        users.saveAll(owners);
        if (!owners.isEmpty()) {
            log.info("LearnMate owners (admins of every school): {}", owners.stream().map(User::getUsername).toList());
        }
    }
}
