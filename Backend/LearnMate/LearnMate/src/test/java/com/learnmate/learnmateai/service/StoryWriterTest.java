package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.model.Story;
import com.learnmate.learnmateai.model.StoryPage;
import com.learnmate.learnmateai.model.User;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StoryWriterTest {

    private static final String JSON = """
            Here you go:
            ```json
            {"title": "Ravi's Red Ball", "character": "a small boy in a blue shirt",
             "pages": [{"text": "Ravi has a ball.", "scene": "a boy holding a red ball"},
                       {"text": "The ball is red.", "scene": "a red ball on grass"},
                       {"text": "It goes up.", "scene": "a ball in the sky"},
                       {"text": "It comes down.", "scene": "a ball landing"},
                       {"text": "  ", "scene": "ignored, no words"}]}
            ```""";

    @Test
    void readsTheStoryEvenWithFencesAroundIt() {
        StoryWriter w = new StoryWriter((s, u) -> JSON);
        StoryWriter.Draft d = w.write("Colours", "LKG", "English", 4, List.of());
        assertThat(d.title()).isEqualTo("Ravi's Red Ball");
        assertThat(d.character()).contains("blue shirt");
        assertThat(d.pages()).hasSize(4); // the blank page is dropped
        assertThat(d.pages().get(0).scene()).isEqualTo("a boy holding a red ball");
    }

    @Test
    void promptAsksForTheRightLanguageLengthAndMaterial() {
        String[] seen = new String[2];
        new StoryWriter((s, u) -> { seen[0] = s; seen[1] = u; return JSON; })
                .write("Fruits", "UKG", "Kannada", 4, List.of("Mango is the king of fruits."));
        assertThat(seen[0]).contains("in Kannada").contains("Exactly 4 pages").contains("at most 15 words")
                .contains("5-year-old");
        assertThat(seen[1]).contains("Topic: Fruits").contains("Mango is the king of fruits.");
    }

    @Test
    void trueHistoryStoriesMustKeepTheFacts() {
        String[] seen = new String[1];
        new StoryWriter((sys, u) -> { seen[0] = sys; return JSON; })
                .write("True story: Saalumarada Thimmakka planted 385 banyan saplings", "UKG", "English", 4, List.of());
        assertThat(seen[0]).contains("keep every").contains("never invent events, dates, numbers or quotes")
                .doesNotContain("brands, real people");
    }

    @Test
    void refusesTooShortOrUnreadableStories() {
        assertThatThrownBy(() -> new StoryWriter((s, u) -> "sorry").write("x", "LKG", "English", 6, List.of()))
                .hasMessageContaining("didn't return a story");
        assertThatThrownBy(() -> new StoryWriter((s, u) -> "{\"pages\": [{\"text\": \"one\"}]}")
                .write("x", "LKG", "English", 6, List.of()))
                .hasMessageContaining("too short");
    }

    @Test
    void picturePromptKeepsStyleAndCharacterAndNeverAsksForText() {
        Story s = new Story();
        s.setCharacterDescription("a small boy in a blue shirt");
        StoryPage p = new StoryPage();
        p.setText("Ravi has a ball.");
        p.setScene("a boy holding a red ball");
        String prompt = StoryService.prompt(s, p);
        assertThat(prompt).contains("no text").contains("blue shirt").endsWith("a boy holding a red ball");
    }

    private static User user(String role, String school, String cls) {
        User u = new User();
        u.setRole(role);
        u.setInstitution(school);
        u.setStandard(cls);
        return u;
    }

    @Test
    void studentsReadOnlyTheirClassesPublishedStories() {
        Story s = new Story();
        s.setInstitution("Wellsprings");
        s.setStandard("LKG");
        s.setStatus(Story.Status.READY);
        User kid = user("USER", "Wellsprings", "LKG");
        assertThat(StoryService.canRead(kid, s)).isFalse(); // not published yet
        s.setStatus(Story.Status.PUBLISHED);
        assertThat(StoryService.canRead(kid, s)).isTrue();
        assertThat(StoryService.canRead(user("USER", "Wellsprings", "UKG"), s)).isFalse();
        assertThat(StoryService.canRead(user("USER", "Other School", "LKG"), s)).isFalse();
    }

    @Test
    void teachersSeeTheirOwnSchoolsStoriesOnly() {
        Story s = new Story();
        s.setInstitution("Wellsprings");
        s.setStandard("LKG");
        assertThat(StoryService.canRead(user("TEACHER", "Wellsprings", null), s)).isTrue();
        assertThat(StoryService.canRead(user("TEACHER", "Other School", null), s)).isFalse();
        assertThatThrownBy(() -> StoryService.requireCanEdit(user("USER", "Wellsprings", "LKG"), s))
                .isInstanceOf(SecurityException.class);
    }
}
