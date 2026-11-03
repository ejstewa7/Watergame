const modes = {
  easy: { goal: 20, time: 50, lives: 4, spawn: 1050, fallSpeed: 1.8, canChance: 0.12 },
  normal: { goal: 20, time: 40, lives: 3, spawn: 850, fallSpeed: 2.4, canChance: 0.18 },
  hard: { goal: 20, time: 30, lives: 2, spawn: 680, fallSpeed: 3.1, canChance: 0.42 },
};

const milestones = [
  { at: 0.25, text: "A strong start!" },
  { at: 0.5, text: "Halfway there!" },
  { at: 0.75, text: "Almost filled!" },
];

let difficulty = "easy";
let score = 0;
let lives = modes.easy.lives;
let secondsLeft = modes.easy.time;
let highScore = Number(localStorage.getItem("waterCatcherHighScore") || 0);
let active = false;
let muted = false;
let timerId = null;
let spawnId = null;
let animationId = null;
let audioContext = null;
let announcedMilestones = new Set();
let canElement = null;
let canX = 0;
let forceCleanDrop = false;
let keys = { left: false, right: false };

const playArea = document.getElementById("playArea");
const gameShell = document.querySelector(".game-shell");
const scoreElement = document.getElementById("score");
const goalElement = document.getElementById("goal");
const livesElement = document.getElementById("lives");
const timeElement = document.getElementById("time");
const milestoneElement = document.getElementById("milestone");
const startOverlay = document.getElementById("startOverlay");
const overlayText = document.getElementById("overlayText");
const startButton = document.getElementById("startButton");
const soundButton = document.getElementById("soundButton");
const soundIcon = document.getElementById("soundIcon");

function playTone(frequency, duration = 0.08, type = "sine") {
  if (muted) return;
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.08, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function setDifficulty(level) {
  if (active) return;
  difficulty = level;
  document.querySelectorAll(".difficulty-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.difficulty === level);
  });
  scoreElement.textContent = "0";
  goalElement.textContent = modes[level].goal;
  lives = modes[level].lives;
  secondsLeft = modes[level].time;
  livesElement.textContent = lives > 0 ? "♥ ".repeat(lives).trim() : "No lives";
  timeElement.textContent = `${secondsLeft}s`;
  livesElement.classList.remove("no-life");
  livesElement.setAttribute("aria-label", `${lives} lives`);
  milestoneElement.textContent = `${level[0].toUpperCase()}${level.slice(1)} mode ready`;
  playTone(330, 0.05);
}

function clearGameElements() {
  playArea.querySelectorAll(".rain-drop, .falling-can, .watering-can").forEach((element) => element.remove());
}

function updateLives() {
  livesElement.textContent = lives > 0 ? "♥ ".repeat(lives).trim() : "No lives";
  livesElement.classList.toggle("no-life", lives === 0);
  livesElement.setAttribute("aria-label", `${lives} lives`);
}

function loseLife(reason) {
  if (!active || lives <= 0) return;
  lives -= 1;
  updateLives();
  milestoneElement.textContent = reason;
  playTone(150, 0.12, "triangle");
  if (lives <= 0) finishGame(false);
}

function spawnDrop() {
  if (!active) return;
  const mode = modes[difficulty];
  const isCan = difficulty === "hard" && forceCleanDrop
    ? false
    : Math.random() < mode.canChance;
  forceCleanDrop = difficulty === "hard" && isCan;
  if (difficulty !== "hard") forceCleanDrop = false;
  const item = document.createElement("div");
  item.className = isCan ? "falling-can" : "rain-drop";
  item.textContent = isCan ? "🗑️" : "💧";
  item.setAttribute("aria-label", isCan ? "Trash" : "Clean water drop");
  item.dataset.can = isCan ? "true" : "false";
  item.dataset.speed = String(mode.fallSpeed + Math.random() * 1.8);
  const itemWidth = isCan ? 46 : 38;
  item.style.left = `${10 + Math.random() * Math.max(20, playArea.clientWidth - itemWidth - 10)}px`;
  item.style.top = "-38px";
  playArea.appendChild(item);
}

function collectDrop() {
  score += 1;
  scoreElement.textContent = score;
  playTone(520 + Math.min(score * 12, 220), 0.09, "sine");

  const goal = modes[difficulty].goal;
  milestones.forEach((milestone, index) => {
    const target = Math.ceil(goal * milestone.at);
    if (score >= target && !announcedMilestones.has(index)) {
      announcedMilestones.add(index);
      milestoneElement.textContent = milestone.text;
      playTone(680 + index * 80, 0.12, "triangle");
    }
  });

  if (score >= modes[difficulty].goal) finishGame(true);
}

function startGame() {
  const enterFullscreen = document.documentElement.requestFullscreen;
  if (enterFullscreen) enterFullscreen.call(document.documentElement).catch(() => {});

  clearGameElements();
  clearInterval(timerId);
  clearInterval(spawnId);
  cancelAnimationFrame(animationId);

  active = true;
  forceCleanDrop = false;
  score = 0;
  lives = modes[difficulty].lives;
  secondsLeft = modes[difficulty].time;
  announcedMilestones.clear();
  scoreElement.textContent = "0";
  goalElement.textContent = modes[difficulty].goal;
  timeElement.textContent = `${secondsLeft}s`;
  updateLives();
  milestoneElement.textContent = "Catch the clean water";
  startOverlay.classList.add("hidden");
  gameShell.classList.add("game-running");
  startButton.textContent = "Restart quest";
  playTone(440, 0.08);

  canElement = document.createElement("div");
  canElement.className = "watering-can";
  canElement.innerHTML = '<span aria-hidden="true"></span>';
  canElement.setAttribute("aria-label", "Yellow water can");
  playArea.appendChild(canElement);
  canX = playArea.clientWidth / 2 - 44;
  canElement.style.left = `${canX}px`;

  keys.left = false;
  keys.right = false;
  spawnDrop();
  spawnId = setInterval(spawnDrop, modes[difficulty].spawn);
  timerId = setInterval(() => {
    secondsLeft -= 1;
    timeElement.textContent = `${secondsLeft}s`;
    if (secondsLeft <= 0) finishGame(false);
  }, 1000);
  animateGame();
}

function animateGame() {
  if (!active) return;
  const movement = difficulty === "easy" ? 5.5 : difficulty === "normal" ? 7 : 8.5;
  if (keys.left) canX -= movement;
  if (keys.right) canX += movement;
  canX = Math.max(4, Math.min(playArea.clientWidth - 92, canX));
  canElement.style.left = `${canX}px`;

  const canRect = canElement.getBoundingClientRect();
  playArea.querySelectorAll(".rain-drop, .falling-can").forEach((item) => {
    const y = Number.parseFloat(item.style.top) + Number.parseFloat(item.dataset.speed);
    item.style.top = `${y}px`;
    const itemRect = item.getBoundingClientRect();

    const caught = itemRect.left < canRect.right &&
      itemRect.right > canRect.left &&
      itemRect.top < canRect.bottom &&
      itemRect.bottom > canRect.top;

    if (caught) {
      if (item.dataset.can === "true") loseLife("Trash hit the bucket! One life lost");
      else {
        collectDrop();
        canElement.classList.add("catch");
        window.setTimeout(() => canElement.classList.remove("catch"), 180);
      }
      item.remove();
      return;
    }

      if (y > playArea.clientHeight + 20) {
      item.remove();
    }
  });

  animationId = requestAnimationFrame(animateGame);
}

function resetGame() {
  active = false;
  clearInterval(timerId);
  clearInterval(spawnId);
  cancelAnimationFrame(animationId);
  clearGameElements();
  score = 0;
  forceCleanDrop = false;
  lives = modes[difficulty].lives;
  secondsLeft = modes[difficulty].time;
  timeElement.textContent = `${secondsLeft}s`;
  keys.left = false;
  keys.right = false;
  announcedMilestones.clear();
  scoreElement.textContent = "0";
  updateLives();
  goalElement.textContent = modes[difficulty].goal;
  gameShell.classList.remove("game-running");
  startOverlay.classList.remove("hidden", "celebration");
  overlayText.textContent = "Move the yellow bucket to catch clean water";
  milestoneElement.textContent = `${difficulty[0].toUpperCase()}${difficulty.slice(1)} mode ready`;
  startButton.textContent = "Start quest";
  playTone(330, 0.05);
}

function finishGame(won) {
  if (!active) return;
  active = false;
  clearInterval(timerId);
  clearInterval(spawnId);
  cancelAnimationFrame(animationId);
  clearGameElements();

  startOverlay.classList.remove("hidden");
  gameShell.classList.remove("game-running");
  if (won) {
    overlayText.textContent = "Mission complete! You collected enough clean water.";
    milestoneElement.textContent = "Water goal reached!";
    startOverlay.classList.add("celebration");
    playTone(660, 0.12, "sine");
    window.setTimeout(() => playTone(880, 0.18, "sine"), 130);
  } else {
    startOverlay.classList.remove("celebration");
    if (score > highScore) {
      highScore = score;
      localStorage.setItem("waterCatcherHighScore", String(highScore));
    }
    const reason = lives <= 0 ? "All lives used" : "Time ran out";
    overlayText.textContent = `Game over. Score: ${score} · High score: ${highScore}`;
    milestoneElement.textContent = `${reason}. Try for a new high score`;
    playTone(180, 0.22, "triangle");
  }
  startButton.textContent = "Play again";
}

document.querySelectorAll(".difficulty-button").forEach((button) => {
  button.addEventListener("click", () => setDifficulty(button.dataset.difficulty));
});

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") keys.left = true;
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") keys.right = true;
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") keys.left = false;
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") keys.right = false;
});

playArea.addEventListener("pointermove", (event) => {
  if (!active || !canElement) return;
  const bounds = playArea.getBoundingClientRect();
  canX = Math.max(4, Math.min(playArea.clientWidth - 92, event.clientX - bounds.left - 44));
  canElement.style.left = `${canX}px`;
});

startButton.addEventListener("click", startGame);

document.getElementById("resetButton").addEventListener("click", resetGame);

const leftButton = document.getElementById("leftButton");
const rightButton = document.getElementById("rightButton");
leftButton.addEventListener("pointerdown", () => { keys.left = true; });
rightButton.addEventListener("pointerdown", () => { keys.right = true; });
[leftButton, rightButton].forEach((button) => {
  button.addEventListener("pointerup", () => { keys.left = false; keys.right = false; });
  button.addEventListener("pointercancel", () => { keys.left = false; keys.right = false; });
  button.addEventListener("pointerleave", () => { keys.left = false; keys.right = false; });
});

soundButton.addEventListener("click", () => {
  muted = !muted;
  soundIcon.textContent = muted ? "×" : "♪";
  soundButton.setAttribute("aria-label", muted ? "Turn sound on" : "Mute sound");
  soundButton.title = muted ? "Turn sound on" : "Mute sound";
  if (!muted) playTone(440, 0.06);
});

setDifficulty("easy");
