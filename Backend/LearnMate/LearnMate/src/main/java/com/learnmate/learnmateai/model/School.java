package com.learnmate.learnmateai.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * A customer school. Students join one by entering its join code at sign-up,
 * so nobody can put themselves into another school's material by typing its
 * name. {@link User#getInstitution()} stores the school's {@code name}, which
 * is what every institution-scoped query already filters on.
 */
@Entity
@Table(name = "schools")
@Data
@NoArgsConstructor
public class School {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String name;

    @Column(nullable = false, unique = true)
    private String joinCode;

    // Inactive schools keep their data but accept no new sign-ups.
    @Column(nullable = false)
    private boolean active = true;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();
}
