package com.learnmate.learnmateai.agent;

import com.learnmate.learnmateai.service.TextQuality;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LanguagesTest {

    @Test
    void recognisesKannadaByScriptOrByName() {
        assertThat(Languages.requested("ಚಲನೆ ಎಂದರೇನು?")).containsExactly("Kannada");
        assertThat(Languages.requested("Explain photosynthesis in Kannada")).containsExactly("Kannada");
        assertThat(Languages.guidance("ಚಲನೆ ಎಂದರೇನು?", "Answer", "explanation"))
                .startsWith("Answer primarily in Kannada, the way a Kannada-medium teacher");
    }

    @Test
    void teluguAndHindiStillWorkAndKannadaIsNotMistakenForTelugu() {
        assertThat(Languages.requested("చలనం అంటే ఏమిటి")).containsExactly("Telugu");
        assertThat(Languages.requested("गति क्या है")).containsExactly("Hindi");
        assertThat(Languages.requested("What is motion?")).isEmpty();
        assertThat(Languages.guidance("What is motion?", "Write", "content"))
                .isEqualTo("Write in clear, simple English suitable for an exam-prep student.");
    }

    @Test
    void severalLanguagesAreGivenOneAfterAnother() {
        assertThat(Languages.guidance("explain in telugu and kannada", "Answer", "explanation"))
                .startsWith("Answer in each of Telugu and Kannada: give the full explanation in Telugu first");
    }

    @Test
    void kannadaTextbookPagesCountAsReadable() {
        assertThat(TextQuality.isReadable("ವಸ್ತುವಿನ ಸ್ಥಾನವು ಕಾಲದೊಂದಿಗೆ ಬದಲಾದರೆ ಅದು ಚಲನೆಯಲ್ಲಿದೆ ಎನ್ನುತ್ತೇವೆ.")).isTrue();
    }
}
