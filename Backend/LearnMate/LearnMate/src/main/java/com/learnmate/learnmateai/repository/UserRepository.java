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

    /** Accounts using this 10-digit mobile number, however it was typed (+91, spaces, a leading 0). */
    @org.springframework.data.jpa.repository.Query(value =
            "SELECT count(*) FROM users WHERE right(regexp_replace(coalesce(mobile, ''), '[^0-9]', '', 'g'), 10) = :mobile",
            nativeQuery = true)
    long countByMobileDigits(@org.springframework.data.repository.query.Param("mobile") String mobile);
}
