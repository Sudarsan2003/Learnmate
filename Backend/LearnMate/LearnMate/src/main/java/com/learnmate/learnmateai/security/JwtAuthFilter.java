package com.learnmate.learnmateai.security;

import com.learnmate.learnmateai.model.User;
import com.learnmate.learnmateai.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    public static final String SCHOOL_ACCESS_ENDED =
            "Your school's LearnMate access has ended. Please ask your school to contact LearnMate.";

    private final JwtService jwtService;
    private final CustomUserDetailsService userDetailsService;
    private final UserRepository userRepository;

    public JwtAuthFilter(JwtService jwtService, CustomUserDetailsService userDetailsService,
                         UserRepository userRepository) {
        this.jwtService = jwtService;
        this.userDetailsService = userDetailsService;
        this.userRepository = userRepository;
    }

    /**
     * False when the account's password was changed or reset, its role changed,
     * or it was locked after this token was issued: that token is logged out.
     * The request then carries on unauthenticated and gets "session expired".
     */
    private boolean tokenStillCurrent(String token, String username) {
        int current = userRepository.findByUsername(username).map(User::getTokenVersion).orElse(-1);
        return current == jwtService.extractVersion(token);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        String header = request.getHeader("Authorization");

        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7);

            if (jwtService.isValid(token) && tokenStillCurrent(token, jwtService.extractUsername(token))) {
                String username = jwtService.extractUsername(token);

                if (SecurityContextHolder.getContext().getAuthentication() == null) {
                    UserDetails userDetails = userDetailsService.loadUserByUsername(username);

                    // This filter builds the Authentication directly, bypassing
                    // AuthenticationManager/DaoAuthenticationProvider — so the
                    // standard accountNonLocked check never runs automatically.
                    // Enforce it here instead, on every authenticated request.
                    if (!userDetails.isAccountNonLocked()) {
                        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                        response.setContentType("application/json");
                        response.getWriter().write("{\"message\":\"Your account has been locked by an administrator.\"}");
                        return;
                    }

                    if (!userDetails.isAccountNonExpired()) {
                        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                        response.setContentType("application/json");
                        response.getWriter().write("{\"message\":\"" + SCHOOL_ACCESS_ENDED + "\"}");
                        return;
                    }

                    var authToken = new UsernamePasswordAuthenticationToken(
                            userDetails, null, userDetails.getAuthorities());
                    authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

                    SecurityContextHolder.getContext().setAuthentication(authToken);
                }
            }
        }

        chain.doFilter(request, response);
    }
}