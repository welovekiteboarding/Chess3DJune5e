# Human Interaction

## Purpose

This document describes the Wave 2 human chess interaction behavior for
`Chess3DJune5e`. It focuses on the local browser-side flow for rendering the
position, selecting a piece, exposing legal destinations, applying a legal
human move, and completing promotion.

## MVP Boundary

Wave 2 keeps this interaction loop local to the browser and does not add:

- login
- authentication
- a database
- a backend service
- persistence or saved games
- routing
- multiplayer

The Wave 2 contract documented here stops after the human-side interaction has
updated local game state. Stockfish gameplay response behavior is deferred to
Wave 3 documentation as a separate concern. For accuracy, the current app
already contains local engine-turn handling in `src/app/App.tsx`, and the
broader human-vs-AI runtime is described in `docs/architecture.md`.

## FEN-Derived Piece Rendering

The rendered board position comes from the current FEN stored in the Zustand
game store.

- `src/game/gameStore.ts` stores the position as `currentFen`.
- `src/app/App.tsx` reads `currentFen` and derives `piecePlacements` with
  `getPiecePlacementsFromFen(currentFen)`.
- `src/chess/chessRules.ts` parses the FEN placement segment into square-by-
  square piece placements.
- `src/scene/BoardScene.tsx` renders the board from those derived
  `piecePlacements`.

Because rendering is derived from FEN, any legal move that updates `currentFen`
also updates the next rendered piece layout.

## Click-To-Select

Human interaction starts with a click on a board square or piece.

- `BoardScene` calls `onSquareSelect(square)` when a square or piece is
  clicked.
- `App.tsx` routes that click through `handleSquareSelect`.
- If the click is a fresh selection, `handleSquareSelect` calls
  `selectSquare(square)` in `src/game/gameStore.ts`.

`selectSquare(square)` only keeps the selection when all of the following are
true:

- no promotion choice is already pending
- it is the human side's turn
- the clicked square has at least one legal move

When selection succeeds, the store records:

- `selectedSquare`
- `legalDestinationSquares`

Clicking the already selected square clears the selection and removes the legal
destination highlights.

## Click-To-Move

After a piece has been selected, the human completes a move by clicking one of
the exposed legal destination squares.

- `App.tsx` checks whether the clicked square is included in
  `legalDestinationSquares`.
- If it is, `attemptHumanMove(destination)` is called.
- `src/game/gameStore.ts` validates that it is still the human side's turn and
  then applies the move through the chess rules wrapper.
- `src/chess/chessRules.ts` uses chess.js-backed move validation and returns the
  resulting FEN and UCI move.

A legal human move updates local state by:

- replacing `currentFen`
- appending a `human` entry to `moveHistory`
- clearing `selectedSquare`
- clearing `legalDestinationSquares`
- recalculating side-to-move and game-status labels

This keeps the board, move list, and status panel in sync with the newly
applied position.

## Legal Move Highlighting

Legal move highlighting is driven by the same store state that powers
selection.

- `selectSquare(square)` computes legal moves for the selected piece.
- The destination squares are stored in `legalDestinationSquares`.
- `BoardScene.tsx` renders the selected square with its own highlight color.
- `BoardScene.tsx` renders legal destination squares with a separate highlight
  color.

The hidden fallback board markup in `BoardScene.tsx` mirrors the same
information through `data-selected`, `data-legal-destination`, and piece
placement attributes for tests and non-visual interaction.

## Promotion Handling

Pawn promotion is handled through a pending promotion state plus a simple
promotion UI.

- If a human move reaches the back rank and no promotion piece has been chosen,
  `attemptHumanMove(...)` does not apply the move immediately.
- Instead, the store clears the active selection and creates
  `pendingPromotion`.
- `pendingPromotion` records the source square, destination square, and allowed
  choices.
- `App.tsx` renders `src/ui/PromotionDialog.tsx` whenever
  `pendingPromotion` exists.

The promotion UI is intentionally simple:

- one button per promotion choice
- one cancel action

When the player chooses a piece, `completePendingPromotion(piece)` applies the
move, updates FEN, appends the move to history, and clears the pending
promotion state. If the player cancels, the pending promotion state is cleared
without changing the position.

## Wave 2 Scope Summary

Wave 2 covers these human interaction responsibilities:

- render pieces from FEN-derived placements
- let the human click to select a movable piece
- let the human click a highlighted destination to move
- show legal destinations for the selected piece
- update FEN and move history after a legal human move
- complete promotion through pending promotion state and a simple UI

Wave 2 does not expand the MVP boundary beyond the local browser app. There is
no login, no authentication, no database, no backend, no persistence, no
routing, and no multiplayer in this interaction scope.
