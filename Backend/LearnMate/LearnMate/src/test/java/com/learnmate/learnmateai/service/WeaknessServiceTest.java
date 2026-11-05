package com.learnmate.learnmateai.service;

import com.learnmate.learnmateai.dto.RetrievedChunk;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class WeaknessServiceTest {

    @Test
    void levelsFollowTheThresholds() {
        assertThat(WeaknessService.level(35)).isEqualTo("WEAK");
        assertThat(WeaknessService.level(49)).isEqualTo("WEAK");
        assertThat(WeaknessService.level(50)).isEqualTo("PRACTISE");
        assertThat(WeaknessService.level(69)).isEqualTo("PRACTISE");
        assertThat(WeaknessService.level(70)).isEqualTo("STRONG");
    }

    private static RetrievedChunk piece(String header) {
        return new RetrievedChunk(1L, "s", header + "\nSome text from the book.", 0);
    }

    @Test
    void anAiQuizTakesTheChapterMostOfItsPagesCameFrom() {
        String circles = "9thClass Maths SEM-2 Textbook | Chapter 9: Circles";
        String[] found = QuizService.mainChapter(List.of(piece(circles), piece(circles), piece(circles),
                piece("9thClass Maths SEM-2 Textbook | Chapter 8: Quadrilaterals")));
        assertThat(found).containsExactly("9thClass Maths SEM-2 Textbook", "Chapter 9: Circles");
    }

    @Test
    void noChapterWhenThePagesAreMixedOrUnlabelled() {
        assertThat(QuizService.mainChapter(List.of(piece("Book | Chapter 1: A"), piece("Book | Chapter 2: B")))).isNull();
        assertThat(QuizService.mainChapter(List.of(new RetrievedChunk(1L, "s", "an older piece with no header", 0)))).isNull();
    }
}
