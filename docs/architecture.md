# Chess3DJune5e Architecture

## MVP summary

`Chess3DJune5e` Wave 1 is a local-first human-vs-AI chess MVP. It runs as a
React and Vite web app in the browser and lets one human player play against a
local Stockfish engine through a 3D board interface.

This MVP does not include:

- login
- authentication
- a database
- a backend service
- API calls to a remote server
- saved games or any other persistence

The current architecture is intentionally local-only so the team can validate
the game loop, UI shell, move rules, and engine integration before adding any
networked or account-based features.

## Architecture overview

The app is composed of a small set of local modules:

- `src/main.tsx` boots the React application and mounts the app shell.
- `src/app/App.tsx` is the top-level app shell. It creates the Stockfish worker,
  creates the Zustand game store, wires the board scene and control panel
  together, and automatically requests AI moves when it is the engine's turn.
- `src/chess/chessRules.ts` is the chess.js rules wrapper. It owns FEN loading,
  legal move generation, UCI move application, turn detection, and game-status
  calculation while keeping the rest of the app isolated from direct chess.js
  usage.
- `src/game/gameStore.ts` is the Zustand game store. It is the main state
  coordinator for current FEN, selected square, legal destinations, move
  history, AI difficulty, engine status, and user-facing error state.
- `src/engine/stockfishEngine.ts` is the Stockfish engine adapter. It manages
  transport lifecycle, UCI initialization, search requests, difficulty-based
  search depth, cancellation, and disposal.
- `src/engine/stockfishProtocol.ts` is the Stockfish UCI protocol parser. It
  parses `uciok`, `readyok`, `bestmove`, and `info` lines into typed data the
  engine adapter can consume safely.
- `src/scene/BoardScene.tsx` is the React Three Fiber board scene. It renders
  the 3D board, highlighted squares, simple piece markers, and a hidden
  accessible fallback grid for testing and non-visual interaction.
- `src/ui/GamePanel.tsx` is the local game control panel. It shows status, side
  to move, human and AI sides, engine activity, latest error, AI difficulty,
  new-game controls, and move history.

## Runtime flow

The runtime loop for a normal move looks like this:

1. The user clicks a square in `BoardScene`.
2. `App` forwards that interaction to the Zustand store.
3. `gameStore` asks `chessRules` for legal moves or applies the selected move.
4. The store updates FEN, move history, legal targets, selection state, and
   game status.
5. When it becomes the AI side's turn, `App` triggers `requestAiMove()`.
6. The Stockfish adapter sends UCI commands to the local worker and waits for a
   parsed `bestmove` response.
7. The store applies the returned UCI move through the chess rules wrapper and
   publishes the updated state back to the UI.

## Local-only boundaries

Wave 1 keeps all behavior inside the browser process:

- No user accounts exist.
- No auth tokens or sessions exist.
- No server-side move validation exists.
- No remote engine service exists.
- No database tables or storage layers exist.
- No local persistence has been added for settings, history, or saved games.

If the page reloads, the current game state is lost and a fresh local session
starts again.

## Stockfish licensing

The MVP depends on Stockfish for local AI play. Stockfish is distributed under
GPLv3. If this project is distributed publicly with Stockfish, the release must
include appropriate GPL license handling and satisfy the license's source-code
and notice obligations for the distributed engine and any required
corresponding source. This document is a project note, not legal advice, so
public releases should be reviewed carefully before distribution.

## Local development commands

Developers working on this MVP should use these local commands from the repo
root:

```bash
npm install
npm run lint
npm run build
npm run test -- --run
```

Useful during active UI development:

```bash
npm run dev
```
