# Human Interaction

## Purpose

This document describes the Wave 2 human chess interaction behavior for
`Chess3DJune5e`. It covers how the local browser UI renders pieces from the
current FEN position, how a human selects and moves pieces, how legal
destinations are exposed, and how pawn promotion is completed.

## MVP Boundary

Wave 2 keeps the interaction loop local to the browser. This behavior does
not add:

- login
- authentication
- a database
- a backend service
- persistence or saved games
- routing
- multiplayer

The documented Wave 2 interaction contract ends with local human move handling.
Real Stockfish gameplay response behavior is deferred to Wave 3.

## FEN-Derived Piece Rendering

The board position is derived from `currentFen` in the Zustand game store in
`src/game/gameStore.ts`.

- `src/chess/chessRules.ts` exposes `getPiecePlacementsFromFen(fen)`.
- `src/app/App.tsx` reads `currentFen` from the store and converts it into
  `piecePlacements`.
- `src/scene/BoardScene.tsx` renders the board from those derived
  `piecePlacements`.

This means the rendered piece layout is a direct view of the current FEN state.
When the FEN changes after a legal move, the next render reflects the updated
position.

## Click-To-Select

Human interaction starts with square selection.

- `BoardScene` sends square clicks to `App` through `onSquareSelect`.
- `App` forwards selection requests to the store.
- `selectSquare(square)` in `src/game/gameStore.ts` only selects a square when
  it is the human side to move and that square has at least one legal move.

When a piece is selected, the store records:

- `selectedSquare`
- `legalDestinationSquares`

Clicking the already selected square clears the current selection and removes
its destination highlights.

## Click-To-Move

After a piece has been selected, the human completes a move by clicking one of
the exposed legal destination squares.

- `App.tsx` checks whether the clicked square is included in
  `legalDestinationSquares`.
- If it is legal, `attemptHumanMove(destination)` is called.
- If the move is valid, the store applies it through the chess rules wrapper in
  `src/chess/chessRules.ts`.

A legal human move updates the local game state by:

- replacing `currentFen` with the new FEN
- appending a human move entry to `moveHistory`
- clearing `selectedSquare`
- clearing `legalDestinationSquares`
- recalculating side-to-move and game-status labels

Move history is stored as local records with the player and UCI move string,
then rendered in `src/ui/GamePanel.tsx`.

## Legal Move Highlighting

Legal move highlighting is driven by the same store state used for selection.

- `selectSquare(square)` computes legal moves with `getLegalMoves(...)`.
- The destination squares are stored in `legalDestinationSquares`.
- `BoardScene.tsx` colors the selected square differently from normal board
  squares.
- `BoardScene.tsx` colors legal destination squares differently from normal
  board squares.

The 3D scene therefore exposes the current selection and every legal landing
square for that selected piece. `BoardScene` also mirrors this information in
its accessible fallback markup for tests and non-visual interaction.

## Promotion Handling

Pawn promotion uses a pending promotion step instead of auto-promoting.

- When the selected move requires promotion and no promotion piece has been
  chosen yet, `attemptHumanMove(...)` does not apply the move immediately.
- The store clears the active selection and creates `pendingPromotion` with the
  source square, the destination square, and the allowed promotion choices.
- `App.tsx` renders `src/ui/PromotionDialog.tsx` whenever
  `pendingPromotion` exists.

The promotion UI is intentionally simple:

- one button per allowed promotion piece
- a cancel action

When the human chooses a piece, `completePendingPromotion(piece)` applies the
move, updates FEN, appends the move to history, and clears the pending
promotion state. If the human cancels, the pending promotion state is cleared
without changing the position.

## Wave Boundary

Wave 2 documents the local human interaction path only:

- render the current board from FEN
- select a legal human piece
- show legal destinations
- apply a legal human move locally
- complete promotion through a pending promotion UI

Real Stockfish response behavior after the human move is deferred to Wave 3.
