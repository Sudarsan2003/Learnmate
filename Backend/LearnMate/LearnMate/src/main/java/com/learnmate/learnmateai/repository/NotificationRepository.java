package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.Notification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    List<Notification> findTop30ByUsernameOrderByCreatedAtDesc(String username);

    long countByUsernameAndReadAtIsNull(String username);

    Optional<Notification> findByIdAndUsername(Long id, String username);

    @Modifying
    @Transactional
    @Query("UPDATE Notification n SET n.readAt = :now WHERE n.username = :username AND n.readAt IS NULL")
    int markAllRead(@Param("username") String username, @Param("now") Instant now);

    @Modifying
    @Transactional
    @Query("DELETE FROM Notification n WHERE n.createdAt < :before")
    int deleteOlderThan(@Param("before") Instant before);
}
