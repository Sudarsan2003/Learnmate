import { KeyRound, Shapes, Compass, Clock } from "lucide-react";
import { CodeCracker, OddOneOut, DirectionSense, ClockCalendar } from "./AptitudeGames";

// The Aptitude tab's games, in the shape Arcade's list expects.
export const APTITUDE_GAMES = [
  { id: "code", gameType: "CODE", title: "Code Cracker", skill: "Coding & decoding", blurb: "Crack the secret letter code.", icon: KeyRound, color: "#2F7DD3", Component: CodeCracker },
  { id: "oddone", gameType: "ODDONE", title: "Odd One Out", skill: "Classification", blurb: "Spot the one that doesn't belong.", icon: Shapes, color: "#C2558B", Component: OddOneOut },
  { id: "direction", gameType: "DIRECTION", title: "Direction Sense", skill: "Spatial reasoning", blurb: "Follow the turns and find the way.", icon: Compass, color: "#2E9A6B", Component: DirectionSense },
  { id: "clock", gameType: "CLOCK", title: "Clock & Calendar", skill: "Time reasoning", blurb: "Times, days and clock angles.", icon: Clock, color: "#C47A1E", Component: ClockCalendar },
];

/** gameType -> aptitude game id, so Progress can deep-link into a game. */
export const APTITUDE_ID_BY_TYPE = Object.fromEntries(APTITUDE_GAMES.map((g) => [g.gameType, g.id]));

