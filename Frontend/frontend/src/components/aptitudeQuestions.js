import { randInt, shuffle } from "./ArcadeShared";
import { makeTrickyChoices } from "./ArcadeChoices";

/**
 * Question generators for the Aptitude games (see AptitudeGames.jsx). Pure
 * functions with no React, so they can be stress-tested on their own.
 * Each takes (level, seenSet) and returns
 *   { title, lines, ask, answer, choices, reveal?, key }.
 */

/** The answer plus up to three distinct wrong options from `wrong`, shuffled. */
function withChoices(answer, wrong) {
  const set = new Set([answer]);
  for (const w of shuffle(wrong)) {
    if (set.size >= 4) break;
    if (w !== answer && w !== "" && w != null) set.add(w);
  }
  return shuffle([...set]);
}

const pickOne = (list) => list[randInt(0, list.length - 1)];

/** Retries a generator until it yields a question not seen this level (or gives up). */
function fresh(seen, make) {
  let q;
  let tries = 0;
  do {
    q = make();
  } while (seen.has(q.lines.join("|") + q.ask) && tries++ < 30);
  seen.add(q.lines.join("|") + q.ask);
  return { ...q, key: `${q.lines.join("|")}-${Math.random()}` };
}

/* ------------------------------------------------------------------ */
/* Code Cracker                                                        */
/* ------------------------------------------------------------------ */

const WORDS = [
  "CAT", "DOG", "SUN", "PEN", "INK", "MAP", "BUS", "CUP", "HAT", "BOX", "TOY", "KEY",
  "BOOK", "FISH", "BIRD", "TREE", "MILK", "LAMP", "DESK", "SHIP", "FROG", "KITE", "RAIN", "STAR",
  "PLANT", "CHAIR", "WATER", "LIGHT", "TRAIN", "SMILE", "CLOUD", "BRAIN", "TIGER", "MANGO",
];
const A = "A".charCodeAt(0);
const shiftCh = (c, k) => String.fromCharCode(A + ((((c.charCodeAt(0) - A + k) % 26) + 26) % 26));
const shift = (w, k) => [...w].map((c) => shiftCh(c, k)).join("");
const alt = (w, k) => [...w].map((c, i) => shiftCh(c, i % 2 ? -k : k)).join("");
const mirror = (w) => [...w].map((c) => String.fromCharCode(A + 25 - (c.charCodeAt(0) - A))).join("");
const reverse = (w) => [...w].reverse().join("");
const positions = (w) => [...w].map((c) => c.charCodeAt(0) - A + 1).join("-");

// Each rule: which level it joins at, how to encode a word, and plausible wrong
// rules a student might apply instead (the distractors).
const CODE_RULES = [
  { min: 1, make: () => {
    const k = 1;
    return { enc: (w) => shift(w, k), wrong: (w) => [shift(w, -k), shift(w, k + 1), shift(w, k).slice(0, -1) + w.slice(-1)] };
  } },
  { min: 3, make: () => {
    const k = randInt(2, 3) * (Math.random() < 0.5 ? -1 : 1);
    return { enc: (w) => shift(w, k), wrong: (w) => [shift(w, -k), shift(w, k + 1), shift(w, k - 1)] };
  } },
  { min: 6, make: () => ({ enc: (w) => positions(w), wrong: (w) => [
    [...w].map((c) => c.charCodeAt(0) - A).join("-"),
    [...w].map((c) => c.charCodeAt(0) - A + 2).join("-"),
    reverse(w).split("").map((c) => c.charCodeAt(0) - A + 1).join("-"),
  ] }) },
  { min: 8, make: () => {
    const k = randInt(1, 2);
    return { enc: (w) => shift(reverse(w), k), wrong: (w) => [shift(w, k), reverse(w), shift(reverse(w), -k)] };
  } },
  { min: 11, make: () => {
    const k = randInt(1, 2);
    return { enc: (w) => alt(w, k), wrong: (w) => [shift(w, k), alt(w, -k), shift(w, -k)] };
  } },
  { min: 14, make: () => ({ enc: mirror, wrong: (w) => [reverse(mirror(w)), shift(mirror(w), 1), shift(w, 13)] }) },
];

function codeQuestion(level, seen) {
  return fresh(seen, () => {
    const rule = pickOne(CODE_RULES.filter((r) => r.min <= level)).make();
    const pool = WORDS.filter((w) => w.length <= (level < 5 ? 3 : level < 10 ? 4 : 5));
    const [shown, target] = shuffle(pool).slice(0, 2);
    const answer = rule.enc(target);
    return {
      title: "Code Cracker",
      lines: [`${shown} → ${rule.enc(shown)}`, `${target} → ?`],
      ask: "Use the same code. What does the second word become?",
      answer,
      choices: withChoices(answer, rule.wrong(target)),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Odd One Out                                                         */
/* ------------------------------------------------------------------ */

// Categories that don't overlap, so exactly one item is ever "odd".
const GROUPS = {
  fruits: ["Apple", "Mango", "Banana", "Grapes", "Orange", "Guava", "Papaya"],
  vegetables: ["Carrot", "Potato", "Onion", "Spinach", "Cabbage", "Radish", "Brinjal"],
  colours: ["Red", "Blue", "Green", "Yellow", "Purple", "Pink"],
  vehicles: ["Car", "Bus", "Truck", "Scooter", "Train", "Bicycle"],
  shapes: ["Circle", "Square", "Triangle", "Rectangle", "Hexagon"],
  instruments: ["Guitar", "Flute", "Violin", "Drum", "Sitar", "Tabla"],
  furniture: ["Chair", "Table", "Sofa", "Bed", "Cupboard"],
  bodyParts: ["Hand", "Knee", "Elbow", "Ankle", "Shoulder"],
  waterAnimals: ["Fish", "Shark", "Octopus", "Crab", "Jellyfish"],
  landAnimals: ["Lion", "Horse", "Camel", "Elephant", "Tiger", "Goat"],
};
const GROUP_LABEL = {
  fruits: "fruits", vegetables: "vegetables", colours: "colours", vehicles: "vehicles", shapes: "shapes",
  instruments: "musical instruments", furniture: "furniture", bodyParts: "body parts",
  waterAnimals: "animals that live in water", landAnimals: "animals that live on land",
};
// Level 9+ pairs categories that are easy to confuse.
const CLOSE_PAIRS = [["fruits", "vegetables"], ["waterAnimals", "landAnimals"], ["furniture", "instruments"]];

const isPrime = (n) => {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
};

// Number sets: rule text, a way to draw 3 members, and one non-member.
const NUMBER_SETS = [
  { min: 4, rule: "even", make: () => [() => randInt(5, 49) * 2, () => randInt(5, 49) * 2 + 1] },
  { min: 5, rule: "multiples of {k}", make: (k) => [() => randInt(2, 12) * k, () => randInt(2, 12) * k + randInt(1, k - 1)] },
  { min: 8, rule: "prime", make: () => [
    () => pickOne([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71]),
    () => pickOne([9, 15, 21, 27, 33, 39, 49, 51, 57, 63, 69, 77, 87, 91]),
  ] },
  { min: 10, rule: "perfect squares", make: () => [() => randInt(2, 15) ** 2, () => randInt(2, 15) ** 2 + pickOne([1, 2, -1, 3])] },
  { min: 13, rule: "numbers whose digits add up to 9", make: () => [
    () => pickOne([18, 27, 36, 45, 54, 63, 72, 81, 108, 117, 126, 135, 144, 153, 207, 216, 225, 306, 315, 405]),
    () => pickOne([19, 28, 37, 46, 55, 64, 73, 82, 118, 127, 136, 145, 208, 217, 307]),
  ] },
];

function wordOddOne(level) {
  const [main, odd] = level >= 9 && Math.random() < 0.5
    ? shuffle(pickOne(CLOSE_PAIRS))
    : shuffle(Object.keys(GROUPS)).slice(0, 2);
  const members = shuffle(GROUPS[main]).slice(0, 3);
  const answer = pickOne(GROUPS[odd]);
  return {
    lines: [shuffle([...members, answer]).join("   ")],
    answer,
    reveal: `${answer} — the others are ${GROUP_LABEL[main]}`,
    choices: shuffle([...members, answer]),
  };
}

function numberOddOne(level) {
  const set = pickOne(NUMBER_SETS.filter((s) => s.min <= level));
  const k = randInt(3, 9);
  const [member, outsider] = set.make(k);
  const members = new Set();
  let guard = 0;
  while (members.size < 3 && guard++ < 50) {
    const m = member();
    if (set.rule !== "prime" || isPrime(m)) members.add(m);
  }
  let answer = outsider();
  guard = 0;
  // An outsider that happens to fit the rule would make two right answers.
  while ((members.has(answer) || (set.rule === "prime" && isPrime(answer)) || (set.rule === "perfect squares" && Number.isInteger(Math.sqrt(answer)))) && guard++ < 50) {
    answer = outsider();
  }
  const items = shuffle([...members, answer]).map(String);
  return {
    lines: [items.join("   ")],
    answer: String(answer),
    reveal: `${answer} — the others are ${set.rule.replace("{k}", k)}`,
    choices: items,
  };
}

function oddQuestion(level, seen) {
  return fresh(seen, () => {
    const q = level >= 4 && Math.random() < 0.5 ? numberOddOne(level) : wordOddOne(level);
    return { ...q, title: "Odd One Out", ask: "Which one doesn't belong with the others?" };
  });
}

/* ------------------------------------------------------------------ */
/* Direction Sense                                                     */
/* ------------------------------------------------------------------ */

const COMPASS = ["North", "North-East", "East", "South-East", "South", "South-West", "West", "North-West"];
const NAMES = ["Riya", "Arjun", "Meera", "Kabir", "Anaya", "Rohan", "Isha", "Dev"];
// Unit steps for the four main directions, indexed like COMPASS (0, 2, 4, 6).
const STEP = { 0: [0, 1], 2: [1, 0], 4: [0, -1], 6: [-1, 0] };
const TRIPLES = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17], [12, 16, 20]];

function bearingOf(x, y) {
  if (x === 0 && y === 0) return null;
  const angle = (Math.atan2(x, y) * 180) / Math.PI; // 0 = North, clockwise
  return COMPASS[(Math.round(((angle + 360) % 360) / 45)) % 8];
}

/** A walk of `legs` straight lines, turning left or right between them. */
function walk(legs, lengths) {
  let facing = pickOne([0, 2, 4, 6]);
  const startFacing = facing;
  let x = 0;
  let y = 0;
  const parts = [];
  for (let i = 0; i < legs; i++) {
    if (i > 0) {
      const right = Math.random() < 0.5;
      facing = (facing + (right ? 2 : 6)) % 8;
      parts.push(`turns ${right ? "right" : "left"}`);
    }
    const d = lengths[i];
    x += STEP[facing][0] * d;
    y += STEP[facing][1] * d;
    parts.push(i === 0 ? `walks ${d} km ${COMPASS[startFacing]}` : `walks ${d} km`);
  }
  return { text: parts.join(", "), facing, x, y };
}

function directionQuestion(level, seen) {
  return fresh(seen, () => {
    const name = pickOne(NAMES);
    const kinds = ["facing"];
    if (level >= 3) kinds.push("where");
    if (level >= 6) kinds.push("distance");
    const kind = pickOne(kinds);
    const legs = kind === "distance" ? 2 : Math.min(2 + Math.floor(level / 4), 5);

    if (kind === "distance") {
      const [a, b, c] = pickOne(TRIPLES.slice(0, 2 + Math.floor(level / 4)));
      const w = walk(2, shuffle([a, b]));
      return {
        title: "Direction Sense",
        lines: [`${name} ${w.text}.`],
        ask: "How far is that from the start, in a straight line (km)?",
        answer: c,
        reveal: `${c} km`,
        // a + b is the classic slip: adding the legs instead of using the diagonal.
        choices: withChoices(c, [a + b, Math.abs(a - b) || c + 2, c + 1, c - 1, Math.max(a, b)]),
      };
    }

    // "Where" needs an end point exactly on one of the 8 compass lines; anything
    // in between (say, slightly east of north) has no fair single answer.
    const onCompassLine = (p) => (p.x !== 0 || p.y !== 0) && (p.x === 0 || p.y === 0 || Math.abs(p.x) === Math.abs(p.y));
    let w;
    let guard = 0;
    do {
      w = walk(legs, Array.from({ length: legs }, () => randInt(1, 3 + Math.min(level, 12))));
    } while (kind === "where" && !onCompassLine(w) && guard++ < 400);
    const where = kind === "where" && onCompassLine(w);

    const answer = where ? bearingOf(w.x, w.y) : COMPASS[w.facing];
    const idx = COMPASS.indexOf(answer);
    // Opposite and neighbouring directions make the trickiest wrong answers.
    const wrong = [COMPASS[(idx + 4) % 8], COMPASS[(idx + 2) % 8], COMPASS[(idx + 6) % 8], COMPASS[(idx + 1) % 8], COMPASS[(idx + 7) % 8]];
    return {
      title: "Direction Sense",
      lines: [`${name} ${w.text}.`],
      ask: where ? `In which direction is ${name} from the starting point?` : `Which way is ${name} facing now?`,
      answer,
      choices: withChoices(answer, where ? wrong : wrong.filter((d) => COMPASS.indexOf(d) % 2 === 0)),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Clock & Calendar                                                    */
/* ------------------------------------------------------------------ */

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const fmt = (mins) => {
  const m = ((mins % 720) + 720) % 720;
  const h = Math.floor(m / 60);
  return `${h === 0 ? 12 : h}:${String(m % 60).padStart(2, "0")}`;
};

function clockQuestion(level, seen) {
  return fresh(seen, () => {
    const kinds = ["hours"];
    if (level >= 3) kinds.push("minutes");
    if (level >= 5) kinds.push("days");
    if (level >= 7) kinds.push("angleHour");
    if (level >= 10) kinds.push("angle");
    if (level >= 12) kinds.push("date");
    const kind = pickOne(kinds);

    if (kind === "hours" || kind === "minutes") {
      const start = randInt(1, 12) * 60 + (kind === "minutes" ? pickOne([0, 15, 30, 45]) : 0);
      const add = kind === "hours" ? randInt(2, 9) * 60 : randInt(1, 3 + Math.floor(level / 3)) * 15 + pickOne([0, 5, 10]);
      const answer = fmt(start + add);
      const later = add >= 60 ? `${Math.floor(add / 60)} h ${add % 60 ? `${add % 60} min` : ""}` : `${add} min`;
      return {
        title: "Clock",
        lines: [`It is ${fmt(start)}.`],
        ask: `What time will it be ${later.trim()} later?`,
        answer,
        choices: withChoices(answer, [fmt(start + add + 60), fmt(start + add - 60), fmt(start + add + 15), fmt(start + add - 15), fmt(start + add + 10)]),
      };
    }

    if (kind === "days") {
      const today = randInt(0, 6);
      const n = randInt(2, 10 + level * 2);
      const answer = DAYS[(today + n) % 7];
      return {
        title: "Calendar",
        lines: [`Today is ${DAYS[today]}.`],
        ask: `What day will it be ${n} days from today?`,
        answer,
        // Off-by-one is the classic slip (counting today as day one).
        choices: withChoices(answer, [DAYS[(today + n + 1) % 7], DAYS[(today + n + 6) % 7], DAYS[(today + n + 2) % 7], DAYS[today]]),
      };
    }

    if (kind === "date") {
      const first = randInt(0, 6);
      const date = randInt(8, 30);
      const answer = DAYS[(first + date - 1) % 7];
      return {
        title: "Calendar",
        lines: [`1st of the month is a ${DAYS[first]}.`],
        ask: `Which day is the ${date}${date === 21 ? "st" : date === 22 ? "nd" : date === 23 ? "rd" : "th"}?`,
        answer,
        choices: withChoices(answer, [DAYS[(first + date) % 7], DAYS[(first + date - 2) % 7], DAYS[(first + date + 1) % 7]]),
      };
    }

    // Angle between the hands: |30h - 5.5m|, folded to the smaller side.
    const h = randInt(1, 12);
    const m = kind === "angleHour" ? 0 : pickOne([10, 20, 30, 40, 50, 15 * 2]);
    const raw = Math.abs(30 * (h % 12) - 5.5 * m);
    const answer = Math.min(raw, 360 - raw);
    return {
      title: "Clock angle",
      lines: [`${h}:${String(m).padStart(2, "0")}`],
      ask: "What is the smaller angle between the hour and minute hands (degrees)?",
      answer,
      reveal: `${answer}°`,
      // Forgetting the hour hand also moves is the usual mistake.
      choices: m === 0
        ? withChoices(answer, [360 - answer, answer + 30, answer - 30, answer + 60, answer - 60, answer - 90].filter((v) => v >= 0 && v <= 180))
        : withChoices(answer, [Math.min(Math.abs(30 * (h % 12) - 6 * m), 360 - Math.abs(30 * (h % 12) - 6 * m)), ...makeTrickyChoices(answer, level).filter((v) => v > 0 && v <= 180)]),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Family Tree (blood relations)                                       */
/* ------------------------------------------------------------------ */

const MALE_NAMES = ["Ravi", "Arjun", "Suresh", "Vikram", "Rahul", "Mohan", "Anil", "Karthik", "Ramesh", "Imran", "Joseph", "Gopal"];
const FEMALE_NAMES = ["Sita", "Priya", "Lakshmi", "Kavya", "Meena", "Anjali", "Divya", "Radha", "Fatima", "Mary", "Geeta", "Usha"];

// Gendered words for each relation: [male, female].
const TERMS = {
  parent: ["father", "mother"], child: ["son", "daughter"], sibling: ["brother", "sister"], spouse: ["husband", "wife"],
  grandparent: ["grandfather", "grandmother"], grandchild: ["grandson", "granddaughter"],
  uncle: ["uncle", "aunt"], nephew: ["nephew", "niece"], cousin: ["cousin", "cousin"],
  parentInLaw: ["father-in-law", "mother-in-law"], childInLaw: ["son-in-law", "daughter-in-law"],
  siblingInLaw: ["brother-in-law", "sister-in-law"],
};
const termFor = (kind, person) => TERMS[kind][person.male ? 0 : 1];

/**
 * A three-generation family with no remarriages or half-siblings, so the
 * usual exam conventions hold (a father's wife is the mother, and so on):
 * grandparents, their 2-3 married children, and 1-2 grandchildren each.
 */
function buildFamily() {
  const men = shuffle(MALE_NAMES);
  const women = shuffle(FEMALE_NAMES);
  const people = [];
  const add = (male) => {
    const p = { name: male ? men.pop() : women.pop(), male, parents: [], spouse: null };
    people.push(p);
    return p;
  };
  const marry = (a, b) => {
    a.spouse = b;
    b.spouse = a;
  };
  const gf = add(true);
  const gm = add(false);
  marry(gf, gm);
  for (let i = 0, n = randInt(2, 3); i < n; i++) {
    const male = Math.random() < 0.5;
    const kid = add(male);
    kid.parents = [gf, gm];
    const partner = add(!male);
    marry(kid, partner);
    for (let j = 0, m = randInt(1, 2); j < m; j++) {
      const grandkid = add(Math.random() < 0.5);
      grandkid.parents = [kid, partner];
    }
  }
  return people;
}

const isParent = (x, y) => y.parents.includes(x);
const isSibling = (x, y) => x !== y && x.parents.length > 0 && x.parents[0] === y.parents[0];

/** How x is related to y (genderless kind), or null for relations not used here. */
function kinship(x, y) {
  if (x === y) return null;
  if (isParent(x, y)) return "parent";
  if (isParent(y, x)) return "child";
  if (isSibling(x, y)) return "sibling";
  if (x.spouse === y) return "spouse";
  if (y.parents.some((p) => isParent(x, p))) return "grandparent";
  if (x.parents.some((p) => isParent(y, p))) return "grandchild";
  if (y.parents.some((p) => isSibling(x, p) || (x.spouse && isSibling(x.spouse, p)))) return "uncle";
  if (x.parents.some((p) => isSibling(p, y) || (y.spouse && isSibling(p, y.spouse)))) return "nephew";
  if (x.parents.some((px) => y.parents.some((py) => isSibling(px, py)))) return "cousin";
  if (y.spouse && isParent(x, y.spouse)) return "parentInLaw";
  if (x.spouse && isParent(y, x.spouse)) return "childInLaw";
  if ((y.spouse && isSibling(x, y.spouse)) || (x.spouse && isSibling(x.spouse, y))) return "siblingInLaw";
  return null;
}

const DIRECT = ["parent", "child", "sibling", "spouse"];

function familyQuestion(level, seen) {
  return fresh(seen, () => {
    const steps = level >= 8 && Math.random() < 0.5 ? 3 : 2;
    for (let attempt = 0; attempt < 200; attempt++) {
      const people = buildFamily();
      const path = [pickOne(people)];
      while (path.length <= steps) {
        const here = path[path.length - 1];
        const next = shuffle(people).find((p) => !path.includes(p) && DIRECT.includes(kinship(here, p))
          && (level >= 4 || kinship(here, p) !== "spouse"));
        if (!next) break;
        path.push(next);
      }
      if (path.length !== steps + 1) continue;
      const [x, y] = [path[0], path[path.length - 1]];
      const kind = kinship(x, y);
      // Husband/wife answers rest on "two parents of one child are married",
      // which students are rarely taught to assume, so leave them out.
      if (!kind || kind === "spouse" || (level < 5 && /InLaw/.test(kind))) continue;

      const statements = path.slice(0, -1).map((p, i) => `${p.name} is the ${termFor(kinship(p, path[i + 1]), p)} of ${path[i + 1].name}.`);
      const answer = termFor(kind, x);
      const sameGender = Object.values(TERMS).map((t) => t[x.male ? 0 : 1]);
      const opposite = TERMS[kind][x.male ? 1 : 0];
      return {
        title: "Family Tree",
        lines: statements,
        compact: true,
        ask: `How is ${x.name} related to ${y.name}?`,
        answer: cap(answer),
        reveal: `${x.name} is ${y.name}'s ${answer}`,
        choices: withChoices(cap(answer), [opposite, ...sameGender].filter((t) => t !== answer).map(cap)),
      };
    }
    throw new Error("could not build a family question");
  });
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ------------------------------------------------------------------ */
/* Seating Arrangement                                                 */
/* ------------------------------------------------------------------ */

const SEAT_NAMES = ["Asha", "Bala", "Chitra", "Dinesh", "Esha", "Farid", "Gauri", "Hari"];
const NUMBER_WORD = { 3: "Three", 4: "Four", 5: "Five" };

const listNames = (names) => `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

function permutations(list) {
  if (list.length <= 1) return [list];
  return list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [x, ...rest]));
}

/** Every true clue about this seating, each with a test any seating can be checked against. */
function seatingClues(seats) {
  const n = seats.length;
  const at = (arr, name) => arr.indexOf(name);
  const clues = [];
  for (const x of seats) {
    const i = at(seats, x);
    if (i === 0) clues.push({ key: `end:L:${x}`, text: `${x} sits at the left end.`, test: (a) => at(a, x) === 0 });
    if (i === n - 1) clues.push({ key: `end:R:${x}`, text: `${x} sits at the right end.`, test: (a) => at(a, x) === n - 1 });
    if (i > 0 && i < n - 1) clues.push({ key: `notEnd:${x}`, text: `${x} does not sit at either end.`, test: (a) => at(a, x) > 0 && at(a, x) < n - 1 });
    if (n >= 4 && i === 1) clues.push({ key: `nth:L:${x}`, text: `${x} sits second from the left.`, test: (a) => at(a, x) === 1 });
    if (n >= 4 && i === n - 2) clues.push({ key: `nth:R:${x}`, text: `${x} sits second from the right.`, test: (a) => at(a, x) === n - 2 });
    for (const y of seats) {
      if (x === y) continue;
      const j = at(seats, y);
      if (j === i + 1) clues.push({ key: `adj:${x}:${y}`, text: `${x} sits immediately to the left of ${y}.`, test: (a) => at(a, y) - at(a, x) === 1 });
      if (x < y && Math.abs(i - j) === 1) clues.push({ key: `next:${x}:${y}`, text: `${x} sits next to ${y}.`, test: (a) => Math.abs(at(a, x) - at(a, y)) === 1 });
      if (x < y && Math.abs(i - j) === 2) clues.push({ key: `gap:${x}:${y}`, text: `Exactly one person sits between ${x} and ${y}.`, test: (a) => Math.abs(at(a, x) - at(a, y)) === 2 });
      if (j > i + 1) clues.push({ key: `before:${x}:${y}`, text: `${x} sits somewhere to the left of ${y}, but not next to them.`, test: (a) => at(a, y) - at(a, x) > 1 });
    }
  }
  return clues;
}

function seatingQuestion(level, seen) {
  return fresh(seen, () => {
    const n = level < 4 ? 3 : level < 9 ? 4 : 5;
    for (let attempt = 0; attempt < 100; attempt++) {
      const seats = shuffle(SEAT_NAMES).slice(0, n);
      const all = permutations(seats);
      // Easier levels lean on direct "end" clues; later ones use relative positions.
      const pool = shuffle(seatingClues(seats)).sort((a, b) => (level < 6 ? Number(!a.key.startsWith("end")) - Number(!b.key.startsWith("end")) : 0));
      const used = [];
      let left = all;
      for (const clue of pool) {
        if (left.length === 1) break;
        const narrowed = left.filter(clue.test);
        if (narrowed.length < left.length) {
          used.push(clue);
          left = narrowed;
        }
      }
      if (left.length !== 1 || used.length > n + 1) continue;

      const usedKeys = new Set(used.map((c) => c.key));
      const asks = [];
      asks.push({ key: `end:L:${seats[0]}`, ask: "Who sits at the left end?", answer: seats[0] });
      asks.push({ key: `end:R:${seats[n - 1]}`, ask: "Who sits at the right end?", answer: seats[n - 1] });
      // With three seats, "does not sit at either end" already names the middle one.
      const mid = seats[(n - 1) / 2];
      if (n % 2 === 1) asks.push({ key: n === 3 ? `notEnd:${mid}` : "mid", ask: "Who sits in the middle?", answer: mid });
      for (let i = 0; i < n - 1; i++) {
        asks.push({ key: `adj:${seats[i]}:${seats[i + 1]}`, ask: `Who sits immediately to the right of ${seats[i]}?`, answer: seats[i + 1] });
      }
      for (let i = 0; i < n - 2; i++) {
        asks.push({ key: `between:${seats[i]}`, ask: `Who sits between ${seats[i]} and ${seats[i + 2]}?`, answer: seats[i + 1] });
      }
      // Don't ask something a clue already states outright.
      const options = asks.filter((a) => !usedKeys.has(a.key));
      if (options.length === 0) continue;
      const q = pickOne(options);
      return {
        title: "Seating Arrangement",
        lines: [
          `${NUMBER_WORD[n]} friends, ${listNames(shuffle(seats))}, sit in a row facing you. Left and right are your left and right.`,
          ...shuffle(used).map((c) => c.text),
        ],
        compact: true,
        ask: q.ask,
        answer: q.answer,
        reveal: `${q.answer} (the order is ${seats.join(", ")})`,
        choices: withChoices(q.answer, seats),
      };
    }
    throw new Error("could not build a seating question");
  });
}

/* ------------------------------------------------------------------ */
/* Analogies                                                           */
/* ------------------------------------------------------------------ */

// Each set pairs things one-to-one, so only one second item fits a given first.
const ANALOGY_SETS = [
  { min: 1, about: "is the opposite of", pairs: [["Hot", "Cold"], ["Tall", "Short"], ["Day", "Night"], ["Happy", "Sad"], ["Fast", "Slow"], ["Big", "Small"], ["Up", "Down"], ["Full", "Empty"], ["Early", "Late"], ["Hard", "Soft"]] },
  { min: 1, about: "is the young one of a", flip: true, pairs: [["Cow", "Calf"], ["Dog", "Puppy"], ["Cat", "Kitten"], ["Hen", "Chick"], ["Sheep", "Lamb"], ["Horse", "Foal"], ["Frog", "Tadpole"], ["Lion", "Cub"], ["Duck", "Duckling"]] },
  { min: 3, about: "is the home of a", flip: true, pairs: [["Bee", "Hive"], ["Bird", "Nest"], ["Lion", "Den"], ["Horse", "Stable"], ["Dog", "Kennel"], ["Spider", "Web"], ["Pig", "Sty"], ["Rabbit", "Burrow"]] },
  { min: 4, about: "is used by a", flip: true, pairs: [["Carpenter", "Saw"], ["Painter", "Brush"], ["Doctor", "Stethoscope"], ["Farmer", "Plough"], ["Tailor", "Needle"], ["Writer", "Pen"], ["Photographer", "Camera"], ["Astronomer", "Telescope"]] },
  { min: 6, about: "is the capital of", flip: true, proper: true, pairs: [["India", "New Delhi"], ["Japan", "Tokyo"], ["France", "Paris"], ["Egypt", "Cairo"], ["Russia", "Moscow"], ["Italy", "Rome"], ["China", "Beijing"], ["Kenya", "Nairobi"], ["Nepal", "Kathmandu"], ["Australia", "Canberra"], ["Germany", "Berlin"], ["Bangladesh", "Dhaka"]] },
  { min: 8, about: "is the unit of", flip: true, pairs: [["Length", "Metre"], ["Mass", "Kilogram"], ["Time", "Second"], ["Electric current", "Ampere"], ["Force", "Newton"], ["Energy", "Joule"]] },
];

// Number rules; a question is only used when exactly one rule explains the example pair.
const NUMBER_RULES = [
  { min: 5, name: "squared", f: (n) => n * n },
  { min: 5, name: "doubled, plus 1", f: (n) => 2 * n + 1 },
  { min: 5, name: "times 3", f: (n) => 3 * n },
  { min: 9, name: "cubed", f: (n) => n ** 3 },
  { min: 9, name: "squared, plus 1", f: (n) => n * n + 1 },
];

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const letterAt = (i) => ALPHA[((i % 26) + 26) % 26];

function wordAnalogy(level) {
  const set = pickOne(ANALOGY_SETS.filter((s) => s.min <= level));
  const [[a, b], [c, d]] = shuffle(set.pairs).slice(0, 2);
  return {
    lines: [`${a} : ${b}  ::  ${c} : ?`],
    answer: d,
    reveal: set.flip
      ? `${d} — ${d} ${set.about} ${set.proper ? c : c.toLowerCase()}`
      : `${d} — ${c} ${set.about} ${d.toLowerCase()}`,
    choices: withChoices(d, [...set.pairs.map((p) => p[1]), c, b]),
  };
}

function numberAnalogy(level) {
  const rules = NUMBER_RULES.filter((r) => r.min <= level);
  for (let attempt = 0; attempt < 50; attempt++) {
    const rule = pickOne(rules);
    const a = randInt(3, rule.name === "cubed" ? 6 : 12);
    const c = randInt(3, rule.name === "cubed" ? 7 : 15);
    if (a === c) continue;
    const b = rule.f(a);
    if (rules.filter((r) => r.f(a) === b).length !== 1) continue;
    const answer = rule.f(c);
    return {
      lines: [`${a} : ${b}  ::  ${c} : ?`],
      answer,
      reveal: `${answer} — each number is ${rule.name}`,
      choices: withChoices(answer, [...rules.map((r) => r.f(c)), answer + 1, answer - 1, c + (b - a)]),
    };
  }
  return wordAnalogy(level);
}

function letterAnalogy() {
  const k = randInt(1, 4);
  const gap = randInt(1, 3);
  const start1 = randInt(0, 20);
  const start2 = randInt(0, 20);
  const pair = (s) => letterAt(s) + letterAt(s + gap);
  const answer = pair(start2 + k);
  return {
    lines: [`${pair(start1)} : ${pair(start1 + k)}  ::  ${pair(start2)} : ?`],
    answer,
    reveal: `${answer} — each letter moves ${k} forward`,
    choices: withChoices(answer, [pair(start2 + k + 1), pair(start2 + k - 1), letterAt(start2 + k) + letterAt(start2 + k + gap + 1), pair(start2 - k)]),
  };
}

function analogyQuestion(level, seen) {
  return fresh(seen, () => {
    const kinds = [wordAnalogy];
    if (level >= 5) kinds.push(numberAnalogy);
    if (level >= 10) kinds.push(letterAnalogy);
    const q = pickOne(kinds)(level);
    return { ...q, title: "Analogies", ask: "Which one completes the second pair the same way as the first?" };
  });
}

export { codeQuestion, oddQuestion, directionQuestion, clockQuestion, familyQuestion, seatingQuestion, analogyQuestion };
