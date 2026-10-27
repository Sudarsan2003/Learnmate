import { KeyRound, Shapes, Compass, Clock, Network, Armchair, ArrowLeftRight } from "lucide-react";
import {
  CodeCracker, OddOneOut, DirectionSense, ClockCalendar, FamilyTree, SeatingArrangement, Analogies,
} from "./AptitudeGames";

// The Aptitude tab's games, in the shape Arcade's list expects.
export const APTITUDE_GAMES = [
  { id: "code", gameType: "CODE", title: "Code Cracker", skill: "Coding & decoding", blurb: "Crack the secret letter code.", icon: KeyRound, color: "#2F7DD3", Component: CodeCracker },
  { id: "oddone", gameType: "ODDONE", title: "Odd One Out", skill: "Classification", blurb: "Spot the one that doesn't belong.", icon: Shapes, color: "#C2558B", Component: OddOneOut },
  { id: "direction", gameType: "DIRECTION", title: "Direction Sense", skill: "Spatial reasoning", blurb: "Follow the turns and find the way.", icon: Compass, color: "#2E9A6B", Component: DirectionSense },
  { id: "clock", gameType: "CLOCK", title: "Clock & Calendar", skill: "Time reasoning", blurb: "Times, days and clock angles.", icon: Clock, color: "#C47A1E", Component: ClockCalendar },
  { id: "family", gameType: "FAMILY", title: "Family Tree", skill: "Blood relations", blurb: "Name the relation from family clues.", icon: Network, color: "#7A5AC8", Component: FamilyTree },
  { id: "seating", gameType: "SEATING", title: "Seating Arrangement", skill: "Logical deduction", blurb: "Work out who sits where.", icon: Armchair, color: "#3B8C9E", Component: SeatingArrangement },
  { id: "analogy", gameType: "ANALOGY", title: "Analogies", skill: "Verbal reasoning", blurb: "A is to B as C is to ?", icon: ArrowLeftRight, color: "#B5603A", Component: Analogies },
];

/** gameType -> aptitude game id, so Progress can deep-link into a game. */
export const APTITUDE_ID_BY_TYPE = Object.fromEntries(APTITUDE_GAMES.map((g) => [g.gameType, g.id]));

