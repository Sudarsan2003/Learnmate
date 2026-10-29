package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.service.ChapterCatalog.Chapter;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ChapterCatalogTest {

    private static Chapter chapter(String source, String book, String subject, int n, String title) {
        String label = "Chapter " + n + ": " + title;
        return new Chapter(source + "::" + label, source, book, subject, label, n, book + " | " + label);
    }

    private final Chapter circles = chapter("m2", "9thClass Maths SEM-2 Textbook", "maths", 9, "Circles");
    private final Chapter heron = chapter("m2", "9thClass Maths SEM-2 Textbook", "maths", 10, "Heron's Formula");
    private final Chapter linear = chapter("m1", "9thClass Maths SEM-1 Textbook", "maths", 4, "Linear Equations in Two Variables");
    private final Chapter gravitation = chapter("p2", "9thClass Physics SEM-2 Textbook", "physics", 9, "Gravitation");
    private final Chapter motion = chapter("p1", "9thClass Physics SEM-1 Textbook", "physics", 7, "Motion");
    private final List<Chapter> all = List.of(circles, heron, linear, gravitation, motion);

    @Test
    void matchesAChapterByTitleSingularOrPlural() {
        assertThat(ChapterCatalog.match("circles", all)).containsExactly(circles);
        assertThat(ChapterCatalog.match("circle", all)).containsExactly(circles);
        assertThat(ChapterCatalog.match("linear equations", all)).containsExactly(linear);
    }

    @Test
    void matchesByNumberAndUsesBookWordsToChoose() {
        assertThat(ChapterCatalog.match("chapter 9", all)).containsExactlyInAnyOrder(circles, gravitation);
        assertThat(ChapterCatalog.match("maths chapter 9", all)).containsExactly(circles);
        assertThat(ChapterCatalog.match("Mathematics chapter 9", all)).containsExactly(circles);
        assertThat(ChapterCatalog.match("ch 7", all)).containsExactly(motion);
        assertThat(ChapterCatalog.match("chapter 12", all)).isEmpty();
    }

    @Test
    void oneSharedWordIsNotEnoughForALongTitle() {
        assertThat(ChapterCatalog.match("two", all)).isEmpty();
        assertThat(ChapterCatalog.match("pythagoras theorem", all)).isEmpty();
    }

    @Test
    void tellsAWholeChapterRequestFromAQuestionInsideIt() {
        assertThat(ChapterCatalog.asksForWholeChapter("Explain chapter 9", circles)).isTrue();
        assertThat(ChapterCatalog.asksForWholeChapter("give me a summary of circles", circles)).isTrue();
        assertThat(ChapterCatalog.asksForWholeChapter("explain circles simpler please", circles)).isTrue();
        assertThat(ChapterCatalog.asksForWholeChapter("what is a chord in circles", circles)).isFalse();
    }

    @Test
    void findsChaptersByTheIdsThePickerSends() {
        assertThat(ChapterCatalog.byIds(List.of(circles.id(), "m1", "nope::Chapter 1"), all)).containsExactly(circles);
    }
}
