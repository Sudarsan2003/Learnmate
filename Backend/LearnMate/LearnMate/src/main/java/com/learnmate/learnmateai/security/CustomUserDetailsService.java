package com.learnmate.learnmateai.security;

import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.SchoolRepository;
import com.learnmate.learnmateai.repository.UserRepository;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class CustomUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;
    private final SchoolRepository schoolRepository;

    public CustomUserDetailsService(UserRepository userRepository, SchoolRepository schoolRepository) {
        this.userRepository = userRepository;
        this.schoolRepository = schoolRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("No user: " + username));

        return org.springframework.security.core.userdetails.User
                .withUsername(user.getUsername())
                .password(user.getPasswordHash())
                .authorities(List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole())))
                .accountLocked(user.isLocked())
                // A trial school past its end date: nobody in it can sign in
                // (the owner never belongs to one school, so is never caught).
                .accountExpired(schoolAccessEnded(user))
                .build();
    }

    private boolean schoolAccessEnded(User user) {
        if (user.isOwner() || user.getInstitution() == null || user.getInstitution().isBlank()) return false;
        return schoolRepository.findByNameIgnoreCase(user.getInstitution().trim())
                .map(s -> s.accessEnded(java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata"))))
                .orElse(false);
    }
}