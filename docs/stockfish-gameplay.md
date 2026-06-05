# Stockfish Gameplay

## Purpose

This document describes the Wave 3 Stockfish gameplay behavior for
`Chess3DJune5e`. It covers the local browser-side human-to-AI move loop, the
user-facing engine controls and states, the current browser smoke coverage,
and the high-level GPLv3 distribution considerations that apply when the app
is shipped with Stockfish.

## MVP Boundary

Wave 3 keeps Stockfish gameplay local to the browser and does not add:

- login
- authentication
- a database
- a backend service
- persistence or saved games
- routing
- multiplayer

The Stockfish integration documented here is still a local-first MVP. The
engine runs in the browser, game state lives in the local Zustand store, and a
page reload starts a fresh session.

## Default Auto-Play Contract

AI auto-play is on by default.

- `src/app/App.tsx` sets `autoRequestAiMoves = true` unless a caller overrides
  it.
- When the game is in a playable state and it is the AI side's turn, `App`
  automatically calls `requestAiMove()`.
- The auto-request guard only runs when there is no pending promotion, no
  active engine search, and no current engine error.

This means a normal legal human move does not require a second click to ask
for the Stockfish response. The app requests the response automatically.

## Human Move To Stockfish Response Loop

After a legal human move, the app follows this loop:

1. The human selects and completes a legal move on the board.
2. `src/game/gameStore.ts` applies that move through the chess rules layer and
   updates local FEN, move history, side to move, and status labels.
3. Control returns to `src/app/App.tsx`.
4. If it is now the AI side's turn and the game is still playable, `App`
   automatically calls `requestAiMove()`.
5. The store asks the Stockfish adapter for a best move for the current FEN.
6. When Stockfish responds, the returned AI move is applied back through the
   chess rules layer before the board state is updated.

This loop is local-only. There is no backend request and no remote move
service involved in the exchange.

## AI Move Validation

AI moves are validated through the chess rules layer before application.

- `requestAiMove()` receives a UCI move from the engine adapter.
- The store applies that move with `applyUciMove(...)`.
- `applyUciMove(...)` lives behind `src/chess/chessRules.ts`, which is the
  rules boundary for legal move handling and FEN updates.

Because the AI move still passes through the same chess rules boundary, the
app does not trust a raw Stockfish response blindly. If the move is malformed,
for the wrong position, or otherwise invalid, the position is not advanced and
the UI keeps the current board state while surfacing an error.

## AI Difficulty Behavior

The UI exposes a difficulty selector with three levels:

- `Easy`
- `Medium`
- `Hard`

The selected difficulty is stored in the local game store and sent to the
Stockfish adapter before each engine move request. The current implementation
maps difficulty to deterministic search depth settings:

- `easy` -> depth 6
- `medium` -> depth 10
- `hard` -> depth 14

Difficulty changes are local-only and are not persisted across page reloads.

## Thinking State And Cancellation

The UI exposes both the engine thinking state and cancellation behavior.

- While an AI move request is in flight, the store sets
  `isEngineThinking = true`.
- `src/ui/GamePanel.tsx` renders `Engine thinking` while the request is active.
- When no request is active, the panel renders `Engine idle`.
- While the engine is thinking, the panel shows a `Cancel AI move` button.

When the player cancels:

- the pending AI request is invalidated
- the thinking state is cleared
- the app calls the engine adapter's `cancelSearch()`
- the UI shows `AI move was cancelled. Retry AI move to continue.`

After a recoverable cancellation or engine-side failure on the AI turn, the
panel can expose `Retry AI move` so the human can continue without starting a
new game.

## Engine Error Handling

The UI exposes engine error messages through the control panel.

- `GamePanel` shows the latest engine error in an assertive alert region when
  an error exists.
- If the engine request fails, `isEngineThinking` is cleared so the UI does
  not remain stuck in a thinking state.
- If Stockfish returns an invalid move response, the app keeps the existing
  position and records the error instead of applying a bad move.
- If the engine returns a move for an unexpected FEN, the app rejects that
  response and reports the failure.

Examples of handled failures in the current code and tests include engine boot
failures, timeouts, invalid `bestmove` responses, and cancelled searches.

## Browser Smoke Coverage

Browser smoke testing now validates at least one human-to-AI exchange.

- `tests/browser/app-shell.smoke.spec.ts` opens the real browser app shell.
- The smoke test plays `e2e4` as the human move.
- The test then verifies that `Engine thinking` appears, that the human move is
  recorded, that an AI move is added to move history, and that the engine
  returns to `Engine idle`.

This gives the project a browser-level check that the human move to Stockfish
response loop works at least once in a real rendered session.

## Stockfish GPLv3 Distribution Considerations

Stockfish is distributed under GPLv3. At a high level, public distribution of
an app bundle or release artifact that includes Stockfish must preserve
appropriate license handling and satisfy the relevant GPL source-code and
notice obligations for the distributed engine.

For this project, that means public distribution should preserve appropriate
license handling and source-code obligations rather than treating Stockfish as
an unlicensed binary drop-in. This repo note is a high-level engineering
summary, not legal advice, so any public distribution plan should be reviewed
carefully before release.

## Scope Summary

Wave 3 Stockfish gameplay currently means:

- AI auto-play is on by default
- a legal human move automatically triggers a Stockfish response request
- AI moves are validated through the chess rules layer before application
- the UI exposes difficulty, thinking state, cancellation, retry, and engine
  error messaging
- browser smoke coverage validates one human-to-AI exchange
- the MVP remains local-only, with no auth, no backend, no database, no
  persistence, no routing, and no multiplayer
