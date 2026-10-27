package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.SentAnnouncement;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SentAnnouncementRepository extends JpaRepository<SentAnnouncement, String> {
}
