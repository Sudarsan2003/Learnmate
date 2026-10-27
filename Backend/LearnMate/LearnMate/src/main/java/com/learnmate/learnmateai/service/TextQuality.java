package com.learnmate.learnmateai.service;

/**
 * Detects text that PDF extraction turned into symbol soup.
 *
 * The usual cause is a page typed in a legacy (non-Unicode) Indic font: the
 * PDF stores Latin-1 / Mac symbol codes instead of real Telugu or Hindi
 * letters, so extraction yields things like ">±¢dt˝À ∫Á‹+#·". Bilingual
 * textbooks often alternate such pages with clean English ones, so this is
 * checked per chunk rather than per document.
 */
public final class TextQuality {

    private static final double MIN_READABLE_RATIO = 0.7;

    private TextQuality() {
    }

    public static boolean isReadable(String text) {
        return readableRatio(text) >= MIN_READABLE_RATIO;
    }

    /** Share of non-space characters that are real letters, digits, vowel signs or plain punctuation. */
    public static double readableRatio(String text) {
        if (text == null || text.isBlank()) return 0;
        int ok = 0, total = 0;
        for (int cp : text.codePoints().toArray()) {
            if (Character.isWhitespace(cp)) continue;
            total++;
            // Latin-1 / Latin Extended letters (é, Ë, ı, ...) are what legacy-font
            // garbage is mostly made of, so they don't count as readable here.
            boolean readableLetter = Character.isLetterOrDigit(cp) && !(cp >= 0x80 && cp <= 0x24F);
            // Vowel signs and viramas in Indic scripts are combining marks, not letters;
            // without this a correctly encoded Unicode Telugu page would look garbled.
            int type = Character.getType(cp);
            boolean mark = type == Character.NON_SPACING_MARK || type == Character.COMBINING_SPACING_MARK;
            if (readableLetter || (mark && cp > 0x24F) || ".,;:!?'\"()-%/".indexOf(cp) >= 0) ok++;
        }
        return total == 0 ? 0 : (double) ok / total;
    }
}
