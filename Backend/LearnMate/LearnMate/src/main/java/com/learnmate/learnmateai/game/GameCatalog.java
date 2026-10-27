package com.learnmate.learnmateai.game;

import java.util.List;

/**
 * Every game in LearnMate, in the order the Progress page shows them.
 *
 * To add a game, append it here (and build its screen in the frontend). The
 * next time the server starts, students get one "new game" notification for
 * it. `announce = false` marks games that were already there before
 * notifications existed, so they are never announced.
 */
public final class GameCatalog {

    public record Game(String type, String title, String section, boolean announce) {}

    public static final List<Game> GAMES = List.of(
            new Game("MATH", "Math Adventure", "math", false),
            new Game("WORDS", "Word Wizard", "words", false),
            new Game("RACE", "Maths Race", "arcade", false),
            new Game("BALLOON", "Balloon Maths", "arcade", false),
            new Game("MEMORY", "Memory Match", "arcade", false),
            new Game("BIGGER", "Which Is Bigger?", "arcade", false),
            new Game("SHOP", "Virtual Shop", "arcade", false),
            new Game("PUZZLE", "Maths Puzzle", "arcade", false),
            new Game("SHAPE", "Shape Builder", "arcade", false),
            new Game("DETECTIVE", "Maths Detective", "arcade", false),
            new Game("CODE", "Code Cracker", "aptitude", true),
            new Game("ODDONE", "Odd One Out", "aptitude", true),
            new Game("DIRECTION", "Direction Sense", "aptitude", true),
            new Game("CLOCK", "Clock & Calendar", "aptitude", true),
            new Game("FAMILY", "Family Tree", "aptitude", true),
            new Game("SEATING", "Seating Arrangement", "aptitude", true),
            new Game("ANALOGY", "Analogies", "aptitude", true)
    );

    public static final List<String> TYPES = GAMES.stream().map(Game::type).toList();

    private GameCatalog() {
    }
}
