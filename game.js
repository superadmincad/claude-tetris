'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const SKINS = {
  retro: {
    label: 'Retro',
    colors: ['#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#90caf9', '#ffb74d'],
    boardBg: null,
    glow: false,
    rounded: false,
    pixelPattern: false,
  },
  neon: {
    label: 'Neon',
    colors: ['#00e5ff', '#fff176', '#e040fb', '#69f0ae', '#ff1744', '#448aff', '#ff9100'],
    boardBg: '#000000',
    glow: true,
    rounded: false,
    pixelPattern: false,
  },
  pastel: {
    label: 'Pastel',
    colors: ['#a8dadc', '#fff1a8', '#d4a8e0', '#b8e0b0', '#f0a8a8', '#a8c4f0', '#f0c9a0'],
    boardBg: null,
    glow: false,
    rounded: true,
    pixelPattern: false,
  },
  pixel: {
    label: 'Pixel Art',
    colors: ['#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#90caf9', '#ffb74d'],
    boardBg: null,
    glow: false,
    rounded: false,
    pixelPattern: true,
  },
};

const SKIN_KEY = 'tetris-skin';
let skin = 'retro';
let COLORS = [null, ...SKINS[skin].colors];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const GRID_COLORS = { dark: '#22222e', light: '#d8d8e6' };
const THEME_KEY = 'tetris-theme';
const HIGHSCORES_KEY = 'tetris-highscores';
const STATS_KEY = 'tetris-stats';
const MAX_HIGH_SCORES = 5;
let theme = 'dark';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const startBtn = document.getElementById('start-btn');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const themeToggle = document.getElementById('theme-toggle');
const saveScoreRow = document.getElementById('save-score-row');
const playerNameInput = document.getElementById('player-name');
const saveScoreBtn = document.getElementById('save-score-btn');
const leaderboardSection = document.getElementById('leaderboard-section');
const leaderboardListEl = document.getElementById('leaderboard-list');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const pauseOverlay = document.getElementById('pause-overlay');
const pauseMainView = document.getElementById('pause-main-view');
const pauseControlsView = document.getElementById('pause-controls-view');
const resumeBtn = document.getElementById('resume-btn');
const restartPauseBtn = document.getElementById('restart-pause-btn');
const controlsBtn = document.getElementById('controls-btn');
const backControlsBtn = document.getElementById('back-controls-btn');
const startLevelSelect = document.getElementById('start-level-select');
const skinSelect = document.getElementById('skin-select');

let board, current, next, hold, holdUsed, score, lines, level, paused, gameOver, started, combo, sessionMaxCombo, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  return makePiece(Math.floor(Math.random() * 7) + 1);
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
}

function loadHighScores() {
  try {
    const raw = JSON.parse(localStorage.getItem(HIGHSCORES_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveHighScores(list) {
  localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(list));
}

function loadStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY));
    return raw && typeof raw === 'object' ? { bestCombo: raw.bestCombo || 0, maxLines: raw.maxLines || 0 } : { bestCombo: 0, maxLines: 0 };
  } catch {
    return { bestCombo: 0, maxLines: 0 };
  }
}

function saveStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function qualifiesForTop5(candidateScore) {
  if (candidateScore <= 0) return false;
  const scores = loadHighScores();
  return scores.length < MAX_HIGH_SCORES || candidateScore > scores[scores.length - 1].score;
}

function addHighScore(name, candidateScore, candidateLines, candidateLevel) {
  const scores = loadHighScores();
  const entry = { name: name || 'Jugador', score: candidateScore, lines: candidateLines, level: candidateLevel };
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  scores.length = Math.min(scores.length, MAX_HIGH_SCORES);
  saveHighScores(scores);
  return entry;
}

function renderLeaderboard(highlightEntry) {
  const scores = loadHighScores();
  leaderboardListEl.innerHTML = '';
  if (scores.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Sin récords todavía';
    leaderboardListEl.appendChild(li);
    return;
  }
  scores.forEach((entry, i) => {
    const li = document.createElement('li');
    if (highlightEntry && entry === highlightEntry) li.classList.add('highlight');
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `${i + 1}.`;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = entry.name;
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'score';
    scoreSpan.textContent = entry.score.toLocaleString();
    li.append(rank, name, scoreSpan);
    leaderboardListEl.appendChild(li);
  });
}

function renderStats() {
  const stats = loadStats();
  bestComboEl.textContent = stats.bestCombo;
  maxLinesEl.textContent = stats.maxLines;
}

function updateBests() {
  const stats = loadStats();
  let changed = false;
  if (sessionMaxCombo > stats.bestCombo) { stats.bestCombo = sessionMaxCombo; changed = true; }
  if (lines > stats.maxLines) { stats.maxLines = lines; changed = true; }
  if (changed) saveStats(stats);
  renderStats();
}

function resetRecords() {
  if (!confirm('¿Borrar la tabla de récords y las estadísticas?')) return;
  localStorage.removeItem(HIGHSCORES_KEY);
  localStorage.removeItem(STATS_KEY);
  renderLeaderboard();
  renderStats();
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  const cleared = clearLines();
  if (cleared > 0) {
    combo++;
    if (combo > sessionMaxCombo) sessionMaxCombo = combo;
  } else {
    combo = 0;
  }
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  holdUsed = false;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
  drawHold();
}

function holdPiece() {
  if (paused || gameOver || holdUsed) return;
  if (hold === null) {
    hold = current.type;
    spawn();
  } else {
    const swapped = current.type;
    current = makePiece(hold);
    hold = swapped;
    if (collide(current.shape, current.x, current.y)) {
      endGame();
    }
  }
  holdUsed = true;
  drawHold();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function roundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawPixelTexture(context, x, y, s) {
  const cell = s / 4;
  context.save();
  context.globalAlpha = 0.16;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      context.fillStyle = (i + j) % 2 === 0 ? '#000000' : '#ffffff';
      context.fillRect(x + i * cell, y + j * cell, cell, cell);
    }
  }
  context.restore();
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  const conf = SKINS[skin];
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;

  context.globalAlpha = alpha ?? 1;
  context.shadowBlur = conf.glow ? 12 : 0;
  context.shadowColor = conf.glow ? color : 'transparent';

  context.fillStyle = color;
  if (conf.rounded) {
    roundedRectPath(context, px, py, s, s, 6);
    context.fill();
  } else {
    context.fillRect(px, py, s, s);
  }

  if (conf.pixelPattern) {
    drawPixelTexture(context, px, py, s);
  }

  if (!conf.glow) {
    context.shadowBlur = 0;
    context.fillStyle = 'rgba(255,255,255,0.12)';
    if (conf.rounded) {
      roundedRectPath(context, px, py, s, 4, 2);
      context.fill();
    } else {
      context.fillRect(px, py, s, 4);
    }
  }

  context.shadowBlur = 0;
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = GRID_COLORS[theme];
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (SKINS[skin].boardBg) {
    ctx.fillStyle = SKINS[skin].boardBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (SKINS[skin].boardBg) {
    nextCtx.fillStyle = SKINS[skin].boardBg;
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  }
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function drawHold() {
  const NB = 30;
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (SKINS[skin].boardBg) {
    holdCtx.fillStyle = SKINS[skin].boardBg;
    holdCtx.fillRect(0, 0, holdCanvas.width, holdCanvas.height);
  }
  if (hold === null) return;
  const shape = PIECES[hold];
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  const alpha = holdUsed ? 0.35 : 1;
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(holdCtx, offX + c, offY + r, shape[r][c], NB, alpha);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  updateBests();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  startBtn.classList.add('hidden');
  restartBtn.classList.remove('hidden');
  resetScoresBtn.classList.remove('hidden');
  leaderboardSection.classList.remove('hidden');
  if (qualifiesForTop5(score)) {
    saveScoreRow.classList.remove('hidden');
    playerNameInput.value = '';
  } else {
    saveScoreRow.classList.add('hidden');
  }
  renderLeaderboard(null);
  overlay.classList.remove('hidden');
  if (!saveScoreRow.classList.contains('hidden')) playerNameInput.focus();
}

function handleSaveScore() {
  const entry = addHighScore(playerNameInput.value.trim(), score, lines, level);
  saveScoreRow.classList.add('hidden');
  renderLeaderboard(entry);
}

function showStartOverlay() {
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  saveScoreRow.classList.add('hidden');
  leaderboardSection.classList.remove('hidden');
  startBtn.classList.remove('hidden');
  restartBtn.classList.add('hidden');
  resetScoresBtn.classList.remove('hidden');
  renderLeaderboard(null);
  renderStats();
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver || !started) return;
  paused = !paused;
  if (!paused) {
    hidePauseMenu();
    lastTime = performance.now();
    loop(lastTime);
    overlay.classList.add('hidden');
  } else {
    cancelAnimationFrame(animId);
    showPauseMenu();
  }
}

function showPauseMenu() {
  pauseControlsView.classList.add('hidden');
  pauseMainView.classList.remove('hidden');
  pauseOverlay.classList.remove('hidden');
}

function hidePauseMenu() {
  pauseOverlay.classList.add('hidden');
}

function applyTheme(name) {
  theme = name;
  document.body.classList.toggle('light-theme', theme === 'light');
  themeToggle.textContent = theme === 'light' ? '☀️' : '🌙';
  themeToggle.setAttribute('aria-pressed', theme === 'light');
  localStorage.setItem(THEME_KEY, theme);
  draw();
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

function applySkin(name) {
  skin = SKINS[name] ? name : 'retro';
  COLORS = [null, ...SKINS[skin].colors];
  localStorage.setItem(SKIN_KEY, skin);
  skinSelect.value = skin;
  draw();
  drawNext();
  drawHold();
}

function initSkin() {
  const saved = localStorage.getItem(SKIN_KEY);
  applySkin(SKINS[saved] ? saved : 'retro');
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = Number(startLevelSelect.value) || 1;
  paused = false;
  gameOver = false;
  started = true;
  combo = 0;
  sessionMaxCombo = 0;
  hold = null;
  holdUsed = false;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  hidePauseMenu();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (!started) return;
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      holdPiece();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
startBtn.addEventListener('click', init);
saveScoreBtn.addEventListener('click', handleSaveScore);
playerNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') handleSaveScore();
});
resetScoresBtn.addEventListener('click', resetRecords);
themeToggle.addEventListener('click', () => applyTheme(theme === 'dark' ? 'light' : 'dark'));
skinSelect.addEventListener('change', () => applySkin(skinSelect.value));

resumeBtn.addEventListener('click', () => { if (paused) togglePause(); });
restartPauseBtn.addEventListener('click', () => {
  paused = false;
  init();
});
controlsBtn.addEventListener('click', () => {
  pauseMainView.classList.add('hidden');
  pauseControlsView.classList.remove('hidden');
});
backControlsBtn.addEventListener('click', () => {
  pauseControlsView.classList.add('hidden');
  pauseMainView.classList.remove('hidden');
});

started = false;
initTheme();
initSkin();
showStartOverlay();
