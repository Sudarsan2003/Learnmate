package com.learnmate.learnmateai.service;

import jakarta.persistence.EntityManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * A person's own activity: quiz attempts and answers, practice quizzes, chats,
 * learning history, notifications, game progress, messages and promotion
 * records. It's stored by username, so when an account is deleted this goes
 * too; otherwise someone who later registers the same username would inherit
 * another student's results. The school's material and the quizzes teachers
 * created are not personal activity and stay.
 */
@Service
public class UserDataService implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(UserDataService.class);

    // "%s" is the condition on the stored username: "= :u" for one person,
    // "NOT IN (SELECT u.username FROM User u)" for accounts that no longer exist.
    private static final String[] DELETES = {
            "DELETE FROM QuizAnswer a WHERE a.attempt.id IN (SELECT t.id FROM QuizAttempt t WHERE t.username %s)",
            "DELETE FROM QuizAttempt t WHERE t.username %s",
            "DELETE FROM ChatQuizAttempt c WHERE c.username %s",
            "DELETE FROM ChatMessage m WHERE m.ownerUsername %s",
            "DELETE FROM LearningHistory h WHERE h.username %s",
            "DELETE FROM Notification n WHERE n.username %s",
            "DELETE FROM GameProgress g WHERE g.username %s",
            "DELETE FROM Message m WHERE m.fromUsername %s",
            "DELETE FROM Message m WHERE m.toUsername %s",
            "DELETE FROM PromotionMove p WHERE p.username %s",
    };

    private final EntityManager em;
    private final TransactionTemplate tx;

    public UserDataService(EntityManager em, PlatformTransactionManager transactions) {
        this.em = em;
        this.tx = new TransactionTemplate(transactions);
    }

    /** Deletes everything {@code username} did in LearnMate. Call before deleting the account. */
    @Transactional
    public int deleteActivity(String username) {
        int rows = 0;
        for (String jpql : DELETES) {
            rows += em.createQuery(jpql.formatted("= :u")).setParameter("u", username).executeUpdate();
        }
        return rows;
    }

    /** Deletes activity left behind by accounts deleted before this cleanup existed. */
    public int deleteOrphanedActivity() {
        // An explicit transaction: run() calls this on the object itself, which
        // bypasses the proxy that would apply @Transactional.
        return tx.execute(status -> {
            int rows = 0;
            for (String jpql : DELETES) {
                rows += em.createQuery(jpql.formatted("NOT IN (SELECT u.username FROM User u)")).executeUpdate();
            }
            return rows;
        });
    }

    // Runs at every start; after the first it finds nothing to remove.
    @Override
    public void run(ApplicationArguments args) {
        try {
            int rows = deleteOrphanedActivity();
            if (rows > 0) log.info("Removed {} rows of activity left by deleted accounts", rows);
        } catch (RuntimeException e) {
            log.warn("Could not clean up activity of deleted accounts: {}", e.getMessage());
        }
    }
}
