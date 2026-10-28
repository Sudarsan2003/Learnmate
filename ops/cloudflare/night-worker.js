/**
 * LearnMate "sleeping" page, as a Cloudflare Worker in front of srvlearnmate.in.
 *
 * The EC2 server is switched off at night to save money, and while it's off
 * nothing on it can answer. This Worker runs on Cloudflare (always on, free)
 * and sits in front of every request:
 *
 *   - Night (CLOSE_AT to OPEN_AT, India time): show the sleeping page without
 *     even trying the server.
 *   - Day: pass the request through to the server as usual. If the server
 *     doesn't answer (it's still starting up, or down), show a
 *     "be right back" version of the page instead of a browser error.
 *   - /api/... requests get a short JSON message instead of the page, so the
 *     app shows a sensible error if it's already open.
 *
 * Add ?sleep-preview=night or ?sleep-preview=down to any URL to see the pages
 * during the day.
 */

const OPEN_AT = 6;    // 6 AM India time
const CLOSE_AT = 22;  // 10 PM India time
const IST_OFFSET_MINUTES = 5 * 60 + 30;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const preview = url.searchParams.get("sleep-preview");
    const isApi = url.pathname.startsWith("/api/");

    if (preview === "night" || preview === "down") return closed(preview, isApi);
    if (isNight()) return closed("night", isApi);

    try {
      const response = await fetch(request);
      // 52x and 530 are Cloudflare's "couldn't reach your server" codes.
      if ([502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 530].includes(response.status)) {
        return closed("down", isApi);
      }
      return response;
    } catch {
      return closed("down", isApi);
    }
  },
};

function istNow() {
  const now = new Date();
  return new Date(now.getTime() + (now.getTimezoneOffset() + IST_OFFSET_MINUTES) * 60000);
}

function isNight() {
  const h = istNow().getHours();
  return h >= CLOSE_AT || h < OPEN_AT;
}

/** Seconds until OPEN_AT India time. */
function secondsUntilOpen() {
  const now = istNow();
  const open = new Date(now);
  open.setHours(OPEN_AT, 0, 0, 0);
  if (open <= now) open.setDate(open.getDate() + 1);
  return Math.round((open - now) / 1000);
}

function closed(kind, isApi) {
  const night = kind === "night";
  const headers = { "cache-control": "no-store" };
  if (night) headers["retry-after"] = String(secondsUntilOpen());

  if (isApi) {
    const message = night
      ? "LearnMate is sleeping. Come back after 6 AM!"
      : "LearnMate is taking a quick break. Please try again in a few minutes.";
    return new Response(JSON.stringify({ message }), {
      status: 503,
      headers: { ...headers, "content-type": "application/json; charset=utf-8" },
    });
  }
  return new Response(page(night), {
    status: 503,
    headers: { ...headers, "content-type": "text/html; charset=utf-8" },
  });
}

function page(night) {
  const title = night ? "LearnMate is sleeping" : "LearnMate will be right back";
  const heading = night ? "Shhh&hellip; LearnMate is fast asleep!" : "LearnMate is taking a quick nap!";
  const message = night
    ? "Even super-brains need to recharge. Your quizzes, games and medals are tucked in safe and sound. Get a good night&rsquo;s sleep, and come back after <b>6&nbsp;AM</b> for a brand-new day of learning!"
    : "We&rsquo;re stretching and yawning and will be back in a few minutes. Your quizzes, games and medals are safe!";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    min-height: 100vh; min-height: 100dvh; overflow-x: hidden;
    font-family: "Baloo 2", "Comic Sans MS", "Trebuchet MS", system-ui, sans-serif;
    color: #F4F1FF; text-align: center;
    background: radial-gradient(ellipse at 50% 120%, #3B2B7A 0%, #1B1446 45%, #0A0820 100%);
    display: flex; align-items: center; justify-content: center; padding: 24px 16px;
  }
  .sky { position: fixed; inset: 0; pointer-events: none; overflow: hidden; }
  .star { position: absolute; width: 3px; height: 3px; border-radius: 50%; background: #fff;
          animation: twinkle var(--d) ease-in-out infinite; animation-delay: var(--delay); }
  @keyframes twinkle { 0%, 100% { opacity: .2; transform: scale(.7); } 50% { opacity: 1; transform: scale(1.3); } }
  .shooting { position: absolute; top: 12%; left: -10%; width: 120px; height: 2px;
              background: linear-gradient(90deg, transparent, #fff); border-radius: 2px;
              transform: rotate(-18deg); animation: shoot 7s ease-in 2s infinite; opacity: 0; }
  @keyframes shoot { 0% { opacity: 0; transform: translate(0, 0) rotate(-18deg); }
                     3% { opacity: 1; } 12% { opacity: 0; transform: translate(80vw, -26vh) rotate(-18deg); }
                     100% { opacity: 0; transform: translate(80vw, -26vh) rotate(-18deg); } }
  .moon { position: fixed; top: 6vh; right: 8vw; width: 92px; height: 92px; border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #FFF8D6, #F7D774 70%);
          box-shadow: 0 0 60px 18px rgba(247, 215, 116, .35); }
  .moon::before, .moon::after { content: ""; position: absolute; border-radius: 50%; background: rgba(214, 178, 80, .45); }
  .moon::before { width: 16px; height: 16px; top: 26px; left: 24px; }
  .moon::after { width: 10px; height: 10px; top: 54px; left: 52px; }

  main { position: relative; max-width: 560px; width: 100%; }
  .owl { font-size: 96px; line-height: 1; display: inline-block; position: relative;
         animation: sway 4s ease-in-out infinite; transform-origin: 50% 100%; }
  @keyframes sway { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
  .z { position: absolute; font-weight: 800; color: #B9A8FF; animation: float 3s ease-in infinite; opacity: 0; }
  .z1 { top: 0; right: -18px; font-size: 22px; }
  .z2 { top: -16px; right: -36px; font-size: 30px; animation-delay: 1s; }
  .z3 { top: -36px; right: -56px; font-size: 38px; animation-delay: 2s; }
  @keyframes float { 0% { opacity: 0; transform: translate(0, 10px); } 30% { opacity: 1; }
                     100% { opacity: 0; transform: translate(20px, -40px); } }

  h1 { margin: 18px 0 10px; font-size: clamp(28px, 7vw, 44px); line-height: 1.15; letter-spacing: .5px;
       background: linear-gradient(90deg, #FFE27A, #FF9ECD, #9FD8FF); -webkit-background-clip: text;
       background-clip: text; color: transparent; }
  p.msg { margin: 0 auto; max-width: 460px; font-size: 18px; line-height: 1.6; color: #DCD6FF; }
  .count { margin: 26px auto 0; display: inline-flex; gap: 10px; }
  .count div { min-width: 78px; padding: 12px 8px 8px; border-radius: 18px;
               background: rgba(255, 255, 255, .08); border: 2px solid rgba(255, 255, 255, .15); }
  .count b { display: block; font-size: 34px; line-height: 1; color: #FFE27A; font-variant-numeric: tabular-nums; }
  .count span { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #B9A8FF; }
  .fact { margin: 28px auto 0; max-width: 460px; padding: 16px 18px; border-radius: 20px;
          background: rgba(255, 255, 255, .07); border: 2px dashed rgba(255, 226, 122, .45); }
  .fact h2 { margin: 0 0 6px; font-size: 16px; color: #FFE27A; }
  .fact p { margin: 0; font-size: 16px; line-height: 1.5; color: #F4F1FF; min-height: 3em; }
  button { margin-top: 26px; font: inherit; font-size: 18px; font-weight: 700; color: #1B1446; cursor: pointer;
           padding: 12px 28px; border: 0; border-radius: 999px; background: linear-gradient(90deg, #FFE27A, #FFB86B);
           box-shadow: 0 6px 0 #C9772C; transition: transform .1s; }
  button:active { transform: translateY(4px); box-shadow: 0 2px 0 #C9772C; }
  .brand { margin-top: 28px; font-size: 14px; color: #8F86C9; }
  @media (max-width: 420px) { .moon { width: 64px; height: 64px; } .owl { font-size: 80px; } .count div { min-width: 66px; } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; } .z { opacity: .8; } }
</style>
</head>
<body>
<div class="sky" id="sky"><div class="shooting"></div></div>
<div class="moon" aria-hidden="true"></div>
<main>
  <div class="owl" aria-hidden="true">🦉<span class="z z1">z</span><span class="z z2">z</span><span class="z z3">Z</span></div>
  <h1>${heading}</h1>
  <p class="msg">${message}</p>
  ${night ? `<div class="count" aria-label="Time until LearnMate wakes up">
    <div><b id="h">--</b><span>hours</span></div>
    <div><b id="m">--</b><span>mins</span></div>
    <div><b id="s">--</b><span>secs</span></div>
  </div>` : `<button type="button" onclick="location.reload()">Try again 🚀</button>`}
  <div class="fact">
    <h2>🌟 Did you know?</h2>
    <p id="fact"></p>
  </div>
  <div class="brand">LearnMate</div>
</main>
<script>
  (function () {
    var sky = document.getElementById("sky");
    for (var i = 0; i < 70; i++) {
      var s = document.createElement("div");
      s.className = "star";
      s.style.left = Math.random() * 100 + "%";
      s.style.top = Math.random() * 100 + "%";
      s.style.setProperty("--d", (2 + Math.random() * 3).toFixed(1) + "s");
      s.style.setProperty("--delay", (Math.random() * 3).toFixed(1) + "s");
      if (Math.random() < 0.15) { s.style.width = s.style.height = "4px"; }
      sky.appendChild(s);
    }

    var facts = [
      "Owls can turn their heads almost all the way around: 270 degrees!",
      "Your brain sorts out everything you learned today while you sleep.",
      "A day on Venus is longer than a whole year on Venus.",
      "Octopuses have three hearts and blue blood.",
      "Honey never goes bad. People have found 3,000-year-old honey that was still good to eat!",
      "Light from the Sun takes about 8 minutes to reach the Earth.",
      "Your heart beats around 1,00,000 times every single day.",
      "Sharks were around long before trees existed.",
      "The Moon is slowly drifting away from Earth, about 4 cm every year.",
      "Butterflies taste their food with their feet!"
    ];
    var f = Math.floor(Math.random() * facts.length);
    var factEl = document.getElementById("fact");
    function showFact() { factEl.textContent = facts[f % facts.length]; f++; }
    showFact();
    setInterval(showFact, 8000);

    var left = ${night ? secondsUntilOpen() : 0};
    var h = document.getElementById("h"), m = document.getElementById("m"), s2 = document.getElementById("s");
    if (h) {
      var pad = function (n) { return (n < 10 ? "0" : "") + n; };
      var tick = function () {
        if (left <= 0) { location.reload(); return; }
        h.textContent = pad(Math.floor(left / 3600));
        m.textContent = pad(Math.floor(left % 3600 / 60));
        s2.textContent = pad(left % 60);
        left--;
      };
      tick();
      setInterval(tick, 1000);
    }
  })();
</script>
</body>
</html>`;
}
