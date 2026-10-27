package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.AnnouncedGame;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AnnouncedGameRepository extends JpaRepository<AnnouncedGame, String> {
}
