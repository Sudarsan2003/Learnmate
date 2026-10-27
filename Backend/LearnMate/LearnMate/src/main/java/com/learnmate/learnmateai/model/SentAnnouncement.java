package com.learnmate.learnmateai.model;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * A scheduled announcement that has already gone out, e.g.
 * "WEEK_TOPPERS|2026-10-19|Sri Vidya|9", so restarts or a second server never
 * send it twice.
 */
@Entity
@Table(name = "sent_announcements")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SentAnnouncement {

    @Id
    private String announcementKey;

    private Instant sentAt;
}
