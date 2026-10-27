package com.learnmate.learnmateai.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class StudentImportServiceTest {

    @Test
    void classesAreNormalisedTheWaySignUpStoresThem() {
        assertEquals("9", StudentImportService.normaliseClass("9"));
        assertEquals("9", StudentImportService.normaliseClass("09"));
        assertEquals("9", StudentImportService.normaliseClass("IX"));
        assertEquals("9", StudentImportService.normaliseClass("Class 9"));
        assertEquals("9", StudentImportService.normaliseClass("class IX"));
        assertEquals("9", StudentImportService.normaliseClass("9th"));
        assertEquals("1", StudentImportService.normaliseClass("1st"));
        assertEquals("10", StudentImportService.normaliseClass("Grade 10"));
        assertEquals("10", StudentImportService.normaliseClass("Std X"));
        // Anything else is kept as written rather than guessed at.
        assertEquals("LKG", StudentImportService.normaliseClass("LKG"));
    }

    @Test
    void reportClassesSortNumerically() {
        assertEquals(-1, Integer.signum(ReportService.compareStandards("2", "10")));
        assertEquals(-1, Integer.signum(ReportService.compareStandards("10", "LKG")));
    }
}
