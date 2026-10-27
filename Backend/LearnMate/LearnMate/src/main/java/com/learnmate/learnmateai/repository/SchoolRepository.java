package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.School;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SchoolRepository extends JpaRepository<School, Long> {
    Optional<School> findByJoinCodeIgnoreCase(String joinCode);

    boolean existsByNameIgnoreCase(String name);

    boolean existsByJoinCode(String joinCode);

    List<School> findAllByOrderByNameAsc();
}
