# Camera Geometry Fixes

## Purpose

This document records the Wave 4C camera and geometry contract for
`Chess3DJune5e`.

The goal of this docs-only task is to describe the intended board geometry and
camera behavior clearly enough that future UI work preserves the current
playable chess surface.

## Scope Of This Issue

This Linear issue is documentation-only.

It records the intended camera and geometry behavior for future implementation
and review work, but it does not broaden this issue into application code,
test, asset, backend, or product-scope changes.

## MVP Boundary

This remains a local browser MVP. The camera and geometry fixes do not add:

- auth or login
- backend behavior or remote API calls
- a database
- persistence or saved games
- routing
- multiplayer

If the page reloads, the current game is still lost. This document describes
camera and board interaction behavior only.

## Geometry Contract

### Pieces Must Stay Grounded

Every chess piece must remain grounded on the board surface instead of floating
above it or sinking into it.

The grounding rule is:

- the board surface is the piece contact plane
- each piece uses a base-at-surface grounding convention
- the visible result should be that every piece looks planted on its square

This matters because even a small vertical mismatch makes the board feel
incorrect and reduces move readability.

### The Board Must Stay Flat Like A Table

The chessboard is a flat tabletop play surface. Camera changes must not turn
the board itself into a tilted or warped object.

The intended visual model is:

- the board stays level in world space
- world up remains vertical
- camera motion changes the viewer position around the board, not the board's
  own flat-table geometry

In practical terms, the user should feel like they are walking around a chess
table, not picking the table up and twisting it.

## Camera Orbit Contract

### Left And Right Rotation

`Rotate left` and `Rotate right` must orbit the camera around the board using
the vertical or world-up axis.

The expected behavior is:

- horizontal rotation changes the camera azimuth
- the board remains flat while the camera moves around it
- left and right actions should feel like circling the table

### Unlimited Horizontal Rotation

Horizontal orbit should remain unbounded through repeated full turns.

That means:

- azimuth is not clamped to a short range
- the player can keep rotating past `360` degrees
- repeated left or right rotation should continue smoothly instead of snapping
  back or stopping at one lap

This is important for orientation recovery and for checking the board from any
side without artificial limits.

### Bounded Tilt Or Polar Angle

Tilt may remain bounded.

The current useful contract is:

- vertical tilt is controlled through the camera polar angle
- tilt should stay inside a safe playability range instead of flipping under
  the board
- the current bounded range is `0.1` to `1.36` radians

Bounded tilt is acceptable because it prevents unusable underside or near-flip
views while still allowing a strong overhead angle.

## Zoom Contract

Zoom should work from multiple common input devices:

- mouse wheel
- Apple Magic Mouse scroll gestures
- trackpad scroll gestures
- the existing `Zoom in` and `Zoom out` buttons

The zoom interaction should feel useful across a broader operating range than a
very tight default-only camera.

The current useful zoom contract is:

- zoom changes camera distance rather than changing the board geometry
- zoom remains bounded to avoid clipping into the scene or drifting so far away
  that play becomes impractical
- the current bounded distance range is `3.6` to `24`

This extended min/max range should let a player:

- zoom in close enough to inspect piece placement and square selection
- zoom out far enough to re-establish board context
- keep the board visible and playable throughout the zoom range

## Recovery Views

Two recovery actions are part of the usability contract:

- `Reset view` returns the camera to the default playable perspective
- `Overhead view` returns the camera to a top-down or near-top-down inspection
  view

These controls matter because camera experimentation should always have a clear
way back to a known readable angle.

## Manual Test Checklist

Use these checks in a real browser session.

### Piece Grounding

1. Open the app and confirm the board is visible.
2. Inspect several white and black pieces from the default view.
3. Rotate and zoom the camera to inspect piece bases more closely.
4. Confirm every piece appears to rest on the board surface.
5. Confirm no piece visibly floats above its square.
6. Confirm no piece visibly sinks into the board.

Expected result: pieces stay grounded on the board surface from all normal
views.

### Flat-Board Orbit

1. Start from the default view.
2. Click `Rotate left` several times.
3. Click `Rotate right` several times.
4. Confirm the camera moves around the board instead of tilting the board
   itself.
5. Confirm the board still reads like a flat table surface.

Expected result: left and right rotation orbits the camera around the world-up
axis while the board remains flat.

### Unlimited Horizontal Rotation

1. Start from the default view.
2. Keep rotating in one direction through more than one full turn.
3. Continue rotating until you have clearly passed `360` degrees.
4. Reverse direction and rotate again.
5. Confirm the motion continues without a hard stop or one-lap clamp.

Expected result: horizontal orbit remains usable through repeated full
rotations.

### Wheel, Magic Mouse, And Trackpad Zoom

1. Start from the default view.
2. Use a mouse wheel to zoom in and out, if available.
3. Use Apple Magic Mouse scrolling to zoom in and out, if available.
4. Use trackpad scrolling to zoom in and out, if available.
5. Confirm `Zoom in` and `Zoom out` buttons still work as a fallback path.
6. Confirm the board stays visible across the useful zoom range.
7. Confirm zoom can get meaningfully closer and farther than the default view
   without becoming unusable.

Expected result: wheel and scroll-based zoom inputs update camera distance
reliably across the extended `3.6` to `24` range.

### Reset View

1. Rotate, tilt, and zoom away from the default view.
2. Click `Reset view`.
3. Confirm the board returns to the normal default camera angle.
4. Confirm the camera status returns to the default-view state.

Expected result: `Reset view` reliably restores the main playable camera.

### Overhead View

1. Start from the default view.
2. Click `Overhead view`.
3. Confirm the camera moves to a top-down or near-top-down board inspection
   angle.
4. Confirm the board remains visible and readable.

Expected result: `Overhead view` provides a clear top-down recovery view.

### Visible-Board Human To Stockfish Gameplay After Rotate/Zoom

1. Rotate, tilt, or zoom away from the default view.
2. Make a legal visible-board move such as `e2` to `e4`.
3. Confirm the moved piece lands on the correct square and remains grounded.
4. Confirm the board is still readable after the camera change.
5. Confirm move history records the human move.
6. Confirm Stockfish produces one reply.
7. Confirm the Stockfish move is visible on the board.
8. Confirm the board remains usable after both moves.

Expected result: camera changes do not break visible-board human-to-Stockfish
gameplay.

## Deferred Work

This task is documentation for camera and geometry behavior, not a broader
visual overhaul.

The following remain explicitly deferred:

- professional board materials
- professional visual polish
- lighting polish
- movement animations
- sound
- external GLTF assets

The following product areas also remain outside this MVP:

- backend behavior
- auth
- database
- persistence
- routing
- multiplayer

Future polish work may improve the presentation, but it must preserve the core
camera and geometry rules in this document: grounded pieces, a flat board,
world-up orbit, unbounded horizontal rotation, bounded tilt, useful zoom, and
playable human-to-Stockfish interaction after camera changes.
