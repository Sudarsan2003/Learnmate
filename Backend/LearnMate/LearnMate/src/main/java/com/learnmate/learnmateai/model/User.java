package com.learnmate.learnmateai.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "users")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String username;

    // The person's real name, shown on report cards. Optional: accounts made
    // through self sign-up only have a username until someone fills it in.
    private String fullName;

    @Column(nullable = false)
    private String passwordHash;

    @Column(nullable = false)
    private String role = "USER";

    @Column(unique = true)
    private String email;

    private String mobile;

    private String gender;

    @Column(columnDefinition = "TEXT")
    private String address;

    // Required for USER/TEACHER (drives quiz visibility/creation scoping),
    // but ADMIN accounts manage across institutions so they don't have one —
    // see AdminController for the role-aware validation.
    private String institution;

    // A student's class (1–10). Null/blank for ADMIN/TEACHER accounts —
// teachers aren't tied to a single class, they choose per upload instead.
    private String standard;

    @Column(nullable = false)
    private boolean locked = false;
}