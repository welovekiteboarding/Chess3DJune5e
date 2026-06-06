# Gameplay Reliability And Camera Usability

## Purpose

This document records the Wave 4A gameplay reliability and camera usability
contract for `Chess3DJune5e`.

It focuses on two things:

- preserving the human-to-Stockfish move loop after the first visible-board
  move
- preserving usable board camera controls without breaking chess interaction

## MVP Boundary

This work stays inside the local browser MVP and does not add:

- login
- authentication
- a database
- a backend service
- remote API calls
- persistence or saved games
- routing
- multiplayer

Game state still lives in the local browser session. If the page reloads, the
current game is lost.

## Wave 4A Scope

Wave 4A is about reliability and usability, not premium visual polish.

The goal is to make sure:

- the first legal human move still auto-requests the Stockfish reply
- stale transient input errors do not block normal play
- the camera can orbit and zoom without making the board unplayable
- the visible-board browser smoke path keeps proving that a human can move and
  Stockfish can answer in a real browser session

## Deferred To Wave 4B

Wave 4B owns professional visual polish. It is explicitly deferred here.

That deferred visual work includes:

- professional board materials
- procedural piece redesign
- lighting polish
- movement animations
- responsive visual polish

Wave 4A should not quietly absorb those larger presentation changes while it is
working on reliability and camera interaction.

## First-Move Auto-AI Reliability Bug

Manual testing found a reliability bug around the first visible-board move.

The failure mode was:

1. A stale transient input error could remain in UI state.
2. The human could then make a normal legal first move such as `e2e4`.
3. The board position would update for the human move.
4. The automatic Stockfish reply would not start because the old transient
   error was still treated like a live blocker.

The important detail is that this was not a rules failure and not an engine
failure. The human move itself succeeded. The bug was that stale input error
state incorrectly prevented normal auto-AI behavior after that successful move.

An example of the stale transient input state is a user-facing input error such
as `No square selected.` left over from an earlier interaction that no longer
describes the current board state.

## Intended Fix Behavior

After a successful legal human move:

- stale transient input errors must be cleared
- stale transient input error kinds must be cleared
- normal auto-AI must continue if it is now the AI side's turn

In practical terms, a successful visible-board human move must win over stale
input noise. The app must not require the user to retry the move, refresh the
page, or start a new game just because an older transient input error existed.

This is especially important on the first move because the app's default
gameplay contract is that a normal opening move immediately triggers the
Stockfish response.

## Visible-Board Human-To-Stockfish Smoke Contract

Future waves must preserve the browser smoke contract that proves the rendered
board still works in a real browser.

The contract is:

1. The local app shell renders with a visible board interaction surface.
2. The visible-board square hit targets are present and usable.
3. A human can make a real rendered move, not just a store-level or unit-test
   move.
4. After a legal human move such as `e2e4`, the board updates visibly.
5. Move history records the human move.
6. Stockfish automatically produces one reply.
7. Move history then records the AI move.
8. The engine returns to `Engine idle` after the reply resolves.
9. The AI move is visible on the board, not only in text.

This browser smoke contract is the minimum regression guard for future visual
and interaction work. If a later wave changes the board, camera, animation,
layout, or interaction surface, it must still preserve this human-to-Stockfish
proof path.

## Camera Controls

The board now exposes explicit camera controls in the board camera toolbar.

Available controls:

- `Rotate left`
- `Rotate right`
- `Tilt up`
- `Tilt down`
- `Zoom in`
- `Zoom out`
- `Overhead view`
- `Reset view`

For usability, these controls should be understood in two groups:

- orbit controls: rotate and tilt actions that change the viewing angle around
  the board
- zoom controls: `Zoom in` and `Zoom out`, which move the camera closer to or
  farther from the board

The status label reports whether the camera is in:

- `Default camera view`
- `Overhead camera view`
- `Custom camera view`

## Returning To A Default View

The current UI includes a `Reset view` control.

Use `Reset view` to return to the default camera angle after orbiting, tilting,
or zooming. Future changes should preserve this recovery path unless the team
intentionally replaces it with another equally clear reset-to-default control.

## Manual Test Checklist

### First-Move Auto-AI Reliability

Use this checklist in a real browser session:

1. Launch the local app and confirm the board is visible.
2. Confirm the status area starts in a normal ready state and that the game has
   not already advanced.
3. If a stale transient input error is present, keep note of it instead of
   refreshing immediately.
4. Make a normal legal first move from the visible board, for example `e2` to
   `e4`.
5. Confirm the human move appears on the board.
6. Confirm move history records `1. human e2e4` or the equivalent chosen move.
7. Confirm any stale transient input error is cleared after the successful
   human move.
8. Confirm Stockfish still auto-requests the first reply without extra user
   input.
9. Confirm the AI move is added to move history.
10. Confirm the AI move is visible on the board and the engine returns to
    `Engine idle`.

Expected result: a stale transient input error must not block normal auto-AI
after a successful human move.

### Camera Interaction Without Breaking Chess Interaction

Use this checklist in a real browser session:

1. Start from the default camera view.
2. Click `Overhead view` and confirm the camera state changes away from the
   default view.
3. Click `Zoom in` and confirm the camera enters a custom view.
4. Optionally use rotate and tilt controls to verify orbit interaction.
5. Click `Reset view` and confirm the camera returns to `Default camera view`.
6. After using camera controls, select a legal chess piece from the visible
   board.
7. Confirm legal destinations still appear for that selection.
8. Complete a legal move from the visible board.
9. Confirm the move applies correctly on the board and in move history.
10. If it is now the AI side's turn, confirm the normal Stockfish auto-reply
    flow still works.

Expected result: camera interaction must not break board hit targets, legal
move selection, move application, or the human-to-Stockfish gameplay loop.

## Regression Standard For Future Waves

Future waves may improve visuals, camera feel, animation, or layout, but they
must keep these core behaviors intact:

- successful human moves clear stale transient input blockers
- normal auto-AI still starts after a successful human move
- the visible-board browser smoke path still proves one human move and one
  Stockfish reply
- camera controls remain usable without breaking chess interaction
- the MVP remains local-only, with no auth, no backend, no database, no
  persistence, no routing, and no multiplayer
