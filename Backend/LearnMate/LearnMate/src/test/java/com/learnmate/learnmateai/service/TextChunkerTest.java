package com.learnmate.learnmateai.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class TextChunkerTest {

    private static String sentences(String prefix, int count) {
        StringBuilder sb = new StringBuilder();
        for (int i = 1; i <= count; i++) {
            sb.append(prefix).append(" sentence number ").append(i).append(" has exactly eight words. ");
        }
        return sb.toString().trim();
    }

    @Test
    void cutsAtSentenceEndsWithinTheLimit() {
        List<TextChunker.Chunk> chunks = TextChunker.chunk(sentences("Plants", 100), 50, 10);

        assertThat(chunks).hasSizeGreaterThan(1);
        for (TextChunker.Chunk c : chunks) {
            assertThat(TextChunker.wordCount(c.text())).isLessThanOrEqualTo(50);
            assertThat(c.text()).startsWith("Plants").endsWith("words.");
        }
    }

    @Test
    void repeatsTheLastSentenceOfEachPieceAtTheStartOfTheNext() {
        List<TextChunker.Chunk> chunks = TextChunker.chunk(sentences("Plants", 30), 50, 10);

        String first = chunks.get(0).text();
        String lastSentenceOfFirst = first.substring(first.lastIndexOf("Plants"));
        assertThat(chunks.get(1).text()).startsWith(lastSentenceOfFirst);
    }

    @Test
    void labelsPiecesWithTheirChapterAndNeverMixesChapters() {
        String text = "Chapter 1: Nutrition in Plants\n" + sentences("Leaves", 10)
                + "\n\nCHAPTER 2 Light\n" + sentences("Mirrors", 10);

        List<TextChunker.Chunk> chunks = TextChunker.chunk(text, 250, 50);

        assertThat(chunks).hasSize(2);
        assertThat(chunks.get(0).heading()).isEqualTo("Chapter 1: Nutrition in Plants");
        assertThat(chunks.get(0).text()).contains("Leaves").doesNotContain("Mirrors");
        assertThat(chunks.get(1).heading()).isEqualTo("CHAPTER 2 Light");
        assertThat(chunks.get(1).text()).contains("Mirrors").doesNotContain("Leaves");
    }

    @Test
    void shortTextBeforeAChapterJoinsThatChapter() {
        String text = "Science Textbook for Class 8\n\nChapter 1 Crop Production\n" + sentences("Farmers", 10);

        List<TextChunker.Chunk> chunks = TextChunker.chunk(text, 250, 50);

        assertThat(chunks).hasSize(1);
        assertThat(chunks.get(0).heading()).isEqualTo("Chapter 1 Crop Production");
        assertThat(chunks.get(0).text()).startsWith("Science Textbook for Class 8");
    }

    @Test
    void joinsWrappedAndHyphenatedLines() {
        List<TextChunker.Chunk> chunks = TextChunker.chunk("Green plants make food by photo-\nsynthesis using\nsunlight.", 250, 50);

        assertThat(chunks.get(0).text()).isEqualTo("Green plants make food by photosynthesis using sunlight.");
    }

    @Test
    void recognisesTeluguAndHindiChapterHeadings() {
        String text = "అధ్యాయం 3 కాంతి\n" + sentences("కాంతి", 6) + "\n\nअध्याय 4 ध्वनि\n" + sentences("ध्वनि", 6);

        List<TextChunker.Chunk> chunks = TextChunker.chunk(text, 250, 50);

        assertThat(chunks).extracting(TextChunker.Chunk::heading).containsExactly("అధ్యాయం 3 కాంతి", "अध्याय 4 ध्वनि");
    }

    @Test
    void splitsASentenceLongerThanTheLimit() {
        String longSentence = "word ".repeat(120).trim() + ".";

        List<TextChunker.Chunk> chunks = TextChunker.chunk(longSentence, 50, 10);

        assertThat(chunks).hasSize(3);
        assertThat(chunks).allSatisfy(c -> assertThat(TextChunker.wordCount(c.text())).isLessThanOrEqualTo(50));
    }

    @Test
    void ordinaryNumberedLinesAreNotChapters() {
        String text = "1. Roots absorb water.\n2. Leaves make food.\nPart of the plant is the stem.";

        assertThat(TextChunker.chunk(text, 250, 50)).extracting(TextChunker.Chunk::heading).containsOnlyNulls();
    }
}
