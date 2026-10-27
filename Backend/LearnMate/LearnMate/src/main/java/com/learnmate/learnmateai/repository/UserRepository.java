package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);

    // Class reports: the students of one class at a school.
    List<User> findByInstitutionAndStandardAndRoleOrderByUsernameAsc(String institution, String standard, String role);

    List<User> findByInstitutionAndRole(String institution, String role);

    boolean existsByUsernameIgnoreCase(String username);

    boolean existsByEmailIgnoreCase(String email);

    // Bulk import: catches the same class list being imported twice.
    Optional<User> findFirstByInstitutionAndStandardAndFullNameIgnoreCase(String institution, String standard, String fullName);
}
