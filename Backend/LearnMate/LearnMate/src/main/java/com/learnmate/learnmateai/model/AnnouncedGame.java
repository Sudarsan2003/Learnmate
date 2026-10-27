package com.learnmate.learnmateai.model;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** A game students have already been told about, so each new game is announced exactly once. */
@Entity
@Table(name = "announced_games")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AnnouncedGame {

    @Id
    private String gameType;

    private Instant announcedAt;
}
