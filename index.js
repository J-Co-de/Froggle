/* =========================================================
   CONFIG: the personal stuff. Edit this section.
   ========================================================= */
const FRIEND_NAME = "Froggy";

// Inside-joke answer words, exactly 5 letters each, e.g. ["pizza", "tacos"].
// They come up roughly 1 game in 3 and are always accepted as guesses.
const INSIDE_WORDS = [];

// Personal notes shown at these streaks instead of the generic message.
const MILESTONES = {
  3: "Three in a row. Tough week, tougher frog.",
  5: "Five in a row. You've got this, " + FRIEND_NAME + ".",
  10: "Ten in a row. I'm so glad you're my friend.",
};

// Shown once, the first time she opens the game.
const INTRO_TITLE = `For ${FRIEND_NAME} 🐸`;
const INTRO_MESSAGE =
  "I made this for you. No pressure, no rush. It's a little pond to hop around in whenever you need a break.\n\n- YOUR BEST FRIEND JACKSON CLARK";

/* =========================================================
   Setup
   ========================================================= */
const ROWS = 6;
const COLS = 5;
const STORE = {
  GAME: "froggle-game",
  STATS: "froggle-stats",
  INTRO: "froggle-intro-seen",
  MUTED: "froggle-muted",
};

const store = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem(k));
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* storage blocked */
    }
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* storage blocked */
    }
  },
};

// Answer pool
const WORDS = [
  "frogs",
  "toads",
  "ponds",
  "reeds",
  "marsh",
  "swamp",
  "croak",
  "hoppy",
  "leaps",
  "water",
  "flies",
  "green",
  "moist",
  "slime",
  "mossy",
  "river",
  "creek",
  "shore",
  "banks",
  "heron",
  "snake",
  "newts",
  "tiger",
  "tango",
  "table",
  "chair",
  "plant",
  "house",
  "world",
  "music",
  "light",
  "night",
  "dream",
  "smile",
  "happy",
  "brave",
  "quiet",
  "storm",
  "cloud",
  "sunny",
  "windy",
  "rainy",
  "beach",
  "ocean",
  "stone",
  "flame",
  "bread",
  "toast",
  "honey",
  "lemon",
  "apple",
  "grape",
  "berry",
  "candy",
  "pizza",
  "sushi",
  "pasta",
  "tacos",
  "salsa",
  "robot",
  "pixel",
  "mouse",
  "cable",
  "audio",
  "video",
  "login",
  "cache",
  "array",
  "stack",
  "queue",
  "logic",
  "debug",
  "build",
  "route",
  "valid",
  "token",
  "fetch",
  "heart",
  "peace",
  "laugh",
  "dance",
  "story",
  "magic",
  "zebra",
  "panda",
];

const INSIDE = INSIDE_WORDS.map((w) => w.toLowerCase()).filter((w) =>
  /^[a-z]{5}$/.test(w),
);

function pickAnswer() {
  const pool = INSIDE.length && Math.random() < 0.35 ? INSIDE : WORDS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/* =========================================================
   Valid guesses: big word list, with a dictionary API fallback
   ========================================================= */
const WORD_LIST_URL =
  "https://raw.githubusercontent.com/tabatkins/wordle-list/main/words";
const validWords = new Set([...WORDS, ...INSIDE]);
let listLoaded = false;

fetch(WORD_LIST_URL)
  .then((r) => {
    if (!r.ok) throw new Error(r.status);
    return r.text();
  })
  .then((text) => {
    text.split(/\s+/).forEach((w) => {
      w = w.trim().toLowerCase();
      if (/^[a-z]{5}$/.test(w)) validWords.add(w);
    });
    listLoaded = true;
  })
  .catch(() =>
    console.warn("Word list failed to load, using the dictionary API instead."),
  );

const apiCache = new Map();

async function isRealWord(word) {
  if (validWords.has(word)) return true;
  if (listLoaded) return false;
  if (apiCache.has(word)) return apiCache.get(word);
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${word}`,
    );
    if (res.status === 404) {
      apiCache.set(word, false);
      return false;
    }
    if (!res.ok) return true; // API trouble: don't punish the player
    apiCache.set(word, true);
    return true;
  } catch {
    return true; // offline: let the guess through
  }
}

/* =========================================================
   Board
   ========================================================= */
const grid = document.querySelector(".input-keys");
let keys = [...document.querySelectorAll(".key")];

if (keys.length === 0) {
  for (let i = 0; i < ROWS * COLS; i++) {
    const k = document.createElement("div");
    k.className = "key";
    grid.appendChild(k);
  }
  keys = [...document.querySelectorAll(".key")];
}

const tile = (r, c) => keys[r * COLS + c];
const card = document.querySelector(".game-outer");

/* Toast */
const toast = document.createElement("div");
toast.className = "toast";
document.body.appendChild(toast);
let toastTimer;

function showToast(msg, ms = 1800) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => toast.classList.remove("show"), ms);
}

/* =========================================================
   Stats (saved)
   ========================================================= */
function loadStats() {
  const s = store.get(STORE.STATS);
  return {
    streak: s?.streak | 0,
    best: s?.best | 0,
    played: s?.played | 0,
    won: s?.won | 0,
  };
}

let stats = loadStats();

const statsEl = document.createElement("div");
statsEl.className = "stats";
statsEl.innerHTML = `
  <div><b id="st-streak">0</b><span>Streak</span></div>
  <div><b id="st-best">0</b><span>Best</span></div>
  <div><b id="st-won">0</b><span>Won</span></div>
`;
document.body.appendChild(statsEl);

function renderStats() {
  document.getElementById("st-streak").textContent = stats.streak;
  document.getElementById("st-best").textContent = stats.best;
  document.getElementById("st-won").textContent =
    `${stats.won}/${stats.played}`;
}

// Saves immediately (so a refresh can't dodge a loss). The panel is redrawn
// later, once the tiles have finished revealing. Returns true on a new best.
function recordResult(won) {
  stats.played++;
  let newBest = false;
  if (won) {
    stats.won++;
    stats.streak++;
    if (stats.streak > stats.best) {
      stats.best = stats.streak;
      newBest = stats.streak > 1;
    }
  } else {
    stats.streak = 0;
  }
  store.set(STORE.STATS, stats);
  return newBest;
}

/* =========================================================
   On-screen keyboard
   ========================================================= */
const KB_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["enter", "z", "x", "c", "v", "b", "n", "m", "back"],
];
const RANK = { absent: 1, present: 2, correct: 3 };
const keyboard = document.createElement("div");
keyboard.className = "keyboard";
const kbKeys = {};

KB_ROWS.forEach((letters) => {
  const rowEl = document.createElement("div");
  rowEl.className = "kb-row";
  letters.forEach((k) => {
    const btn = document.createElement("button");
    btn.className = "kb-key" + (k.length > 1 ? " wide" : "");
    btn.textContent =
      k === "enter" ? "Enter" : k === "back" ? "⌫" : k.toUpperCase();
    btn.tabIndex = -1;
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () =>
      handleKey(k === "enter" ? "Enter" : k === "back" ? "Backspace" : k),
    );
    kbKeys[k] = btn;
    rowEl.appendChild(btn);
  });
  keyboard.appendChild(rowEl);
});
document.body.appendChild(keyboard);

function updateKeyboard(guess, result) {
  result.forEach((state, i) => {
    const btn = kbKeys[guess[i]];
    const current = btn.dataset.state;
    if (!current || RANK[state] > RANK[current]) btn.dataset.state = state;
  });
}

/* =========================================================
   Sound (Web Audio, no files needed)
   ========================================================= */
let audioCtx = null;
let muted = store.get(STORE.MUTED) === true;

function audio() {
  if (muted) return null;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function tone({ freq, to, dur = 0.12, type = "sine", vol = 0.1, delay = 0 }) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const sfx = {
  tick: () =>
    tone({ freq: 520, to: 420, dur: 0.04, type: "triangle", vol: 0.05 }),
  wrong: () =>
    tone({ freq: 180, to: 110, dur: 0.22, type: "square", vol: 0.05 }),
  ribbit: (delay = 0) => {
    tone({ freq: 140, to: 260, dur: 0.09, type: "sawtooth", vol: 0.07, delay });
    tone({
      freq: 160,
      to: 300,
      dur: 0.11,
      type: "sawtooth",
      vol: 0.07,
      delay: delay + 0.12,
    });
  },
  reveal: (result) =>
    result.forEach((state, i) =>
      tone({
        freq: state === "correct" ? 660 : state === "present" ? 520 : 300,
        dur: 0.08,
        type: "triangle",
        vol: 0.05,
        delay: i * 0.25,
      }),
    ),
  win: (tier) => {
    const notes = [523, 659, 784, 1047, 1319, 1568];
    const n = Math.min(2 + tier, notes.length);
    for (let i = 0; i < n; i++) {
      tone({
        freq: notes[i],
        dur: 0.16,
        type: "triangle",
        vol: 0.1,
        delay: i * 0.1,
      });
    }
    sfx.ribbit(n * 0.1 + 0.05);
  },
  lose: () =>
    tone({ freq: 392, to: 196, dur: 0.55, type: "triangle", vol: 0.1 }),
};

const muteBtn = document.createElement("button");
muteBtn.className = "mute-btn";
muteBtn.tabIndex = -1;
muteBtn.setAttribute("aria-label", "Toggle sound");
const renderMute = () => {
  muteBtn.textContent = muted ? "🔇" : "🔊";
};
muteBtn.addEventListener("mousedown", (e) => e.preventDefault());
muteBtn.addEventListener("click", () => {
  muted = !muted;
  store.set(STORE.MUTED, muted);
  renderMute();
  if (!muted) sfx.ribbit();
});
document.body.appendChild(muteBtn);

/* =========================================================
   First-open intro card
   ========================================================= */
let introOpen = false;
let closeIntro = () => {};

function showIntro() {
  if (store.get(STORE.INTRO)) return;
  introOpen = true;

  const overlay = document.createElement("div");
  overlay.className = "intro";
  overlay.innerHTML = `<div class="intro-card"><h2></h2><p></p><button>Let's play</button></div>`;
  overlay.querySelector("h2").textContent = INTRO_TITLE;
  overlay.querySelector("p").textContent = INTRO_MESSAGE;
  document.body.appendChild(overlay);

  closeIntro = () => {
    if (!introOpen) return;
    introOpen = false;
    store.set(STORE.INTRO, true);
    overlay.remove();
    sfx.ribbit();
  };
  overlay.querySelector("button").addEventListener("click", closeIntro);
}

/* =========================================================
   Celebration and frog reactions
   ========================================================= */
const reduceMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;
const CONFETTI_COLORS = ["#69E25D", "#B8E04A", "#7DF9FF", "#F2D64B", "#F5FFF5"];
const tierOf = (streak) =>
  streak >= 10 ? 4 : streak >= 5 ? 3 : streak >= 2 ? 2 : 1;

function confetti(count, emojis) {
  const layer = document.createElement("div");
  layer.className = "confetti";
  for (let i = 0; i < count; i++) {
    const p = document.createElement("i");
    if (emojis && Math.random() < 0.4) {
      p.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      p.classList.add("emoji");
    } else {
      p.style.background =
        CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    }
    p.style.setProperty("--x", Math.random() * 100 + "vw");
    p.style.setProperty("--drift", Math.random() * 30 - 15 + "vw");
    p.style.setProperty("--spin", Math.random() * 720 - 360 + "deg");
    p.style.setProperty("--dur", 2 + Math.random() * 1.8 + "s");
    p.style.setProperty("--delay", Math.random() * 0.8 + "s");
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 5500);
}

function celebrate(streak, r, newBest) {
  if (reduceMotion) return;
  const tier = tierOf(streak);
  document.body.style.setProperty(
    "--reps",
    tier === 4 ? 3 : tier === 3 ? 2 : 1,
  );
  for (let c = 0; c < COLS; c++) {
    const t = tile(r, c);
    t.style.animationDelay = `${c * 0.1}s`;
    t.classList.add("win-bounce");
  }
  document.body.classList.add("flick");

  if (tier >= 2) {
    card.classList.add("party");
    confetti(40);
  }
  if (tier >= 3) {
    card.classList.add("glow");
    confetti(80, ["🪷", "🪰", "✨"]);
  }
  if (tier === 4 || newBest) card.classList.add("gold");
  if (tier === 4) setTimeout(() => confetti(100, ["🐸", "⭐", "🪷"]), 1200);
}

function clearCelebration() {
  card.classList.remove("party", "glow", "gold", "blink");
  document.body.style.removeProperty("--reps");
  card.style.removeProperty("--pupil-y");
  document.body.classList.remove("flick", "droop");
  document.querySelectorAll(".confetti").forEach((el) => el.remove());
  keys.forEach((k) => {
    k.classList.remove("win-bounce");
    k.style.animationDelay = "";
  });
}

// Eyes duck down and back up, twice
function blinkEyes() {
  card.classList.remove("blink");
  void card.offsetWidth; // restart the animation
  card.classList.add("blink");
  setTimeout(() => card.classList.remove("blink"), 800);
}

// Sad pupils and a limp tongue
function droopFrog() {
  card.style.setProperty("--pupil-y", "38%");
  document.body.classList.add("droop");
}

/* =========================================================
   Game logic
   ========================================================= */
let answer, row, col, locked, gameOver, guesses;

const saveGame = () => store.set(STORE.GAME, { answer, guesses });

function resetBoard() {
  row = 0;
  col = 0;
  locked = false;
  gameOver = false;
  guesses = [];
  keys.forEach((k) => {
    k.textContent = "";
    k.removeAttribute("data-state");
    k.classList.remove("filled", "shake");
  });
  Object.values(kbKeys).forEach((b) => b.removeAttribute("data-state"));
  toast.classList.remove("show");
  clearCelebration();
}

function startGame() {
  resetBoard();
  answer = pickAnswer();
  saveGame();
}

// Rebuild an unfinished game after a refresh. Returns true if one was restored.
function restoreGame() {
  const s = store.get(STORE.GAME);
  const ok =
    s &&
    typeof s.answer === "string" &&
    /^[a-z]{5}$/.test(s.answer) &&
    Array.isArray(s.guesses) &&
    s.guesses.length < ROWS &&
    s.guesses.every((g) => typeof g === "string" && /^[a-z]{5}$/.test(g));
  if (!ok) return false;

  resetBoard();
  answer = s.answer;
  s.guesses.forEach((g, r) => {
    const result = evaluate(g);
    for (let c = 0; c < COLS; c++) {
      const t = tile(r, c);
      t.textContent = g[c].toUpperCase();
      t.setAttribute("data-state", result[c]);
    }
    updateKeyboard(g, result);
  });
  guesses = [...s.guesses];
  row = guesses.length;
  col = 0;
  return true;
}

function currentGuess() {
  let g = "";
  for (let c = 0; c < COLS; c++) g += tile(row, c).textContent;
  return g.toLowerCase();
}

function addLetter(ch) {
  if (col >= COLS) return;
  const t = tile(row, col);
  t.textContent = ch.toUpperCase();
  t.classList.add("filled");
  col++;
  sfx.tick();
}

function deleteLetter() {
  if (col === 0) return;
  col--;
  const t = tile(row, col);
  t.textContent = "";
  t.classList.remove("filled");
}

function shakeRow() {
  for (let c = 0; c < COLS; c++) {
    const t = tile(row, c);
    t.classList.remove("shake");
    void t.offsetWidth;
    t.classList.add("shake");
  }
}

function reactWrong(msg) {
  shakeRow();
  showToast(msg);
  blinkEyes();
  sfx.wrong();
}

function evaluate(guess) {
  const result = Array(COLS).fill("absent");
  const remaining = {};
  for (let i = 0; i < COLS; i++) {
    if (guess[i] === answer[i]) result[i] = "correct";
    else remaining[answer[i]] = (remaining[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < COLS; i++) {
    if (result[i] === "correct") continue;
    if (remaining[guess[i]] > 0) {
      result[i] = "present";
      remaining[guess[i]]--;
    }
  }
  return result;
}

async function submitGuess() {
  if (col < COLS) {
    reactWrong("Not enough letters");
    return;
  }

  const guess = currentGuess();
  locked = true;
  if (!(await isRealWord(guess))) {
    locked = false;
    reactWrong("Not in word list");
    return;
  }

  const result = evaluate(guess);
  const thisRow = row;
  const won = guess === answer;
  const lost = !won && thisRow === ROWS - 1;

  // Save right away, so a refresh mid-reveal can't dodge a loss or lose a guess
  guesses.push(guess);
  let newBest = false;
  if (won || lost) {
    newBest = recordResult(won);
    store.del(STORE.GAME);
  } else {
    saveGame();
  }

  result.forEach((state, i) => {
    setTimeout(
      () => tile(thisRow, i).setAttribute("data-state", state),
      i * 250,
    );
  });
  sfx.reveal(result);

  setTimeout(
    () => {
      updateKeyboard(guess, result);

      if (won) {
        renderStats();
        celebrate(stats.streak, thisRow, newBest);
        sfx.win(tierOf(stats.streak));
        const msgs = [
          "Ribbit-tastic!",
          "Splendid!",
          "Great hop!",
          "Nice leap!",
          "Phew!",
          "Just in time!",
        ];
        const text =
          MILESTONES[stats.streak] ||
          msgs[thisRow] +
            (stats.streak >= 2 ? ` ${stats.streak} in a row!` : "") +
            (newBest ? " New best!" : "");
        showToast(text + "\n(Enter to play again)", 0);
        gameOver = true;
      } else if (lost) {
        renderStats();
        droopFrog();
        sfx.lose();
        showToast(
          `It was ${answer.toUpperCase()}. Next hop's yours!\n(Enter to play again)`,
          0,
        );
        gameOver = true;
      } else {
        row++;
        col = 0;
      }
      locked = false;
    },
    COLS * 250 + 100,
  );
}

/* =========================================================
   Input
   ========================================================= */
function handleKey(key) {
  if (introOpen) {
    if (key === "Enter") closeIntro();
    return;
  }
  if (gameOver) {
    if (key === "Enter") startGame();
    return;
  }
  if (locked) return;

  if (key === "Enter") submitGuess();
  else if (key === "Backspace") deleteLetter();
  else if (/^[a-zA-Z]$/.test(key)) addLetter(key);
}

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  handleKey(e.key);
});

/* =========================================================
   Scenery and flies (wide screens only; CSS hides it on phones)
   ========================================================= */
const rand = (a, b) => a + Math.random() * (b - a);

const REEDS_SVG = `
  <g fill="none" stroke-linecap="round">
    <g stroke="#2F7D3A" stroke-width="4">
      <path d="M30 300 Q24 200 34 92"/>
      <path d="M60 300 Q68 170 56 44"/>
      <path d="M90 300 Q98 220 88 126"/>
    </g>
    <g stroke="#3FA34D" stroke-width="5">
      <path d="M45 300 Q30 230 10 150"/>
      <path d="M75 300 Q95 240 112 170"/>
    </g>
  </g>
  <g fill="#6B4A2B">
    <rect x="29" y="64" width="10" height="34" rx="5"/>
    <rect x="51" y="18" width="10" height="34" rx="5"/>
    <rect x="83" y="98" width="10" height="34" rx="5"/>
  </g>`;

function buildScene() {
  const scene = document.createElement("div");
  scene.className = "scene";
  let html = `<div class="moon"></div><div class="water"></div>`;

  // stars
  for (let i = 0; i < 40; i++) {
    html += `<i class="star" style="left:${rand(0, 100)}vw;top:${rand(2, 55)}vh;--d:${rand(2, 5)}s;--o:${rand(0.3, 0.9)}"></i>`;
  }

  // reeds: [side, offset in vw, height in vh]
  [
    ["l", 1, 42],
    ["l", 8, 28],
    ["r", 1, 42],
    ["r", 8, 28],
  ].forEach(([side, off, h]) => {
    const edge = side === "l" ? "left" : "right";
    html += `<svg class="reeds ${side}" viewBox="0 0 120 300" aria-hidden="true"
      style="${edge}:${off}vw;height:${h}vh;animation-delay:-${rand(0, 5)}s">${REEDS_SVG}</svg>`;
  });

  // lily pads (+ a ripple under each)
  const pads = [
    { x: 3, b: 5, w: 7 },
    { x: 11, b: 11, w: 5.5, flower: true },
    { x: 17, b: 4, w: 6 },
    { x: 79, b: 5, w: 6 },
    { x: 86, b: 10, w: 5.5, flower: true },
    { x: 92, b: 4, w: 7 },
  ];
  pads.forEach((p) => {
    html += `<i class="ripple" style="left:calc(${p.x}vw - ${p.w * 0.25}rem);bottom:calc(${p.b}vh - 0.4rem);width:${p.w * 1.5}rem;height:${p.w * 0.5}rem;animation-delay:-${rand(0, 4)}s"></i>`;
    html += `<div class="padwrap" style="left:${p.x}vw;bottom:${p.b}vh;width:${p.w}rem;height:${p.w * 0.42}rem;animation-delay:-${rand(0, 4)}s">
      <div class="pad"></div>${p.flower ? '<span class="lotus">🪷</span>' : ""}</div>`;
  });

  // fireflies
  for (let i = 0; i < 18; i++) {
    html += `<i class="firefly" style="left:${rand(0, 100)}vw;top:${rand(25, 90)}vh;--dx:${rand(-8, 8)}vw;--dy:${rand(-10, 10)}vh;--t:${rand(7, 14)}s;--b:${rand(2, 5)}s;animation-delay:-${rand(0, 8)}s,-${rand(0, 4)}s"></i>`;
  }

  scene.innerHTML = html;
  document.body.appendChild(scene);
}

// Flies the frog can eat: they hang around the side areas
function placeFly(f) {
  const onLeft = Math.random() < 0.5;
  f.style.left = (onLeft ? rand(3, 18) : rand(82, 96)) + "vw";
  f.style.top = rand(24, 70) + "vh";
  ["a", "b", "c"].forEach((k) => {
    f.style.setProperty(`--${k}x`, rand(-4, 4) + "vw");
    f.style.setProperty(`--${k}y`, rand(-8, 8) + "vh");
  });
  f.style.setProperty("--t", rand(6, 10) + "s");
}

function eatFly(f) {
  if (f.classList.contains("eaten")) return;
  f.classList.add("eaten");

  document.body.style.setProperty("--reps", 1);
  document.body.classList.remove("flick");
  void document.body.offsetWidth; // restart the tongue animation
  document.body.classList.add("flick");
  setTimeout(() => document.body.classList.remove("flick"), 700);
  sfx.ribbit();

  setTimeout(
    () => {
      placeFly(f);
      f.classList.remove("eaten");
    },
    4000 + Math.random() * 4000,
  );
}

function buildFlies() {
  const layer = document.createElement("div");
  layer.className = "flies";
  for (let i = 0; i < 3; i++) {
    const f = document.createElement("span");
    f.className = "fly";
    f.textContent = "🪰";
    f.title = "Feed the frog";
    placeFly(f);
    f.addEventListener("click", () => eatFly(f));
    layer.appendChild(f);
  }
  document.body.appendChild(layer);
}

buildScene();
buildFlies();
/* =========================================================
   Boot
   ========================================================= */
renderStats();
renderMute();
if (!restoreGame()) startGame();
showIntro();
