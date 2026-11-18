package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.PushToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PushTokenRepository extends JpaRepository<PushToken, Long> {

    Optional<PushToken> findByToken(String token);

    List<PushToken> findByUsernameIn(Collection<String> usernames);

    @Modifying
    @Transactional
    @Query("DELETE FROM PushToken p WHERE p.token = :token")
    int deleteByToken(@Param("token") String token);

    @Modifying
    @Transactional
    @Query("DELETE FROM PushToken p WHERE p.token = :token AND p.username = :username")
    int deleteByTokenAndUsername(@Param("token") String token, @Param("username") String username);
}
