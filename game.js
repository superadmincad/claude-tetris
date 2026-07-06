'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

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
const MAX_HIGHSCORES = 5;
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
const themeToggle = document.getElementById('theme-toggle');
const startScreen = document.getElementById('start-screen');
const playBtn = document.getElementById('play-btn');
const highscoreForm = document.getElementById('highscore-form');
const playerNameInput = document.getElementById('player-name');
const saveScoreBtn = document.getElementById('save-score-btn');
const highscorePanel = document.getElementById('highscore-panel');
const highscoreBody = document.getElementById('highscore-body');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const startHighscoreBody = document.getElementById('start-highscore-body');
const startResetScoresBtn = document.getElementById('start-reset-scores-btn');

let board, current, next, hold, holdUsed, score, lines, level, combo, maxCombo, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let pendingHighscoreEntry = null;

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
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    updateHUD();
  }
  return cleared;
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
  if (!cleared) combo = 0;
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
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
  if (hold === null) return;
  const shape = PIECES[hold];
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  const alpha = holdUsed ? 0.35 : 1;
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(holdCtx, offX + c, offY + r, shape[r][c], NB, alpha);
}

function loadHighscores() {
  try {
    const raw = JSON.parse(localStorage.getItem(HIGHSCORES_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveHighscores(list) {
  localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(list));
}

function qualifiesForHighscore(scoreValue) {
  if (scoreValue <= 0) return false;
  const list = loadHighscores();
  if (list.length < MAX_HIGHSCORES) return true;
  return scoreValue > list[list.length - 1].score;
}

function addHighscore(entry) {
  const list = loadHighscores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  list.splice(MAX_HIGHSCORES);
  saveHighscores(list);
  return list;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderHighscoreTable(tbody, list, highlightIdx) {
  tbody.innerHTML = '';
  if (!list.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'highscore-empty';
    td.textContent = 'Sin récords todavía';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  list.forEach((entry, i) => {
    const tr = document.createElement('tr');
    if (i === highlightIdx) tr.classList.add('highscore-new');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${escapeHtml(entry.name)}</td>
      <td>${entry.score.toLocaleString()}</td>
      <td>${entry.lines}</td>
      <td>${entry.combo}</td>
      <td>${entry.date}</td>
    `;
    tbody.appendChild(tr);
  });
}

function refreshHighscoreTables(highlightIdx) {
  const list = loadHighscores();
  renderHighscoreTable(highscoreBody, list, highlightIdx ?? -1);
  renderHighscoreTable(startHighscoreBody, list, -1);
}

function saveHighscoreEntry() {
  if (!pendingHighscoreEntry) return;
  const name = playerNameInput.value.trim().slice(0, 12) || 'Anónimo';
  const entry = { name, ...pendingHighscoreEntry };
  const list = addHighscore(entry);
  const idx = list.indexOf(entry);
  pendingHighscoreEntry = null;
  highscoreForm.classList.add('hidden');
  highscorePanel.classList.remove('hidden');
  restartBtn.classList.remove('hidden');
  refreshHighscoreTables(idx);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;

  if (qualifiesForHighscore(score)) {
    pendingHighscoreEntry = {
      score,
      lines,
      combo: maxCombo,
      date: new Date().toLocaleDateString('es-ES'),
    };
    playerNameInput.value = '';
    highscoreForm.classList.remove('hidden');
    highscorePanel.classList.add('hidden');
    restartBtn.classList.add('hidden');
    overlay.classList.remove('hidden');
    setTimeout(() => playerNameInput.focus(), 0);
  } else {
    pendingHighscoreEntry = null;
    highscoreForm.classList.add('hidden');
    highscorePanel.classList.remove('hidden');
    restartBtn.classList.remove('hidden');
    refreshHighscoreTables(-1);
    overlay.classList.remove('hidden');
  }
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    highscoreForm.classList.add('hidden');
    highscorePanel.classList.add('hidden');
    overlay.classList.remove('hidden');
  }
}

function applyTheme(name) {
  theme = name;
  document.body.classList.toggle('light-theme', theme === 'light');
  themeToggle.textContent = theme === 'light' ? '☀️' : '🌙';
  themeToggle.setAttribute('aria-pressed', theme === 'light');
  localStorage.setItem(THEME_KEY, theme);
  if (current) draw();
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
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
  level = 1;
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  hold = null;
  holdUsed = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  restartBtn.classList.remove('hidden');
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (!current) return; // game hasn't started yet (still on the welcome screen)
  if (e.code === 'KeyP') { togglePause(); return; }
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
themeToggle.addEventListener('click', () => applyTheme(theme === 'dark' ? 'light' : 'dark'));

playBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  init();
});

saveScoreBtn.addEventListener('click', saveHighscoreEntry);
playerNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') saveHighscoreEntry();
});

function resetHighscores() {
  localStorage.removeItem(HIGHSCORES_KEY);
  refreshHighscoreTables(-1);
}

resetScoresBtn.addEventListener('click', resetHighscores);
startResetScoresBtn.addEventListener('click', resetHighscores);

initTheme();
refreshHighscoreTables(-1);
