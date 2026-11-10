package com.learnmate.learnmateai.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class AiUsageServiceTest {

    @Test
    void studentsGetTheirSchoolsLimitOrTheDefault() {
        assertThat(AiUsageService.limitFor("USER", null, 60, 0)).isEqualTo(60);
        assertThat(AiUsageService.limitFor("USER", 25, 60, 0)).isEqualTo(25);
        assertThat(AiUsageService.limitFor("USER", 0, 60, 0)).isZero(); // school chose no limit
    }

    @Test
    void staffUseTheStaffLimit() {
        assertThat(AiUsageService.limitFor("TEACHER", 25, 60, 0)).isZero();
        assertThat(AiUsageService.limitFor("ADMIN", 25, 60, 200)).isEqualTo(200);
    }

    @Test
    void negativeSettingsMeanNoLimit() {
        assertThat(AiUsageService.limitFor("USER", -5, 60, 0)).isZero();
    }

    @Test
    void costUsesPricePerMillionTokens() {
        // 1M input at $2 + 100k output at $10 = $3
        assertThat(AiUsageService.costUsd(1_000_000, 100_000, 2.0, 10.0)).isCloseTo(3.0, within(1e-9));
        assertThat(AiUsageService.costUsd(0, 0, 2.0, 10.0)).isZero();
    }

    @Test
    void pricesFollowTheConfiguredModel() {
        assertThat(AiUsageService.prices("claude-sonnet-4-6", "", "")).containsExactly(3.0, 15.0);
        assertThat(AiUsageService.prices("claude-sonnet-5", null, null)).containsExactly(2.0, 10.0);
        assertThat(AiUsageService.prices("some-new-model", "", "")).containsExactly(3.0, 15.0);
        assertThat(AiUsageService.prices("claude-sonnet-5", "1.5", "")).containsExactly(1.5, 10.0);
    }

    @Test
    void limitMessageNamesTheLimit() {
        assertThat(new AiUsageService.DailyLimitException(40).getMessage()).contains("40 questions today");
    }
}
