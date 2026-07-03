# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A single-page Tetris implementation in vanilla JavaScript, HTML5 Canvas, and CSS. No dependencies, no build step, no package.json.

## Running / testing

There is no build or test tooling. To run the game, open `index.html` directly in a browser, or serve it statically:

```bash
python3 -m http.server 8000
# or
npx serve .
```

There are no automated tests, linters, or CI. Verify changes by opening the page and playing (see the `run` skill / manually exercise movement, rotation, line clears, pause, and game over).

## Architecture

Three files, no modules/bundler — `game.js` is loaded as a single classic `<script>` tag, so all functions and the `let` state variables at the top live in one global scope.

- **`index.html`** — DOM shell: the main `#board` canvas (300×600, i.e. `COLS(10) × BLOCK(30)` by `ROWS(20) × BLOCK(30)`), a `#next-canvas` preview, HUD spans (`#score`, `#lines`, `#level`), and the `#overlay` used for both pause and game-over states.
- **`style.css`** — dark/retro arcade visual theme only.
- **`game.js`** — all game logic, organized around this flow:
  - `init()` creates the board, seeds `next`, calls `spawn()`, and starts `requestAnimationFrame(loop)`.
  - `loop(ts)` accumulates elapsed time and drops the current piece by one row once `dropAccum >= dropInterval`, otherwise calls `lockPiece()` if the piece can't move down further; then redraws every frame.
  - Board state is a `ROWS × COLS` matrix (`board`) where each cell is `0` (empty) or a piece-color index `1–7`.
  - Pieces (`PIECES`) are small square matrices; `rotateCW` rotates via transpose+reverse. `tryRotate` applies this and, on collision, attempts wall kicks at offsets `[0, -1, 1, -2, 2]` before giving up.
  - `collide(shape, ox, oy)` is the single source of truth for both boundary and stack collision checks — used by movement, rotation, ghost-piece projection, and spawn (game-over detection).
  - `clearLines()` scans bottom-up, splices full rows out and unshifts empty ones in, then updates score/level/`dropInterval` via `updateHUD()`.
  - Scoring: `LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by `level`; hard drop adds 2 points/row dropped, soft drop adds 1 point/row.
  - Level increases every 10 lines; `dropInterval = max(100, 1000 - (level-1)*90)` ms.
  - Ghost piece (`ghostY`) projects the current piece straight down to its landing row and is drawn at `globalAlpha = 0.2`.
  - Input is a single `keydown` listener mapping arrow keys / `X` (rotate) / `Space` (hard drop, with `preventDefault` to stop page scroll) / `P` (pause, handled before the paused/gameOver guard so it always works).

## Tunable constants (top of `game.js`)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, initial `dropInterval`. If you change `COLS`/`ROWS`/`BLOCK`, update the `#board` canvas `width`/`height` in `index.html` to match (`COLS×BLOCK` by `ROWS×BLOCK`).
