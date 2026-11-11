package com.learnmate.learnmateai.llm;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ReplicateImageClientTest {

    @Test
    void waitsAsLongAsReplicateAsks() {
        assertThat(ReplicateImageClient.waitSeconds(null,
                "{\"detail\":\"Request was throttled. Your rate limit resets in ~30s.\"}")).isEqualTo(31);
        assertThat(ReplicateImageClient.waitSeconds("12", "anything")).isEqualTo(12);
    }

    @Test
    void unknownOrExtremeWaitsAreKeptSensible() {
        assertThat(ReplicateImageClient.waitSeconds(null, "throttled")).isEqualTo(10);
        assertThat(ReplicateImageClient.waitSeconds("600", null)).isEqualTo(60);
        assertThat(ReplicateImageClient.waitSeconds("0", null)).isEqualTo(2);
    }
}
