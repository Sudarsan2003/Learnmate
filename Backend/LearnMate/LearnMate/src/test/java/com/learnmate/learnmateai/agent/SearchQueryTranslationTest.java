package com.learnmate.learnmateai.agent;

import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

class SearchQueryTranslationTest {

    @Test
    void kannadaQuestionIsLookedUpWithAnEnglishQuery() {
        LearningAgent agent = new LearningAgent((system, user) -> "\"saturated solution definition chapter 9\"");
        assertThat(agent.englishSearchQuery("ಸಂತೃಪ್ತ ದ್ರಾವಣ ಎಂದರೇನು? ಕನ್ನಡದಲ್ಲಿ ವಿವರಿಸಿ"))
                .isEqualTo("saturated solution definition chapter 9");
    }

    @Test
    void teluguAndHindiAreTranslatedToo() {
        LearningAgent agent = new LearningAgent((system, user) -> "motion");
        assertThat(agent.englishSearchQuery("చలనం అంటే ఏమిటి")).isEqualTo("motion");
        assertThat(agent.englishSearchQuery("गति क्या है")).isEqualTo("motion");
    }

    @Test
    void englishQuestionsSkipTheExtraCall() {
        AtomicInteger calls = new AtomicInteger();
        LearningAgent agent = new LearningAgent((system, user) -> {
            calls.incrementAndGet();
            return "x";
        });
        assertThat(agent.englishSearchQuery("What is a saturated solution? Explain in Kannada"))
                .isEqualTo("What is a saturated solution? Explain in Kannada");
        assertThat(calls).hasValue(0);
    }

    @Test
    void anyFailureFallsBackToTheOriginalQuestion() {
        String q = "ಚಲನೆ ಎಂದರೇನು?";
        assertThat(new LearningAgent((s, u) -> { throw new RuntimeException("LLM down"); }).englishSearchQuery(q)).isEqualTo(q);
        assertThat(new LearningAgent((s, u) -> "  ").englishSearchQuery(q)).isEqualTo(q);
        assertThat(new LearningAgent((s, u) -> "ಚಲನೆ").englishSearchQuery(q)).isEqualTo(q); // didn't translate
    }

    @Test
    void scriptDetection() {
        assertThat(Languages.usesIndianScript("ಅಧ್ಯಾಯ 9")).isTrue();
        assertThat(Languages.usesIndianScript("Chapter 9")).isFalse();
        assertThat(Languages.usesIndianScript(null)).isFalse();
    }

}
