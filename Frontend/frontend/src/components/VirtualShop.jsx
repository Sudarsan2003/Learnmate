import { ShoppingCart } from "lucide-react";
import LevelShell, { randInt, shuffle, PlayHeader, RoundDots, TimerBar, VerdictSlot } from "./ArcadeShared";
import { ChoiceGrid, useQuizRound, makeTrickyChoices, secondsFor } from "./ArcadeChoices";

/**
 * Virtual Shop — money. There is no top level; it keeps getting harder.
 *
 * What grows with the level:
 *  - price size: ₹1 steps, then 5, 10, 20, 50, 100, 200, 500 (a new step every 5 levels)
 *  - basket size: 2 items, +1 every 6 levels (up to 6)
 *  - quantities: buy more of the same item
 *  - the countdown gets shorter (from level 3, never below 12 seconds)
 *  - wrong answers sit closer to the right one
 *
 * Question types unlock by level:
 *  1 total    2 change    4 several of one item    8 sale price (% off)
 *  10 "how many can I buy?"    14 quantity + another item, then change
 */

const ITEMS = [
  { emoji: "\uD83C\uDF4E", name: "Apple" },
  { emoji: "\uD83C\uDF4C", name: "Banana" },
  { emoji: "\uD83E\uDD5B", name: "Milk" },
  { emoji: "\uD83C\uDF5E", name: "Bread" },
  { emoji: "\u270F\uFE0F", name: "Pencil" },
  { emoji: "\uD83D\uDCD2", name: "Notebook" },
  { emoji: "\uD83C\uDF6B", name: "Chocolate" },
  { emoji: "\uD83E\uDDC3", name: "Juice" },
  { emoji: "\uD83C\uDF88", name: "Balloon" },
  { emoji: "\uD83C\uDF6A", name: "Biscuits" },
  { emoji: "\uD83D\uDD8D\uFE0F", name: "Crayons" },
  { emoji: "\uD83C\uDF66", name: "Ice cream" },
];
const UNITS = [1, 5, 10, 20, 50, 100, 200, 500];
const NOTES = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
const PERCENTS = [10, 20, 25, 50];

const rupee = (n) => `\u20B9${Number(n).toLocaleString("en-IN")}`;
const pick = (list) => list[randInt(0, list.length - 1)];
const noteAbove = (total) => NOTES.find((n) => n > total) ?? Math.ceil((total + 1) / 100000) * 100000;
const sumLines = (lines) => lines.reduce((s, l) => s + l.price * l.qty, 0);

function build(kind, level) {
  const tier = level < 5 ? 0 : 1 + Math.floor((level - 5) / 5);
  const unit = UNITS[Math.min(UNITS.length - 1, tier)];
  const maxP = Math.min(20, 5 + level * 2);
  const price = () => unit * randInt(1, maxP);
  const nLines = 2 + Math.min(4, Math.floor(level / 6));
  const items = shuffle(ITEMS);
  const basket = (n) => items.slice(0, n).map((it) => ({ ...it, price: price(), qty: 1 }));

  let lines;
  let prompt = "How much do you pay in total?";
  let answer;
  let money = true;
  let pay = null;

  if (kind === "qty") {
    lines = [{ ...items[0], price: price(), qty: randInt(2, 5 + Math.floor(level / 3)) }];
    answer = sumLines(lines);
  } else if (kind === "mixed") {
    lines = [
      { ...items[0], price: price(), qty: randInt(2, 4 + Math.floor(level / 4)) },
      { ...items[1], price: price(), qty: 1 },
    ];
    const total = sumLines(lines);
    pay = noteAbove(total);
    answer = pay - total;
    prompt = `You pay with ${rupee(pay)}. How much change do you get?`;
  } else if (kind === "sale") {
    const pct = pick(PERCENTS);
    const base = 20 * randInt(2, 4 + level);
    lines = [{ ...items[0], price: base, qty: 1, badge: `${pct}% off` }];
    answer = base - (base * pct) / 100;
    prompt = `It is on sale for ${pct}% off. What is the sale price?`;
  } else if (kind === "budget") {
    const p = unit * randInt(2, 9);
    const count = randInt(2, 5 + Math.floor(level / 4));
    const budget = p * count + randInt(0, p - 1);
    lines = [{ ...items[0], price: p, qty: 1 }];
    answer = count;
    money = false;
    prompt = `You have ${rupee(budget)}. How many can you buy?`;
  } else {
    lines = basket(nLines);
    const total = sumLines(lines);
    if (kind === "change") {
      pay = noteAbove(total);
      answer = pay - total;
      prompt = `You pay with ${rupee(pay)}. How much change do you get?`;
    } else {
      answer = total;
    }
  }

  const sig = kind + lines.map((l) => `${l.name}${l.price}x${l.qty}`).join("|") + (pay ?? "") + prompt;
  return {
    key: `${sig}-${Math.random()}`,
    sig,
    kind,
    lines,
    prompt,
    answer,
    money,
    reveal: money ? rupee(answer) : String(answer),
    choices: makeTrickyChoices(answer, level),
  };
}

function makeQuestion(level, seen) {
  const kinds = ["total"];
  if (level >= 2) kinds.push("change");
  if (level >= 4) kinds.push("qty");
  if (level >= 8) kinds.push("sale");
  if (level >= 10) kinds.push("budget");
  if (level >= 14) kinds.push("mixed");
  let q;
  let tries = 0;
  do {
    q = build(pick(kinds), level);
  } while (seen.has(q.sig) && tries++ < 30);
  seen.add(q.sig);
  return q;
}

// 24s at level 3, shrinking to a 12s floor; a bigger basket gets a little longer.
const timeFor = (level, q) => {
  const base = secondsFor(level, 24, 12, 2);
  return base ? base + Math.max(0, q.lines.length - 2) * 2 : 0;
};

function ShopPlay({ level, onFinish, onExit }) {
  const { tally, round, q, picked, verdict, locked, pick: choose, timeLeft, totalTime } = useQuizRound({
    level, makeQuestion, onFinish, timeFor,
  });

  return (
    <div className="ax-play">
      <style>{CSS}</style>
      <PlayHeader level={level} streak={tally.streak} score={tally.score} onExit={onExit} />
      <RoundDots round={round} total={10} />
      {totalTime > 0 && <TimerBar timeLeft={timeLeft} totalTime={totalTime} />}

      <div key={q.key} className="vs-counter">
        <div className="vs-shelf">
          {q.lines.map((l) => (
            <div className="vs-item" key={l.name}>
              <span className="vs-emoji" aria-hidden="true">{l.emoji}</span>
              <span className="vs-name">{l.name}</span>
              <span className="vs-tag">
                {rupee(l.price)}
                {l.qty > 1 ? " each" : ""}
              </span>
              {l.qty > 1 && <span className="vs-qty">{"\u00D7"} {l.qty}</span>}
              {l.badge && <span className="vs-qty vs-sale">{l.badge}</span>}
            </div>
          ))}
        </div>
        <p className="vs-prompt">{q.prompt}</p>
      </div>

      <VerdictSlot ok={verdict?.ok}>{verdict?.text}</VerdictSlot>

      <ChoiceGrid
        choices={q.choices}
        answer={q.answer}
        picked={picked}
        locked={locked}
        onPick={choose}
        render={q.money ? rupee : undefined}
      />
    </div>
  );
}

export default function VirtualShop() {
  return (
    <LevelShell
      gameType="SHOP"
      title="Virtual Shop"
      blurb="Add up the bill and count the change. Clear 70%+ to unlock the next level."
      icon={ShoppingCart}
      color="#4C9A2A"
      hint="The levels never stop. Prices, baskets and quantities grow as you climb, the countdown (from level 3) gets shorter, and new question types appear: change, several of one item, sales, budgets and mixed bills."
      Play={ShopPlay}
    />
  );
}

const CSS = `
.vs-counter {
  display: flex; flex-direction: column; gap: 1rem; padding: 1.2rem 1rem; border-radius: 20px;
  border: 1.5px solid var(--divider); background: var(--surface);
  animation: ax-fade-up 240ms cubic-bezier(.22,1,.36,1) both;
}
.vs-shelf { display: flex; flex-wrap: wrap; justify-content: center; gap: .7rem; }
.vs-item {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: .15rem; min-width: 5.6rem; padding: .7rem .8rem .6rem;
  border-radius: 14px; background: color-mix(in srgb, var(--ax) 9%, var(--bg)); border: 1.5px solid color-mix(in srgb, var(--ax) 30%, var(--divider));
}
.vs-emoji { font-size: 2rem; line-height: 1.1; }
.vs-name { font-size: 12.5px; font-weight: 600; color: var(--muted); }
.vs-tag { margin-top: .15rem; padding: .1rem .55rem; border-radius: 999px; font-family: 'Sora', system-ui, sans-serif; font-size: 13.5px; font-weight: 700; color: #FFFFFF; background: var(--ax); }
.vs-qty { position: absolute; top: -.5rem; right: -.4rem; padding: .05rem .45rem; border-radius: 999px; font-size: 12px; font-weight: 800; color: var(--text); background: var(--surface); border: 1.5px solid var(--ax); }
.vs-sale { color: #FFFFFF; background: #E2725B; border-color: #E2725B; }
.vs-prompt { margin: 0; text-align: center; font-family: 'Sora', system-ui, sans-serif; font-size: 1.15rem; font-weight: 700; color: var(--text); }
`;