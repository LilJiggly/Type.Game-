// ---------- Config ----------
const WORDS = [
  "apple", "river", "stone", "planet", "tiger", "shadow", "rocket", "forest",
  "silver", "ocean", "dragon", "window", "desert", "galaxy", "thunder",
  "anchor", "beacon", "candle", "canyon", "castle", "cloud", "coral", "crystal",
  "ember", "falcon", "feather", "garden", "glacier", "harbor", "island",
  "jungle", "kettle", "lantern", "marble", "meadow", "mirror", "mountain",
  "needle", "orchard", "pebble", "pepper", "pillow", "puzzle", "quartz",
  "rabbit", "ribbon", "saddle", "spider", "sunset", "temple", "tunnel",
  "valley", "velvet", "violin", "walnut", "whisper", "willow", "winter",
  "wizard", "zephyr",
];
const WORD_COUNT_OPTIONS = [10, 20, 30, 50];
const DEFAULT_WORD_COUNT = 10;
const VISIBLE_WORDS = 3;
const POINTS_PER_WORD = 5;
const CLEAN_BONUS_PER_WORD = 5;
const SLIDE_OUT_MS = 300;
const FONTS = ["Sora", "Space Mono", "Georgia", "Arial", "Comic Sans MS"];

// Bonus tiers, checked top to bottom.
const WPM_BONUS_TIERS = [
  { min: 50, bonus: 10 },
  { min: 40, bonus: 7 },
  { min: 30, bonus: 5 },
  { min: 20, bonus: 3 },
];
// Time tiers are seconds PER WORD so they scale with the word count
// (for a 10 word game these equal 10s / 15s / 20s / 25s).
const TIME_BONUS_TIERS = [
  { maxPerWord: 1, bonus: 10 },
  { maxPerWord: 1.5, bonus: 7 },
  { maxPerWord: 2, bonus: 5 },
  { maxPerWord: 2.5, bonus: 3 },
];

// ---------- DOM ----------
const container = document.getElementById("wordContainer");
const inputElement = document.getElementById("input");
const progressElement = document.getElementById("progress");
const timerElement = document.getElementById("timer");
const scoreElement = document.getElementById("score");
const bestElement = document.getElementById("best");
const scoreContainer = document.getElementById("scoreContainer");
const hintElement = document.getElementById("hint");
const countOptions = document.getElementById("countOptions");
const fontButton = document.getElementById("fontButton");
const themeButton = document.getElementById("themeButton");
const restartButton = document.getElementById("restartButton");

// ---------- State ----------
let wordCount = DEFAULT_WORD_COUNT;
let gameWords = [];
let nextToRender = 0;
let currentIndex = 0;
let completedWords = 0;
let cleanWords = 0;
let currentWordHadMistake = false;
let startTime = null;
let timerInterval = null;
let finished = false;
let fontIndex = 0;
let totalKeystrokes = 0;
let correctKeystrokes = 0;
let previousLength = 0;

// ---------- Helpers ----------
function tierBonus(value, tiers, compare) {
  const tier = tiers.find((t) => compare(value, t));
  return tier ? tier.bonus : 0;
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function loadBest() {
  try {
    return Number(localStorage.getItem(`typingGameBest_${wordCount}`)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(score) {
  try {
    localStorage.setItem(`typingGameBest_${wordCount}`, String(score));
  } catch {
    // localStorage unavailable (private mode etc.), ignore
  }
}

function showBest() {
  const best = loadBest();
  bestElement.textContent = best ? `Best: ${best}` : "Best: -";
}

// ---------- Rendering ----------
function createWordElement(word) {
  const div = document.createElement("div");
  div.classList.add("word");

  word.split("").forEach((letter) => {
    const span = document.createElement("span");
    span.textContent = letter;
    span.dataset.letter = letter;
    div.appendChild(span);
  });

  return div;
}

function fillWordQueue() {
  while (container.children.length < VISIBLE_WORDS && nextToRender < gameWords.length) {
    container.appendChild(createWordElement(gameWords[nextToRender]));
    nextToRender++;
  }
}

function updateOpacity() {
  [...container.children].forEach((word, i) => {
    word.classList.remove("opacity100", "opacity50", "opacity0");
    if (i === 0) word.classList.add("opacity100");
    else if (i === 1) word.classList.add("opacity50");
    else word.classList.add("opacity0");
  });
}

// Colours each letter, shows the typed letter in place of a wrong one,
// and puts the caret (the stripe) at the current typing position.
function markLetters(wordElement, typed) {
  wordElement.querySelectorAll("span").forEach((span, i) => {
    span.classList.remove("correct", "wrong", "caret");
    span.textContent = span.dataset.letter;

    if (i === typed.length) span.classList.add("caret");
    if (typed[i] == null) return;

    if (typed[i] === span.dataset.letter) {
      span.classList.add("correct");
    } else {
      span.classList.add("wrong");
      span.textContent = typed[i] === " " ? "_" : typed[i];
      currentWordHadMistake = true;
    }
  });
}

function shakeWord(wordElement) {
  wordElement.classList.remove("shake");
  void wordElement.offsetWidth; // restart the animation if it is already running
  wordElement.classList.add("shake");
}

function prepareCurrentWord() {
  inputElement.value = "";
  previousLength = 0;
  inputElement.maxLength = gameWords[currentIndex].length;
  currentWordHadMistake = false;
  updateOpacity();
  markLetters(container.children[0], "");
}

// ---------- Game flow ----------
function startTimer() {
  startTime = Date.now();
  hintElement.classList.add("hintGone");
  timerInterval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    timerElement.textContent = `Time: ${elapsed}s`;
  }, 50);
}

function setTip(id, text, tip) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.dataset.tip = tip;
}

function finishGame() {
  clearInterval(timerInterval);
  finished = true;

  const seconds = (Date.now() - startTime) / 1000;
  const wpm = Math.round((completedWords / seconds) * 60);

  const baseScore = completedWords * POINTS_PER_WORD;
  const cleanBonus = cleanWords * CLEAN_BONUS_PER_WORD;
  const wpmBonus = tierBonus(wpm, WPM_BONUS_TIERS, (v, t) => v >= t.min);
  const timeBonus = tierBonus(
    seconds,
    TIME_BONUS_TIERS,
    (v, t) => v <= t.maxPerWord * wordCount,
  );
  const score = baseScore + cleanBonus + timeBonus + wpmBonus;

  const previousBest = loadBest();
  const isNewBest = score > previousBest;
  if (isNewBest) saveBest(score);

  container.textContent = "Finished!";
  container.classList.add("finished");
  timerElement.textContent = `Time: ${seconds.toFixed(2)}s`;
  setTip(
    "wpm",
    `Speed: ${wpm} WPM`,
    `${completedWords} words ÷ ${seconds.toFixed(2)}s × 60 = ${wpm} words per minute. ` +
      `This is what the WPM bonus is based on.`,
  );
  scoreElement.textContent = `Score: ${score} points`;
  showBest();

  setTip(
    "baseScore",
    `Base score: ${baseScore}`,
    `${completedWords} words × ${POINTS_PER_WORD} points = ${baseScore}.`,
  );
  setTip(
    "cleanBonus",
    `Clean bonus: ${cleanBonus}`,
    `A word is clean if you never typed a wrong letter in it, even if you corrected it. ` +
      `${cleanWords} of ${completedWords} words were clean × ${CLEAN_BONUS_PER_WORD} points = ${cleanBonus}.`,
  );
  setTip(
    "timeBonus",
    `Time bonus: ${timeBonus}`,
    `You finished in ${seconds.toFixed(2)}s. Per word thresholds: ` +
      TIME_BONUS_TIERS.map(
        (t) => `${(t.maxPerWord * wordCount).toFixed(0)}s or less = +${t.bonus}`,
      ).join(", ") +
      ` (for ${wordCount} words).`,
  );
  setTip(
    "wpmBonus",
    `WPM bonus: ${wpmBonus}`,
    `Your speed was ${wpm} WPM (words completed ÷ seconds × 60). ` +
      WPM_BONUS_TIERS.map((t) => `${t.min}+ WPM = +${t.bonus}`).join(", ") +
      ".",
  );
  setTip(
    "finalScore",
    `Total score: ${score}${isNewBest ? " (new best!)" : ""}`,
    `Base ${baseScore} + clean ${cleanBonus} + time ${timeBonus} + WPM ${wpmBonus} = ${score}. ` +
      `Press Enter or Esc to play again.`,
  );

  const accuracy = totalKeystrokes
    ? Math.round((correctKeystrokes / totalKeystrokes) * 100)
    : 100;
  setTip(
    "accuracy",
    `Accuracy: ${accuracy}%`,
    `${correctKeystrokes} of ${totalKeystrokes} keystrokes were the right letter ` +
      `(corrections with backspace don't count as keystrokes). Accuracy does not affect your score.`,
  );

  scoreContainer.classList.remove("hidden");
  inputElement.disabled = true;
  restartButton.focus(); // keep keyboard users in the page: Enter plays again
}

function completeWord(wordElement) {
  wordElement.classList.add("slideOut");
  inputElement.maxLength = 0; // block extra input during the slide-out
  completedWords++;
  if (!currentWordHadMistake) cleanWords++;

  setTimeout(() => {
    if (wordElement.parentNode !== container) return; // game was restarted
    wordElement.remove();
    currentIndex++;

    if (currentIndex < gameWords.length) {
      progressElement.textContent = `Word ${currentIndex + 1} / ${gameWords.length}`;
      fillWordQueue();
      prepareCurrentWord();
    } else {
      finishGame();
    }
  }, SLIDE_OUT_MS);
}

function startGame({ focusInput = true } = {}) {
  clearInterval(timerInterval);

  gameWords = shuffle(WORDS).slice(0, wordCount);
  nextToRender = 0;
  currentIndex = 0;
  completedWords = 0;
  cleanWords = 0;
  startTime = null;
  finished = false;
  totalKeystrokes = 0;
  correctKeystrokes = 0;

  progressElement.textContent = `Word 1 / ${gameWords.length}`;
  timerElement.textContent = "Time: 0.00s";
  scoreElement.textContent = "Score: 0 points";
  showBest();

  scoreContainer.classList.add("hidden");
  hintElement.classList.remove("hintGone");

  container.innerHTML = "";
  container.classList.remove("finished");
  fillWordQueue();

  inputElement.disabled = false;
  prepareCurrentWord();
  if (focusInput) inputElement.focus();
}

// Built once so keyboard focus stays on a button after it is activated
function buildCountOptions() {
  WORD_COUNT_OPTIONS.forEach((count) => {
    const button = document.createElement("button");
    button.textContent = count;
    button.dataset.count = count;
    button.setAttribute("aria-label", `${count} words`);
    button.addEventListener("click", () => {
      wordCount = count;
      updateCountOptions();
      // keep focus on the button so Tab / Shift+Tab continue from here
      startGame({ focusInput: false });
    });
    countOptions.appendChild(button);
  });
  updateCountOptions();
}

function updateCountOptions() {
  countOptions.querySelectorAll("button").forEach((button) => {
    const selected = Number(button.dataset.count) === wordCount;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function updateThemeButton() {
  const isDark = document.documentElement.dataset.theme === "dark";
  themeButton.textContent = isDark ? "☀ Light" : "☾ Dark";
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("typingGameTheme", next);
  } catch {
    // localStorage unavailable, theme just won't be remembered
  }
  updateThemeButton();
}

function changeFont() {
  fontIndex = (fontIndex + 1) % FONTS.length;
  document.body.style.fontFamily = FONTS[fontIndex];
  fontButton.textContent = `Aa ${FONTS[fontIndex]}`;
}

// ---------- Events ----------
inputElement.addEventListener("input", () => {
  if (finished) return;
  if (startTime === null && inputElement.value.length > 0) startTimer();

  const wordElement = container.children[0];
  if (!wordElement || wordElement.classList.contains("slideOut")) return;

  const typed = inputElement.value;

  // Count a keystroke only when a letter was added (not on backspace)
  if (typed.length > previousLength) {
    totalKeystrokes++;
    if (typed[typed.length - 1] === gameWords[currentIndex][typed.length - 1]) {
      correctKeystrokes++;
    } else {
      shakeWord(wordElement);
    }
  }
  previousLength = typed.length;

  markLetters(wordElement, typed);

  if (typed === gameWords[currentIndex]) completeWord(wordElement);
});

restartButton.addEventListener("click", () => startGame());
fontButton.addEventListener("click", changeFont);
themeButton.addEventListener("click", toggleTheme);

// Clicking empty page space returns focus to the typing input,
// but never steals it from a button or other control the user activated.
document.body.addEventListener("click", (event) => {
  if (event.target.closest("button, .scoreRow")) return;
  inputElement.focus();
});

function isControlFocused() {
  return document.activeElement?.closest("button, .scoreRow") != null;
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    startGame();
    return;
  }

  // Enter plays again after finishing, unless it is activating a focused control
  if (finished && event.key === "Enter" && !isControlFocused()) {
    event.preventDefault();
    startGame();
    return;
  }

  // Tab, arrows, Space/Enter on a control, and shortcuts keep their normal behaviour.
  // Any plain letter jumps back to the typing input so you can just start typing.
  const isTypingKey =
    event.key.length === 1 &&
    event.key !== " " &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey;
  if (isTypingKey) inputElement.focus();
});

document.addEventListener("DOMContentLoaded", () => {
  updateThemeButton();
  fontButton.textContent = `Aa ${FONTS[fontIndex]}`;
  buildCountOptions();
  startGame();
});
