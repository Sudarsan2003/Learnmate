package com.learnmate.learnmateai.repository;

import com.learnmate.learnmateai.model.PromotionMove;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PromotionMoveRepository extends JpaRepository<PromotionMove, Long> {

    Optional<PromotionMove> findFirstByInstitutionOrderByCreatedAtDesc(String institution);

    List<PromotionMove> findByBatchId(String batchId);
}
