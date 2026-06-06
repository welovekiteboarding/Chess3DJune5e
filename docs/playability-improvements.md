# Playability Improvements

## Purpose

This document records the Wave 4B playability improvements for
`Chess3DJune5e`.

The goal of this wave is to make the current local-first MVP easier to play and
easier to read without drifting into final professional art polish. The work is
about playability, containment, and clarity:

- smoother and more recoverable camera control behavior
- a contained board-and-panel layout that stays readable
- move history that scrolls inside the controls panel instead of pushing the
  whole page around
- simplified but distinct piece identities that let a human recognize every
  piece type during play

## MVP Boundary

This remains a local browser MVP. Wave 4B does not add:

- auth or login
- a backend service
- remote API behavior
- a database
- persistence or saved games
- routing
- multiplayer

This wave also intentionally avoids:

- final professional art polish
- external GLTF piece or board assets
- sound
- complex animations

If the page reloads, the current game is still lost. The document should be
read as a playability pass on the existing MVP, not as a feature expansion into
account, storage, or server-backed behavior.

## Camera Control Improvements

The board camera now favors controlled, recoverable interaction instead of a
single fixed view.

Available controls:

- `Rotate left`
- `Rotate right`
- `Tilt up`
- `Tilt down`
- `Zoom in`
- `Zoom out`
- `Overhead view`
- `Reset view`

The intended playability behavior is:

- orbit actions change the viewing angle in deliberate steps instead of forcing
  the user into a freeform camera-only experience
- zoom changes stay bounded so the board remains readable and usable
- the camera state can be recovered quickly through `Overhead view` or
  `Reset view`
- the board remains playable after camera changes, so camera usability does not
  come at the cost of visible-board move selection

The status pill should continue to communicate whether the camera is in
`Default camera view`, `Overhead camera view`, or `Custom camera view`.

## Contained Layout Goal

Wave 4B also improves playability by keeping the workspace visually contained.

The intended desktop behavior is:

- the app shell fills the viewport without creating runaway page scroll
- the board region and controls region stay inside the same bounded workspace
- the board surface keeps its own dedicated visual area
- the controls panel keeps its own dedicated visual area

This matters because the playability target is not only "the game works." The
target is that the board stays visible, the controls stay reachable, and the UI
does not feel like unrelated sections are pushing each other out of frame.

On narrower layouts, the workspace may stack vertically, but the same goal
still applies: keep each region deliberate and bounded instead of letting the
page become an unstructured overflow surface.

## Internal Move History Scrolling

Move history is intentionally contained inside the controls panel.

The desired behavior is:

- the move history section has its own internal scroll region
- long histories do not force the full app shell to grow endlessly
- primary controls such as `New game` and `AI difficulty` remain visible and
  separate from the history list
- long human-versus-Stockfish games stay readable without collapsing the rest
  of the layout

This is a playability improvement, not just a styling preference. A chess UI is
harder to use if every new move pushes controls farther away or causes the
whole page to scroll unpredictably.

## Piece Identity Design Approach

Wave 4B uses a clarity-first piece identity approach rather than final art
assets.

The current design intentionally relies on:

- simple procedural geometry instead of imported GLTF models
- side color contrast so white and black pieces are easy to separate
- recognizable top silhouettes for each piece type
- accessible labels that identify the piece color, piece type, and square

The piece identities are represented as follows:

- King: a tall crown topped with a cross
- Queen: a crown-like top with multiple pearls
- Rook: a battlement-style top
- Bishop: a spire form with a visible diagonal cut detail
- Knight: a horse-head-inspired silhouette
- Pawn: the simplest orb-topped form

This is intentionally not the final professional visual language. It is a
functional identity system that helps a human quickly tell pieces apart during
real play.

## Deferred Professional Polish

This wave deliberately stops before a final premium presentation pass.

Deferred to a future professional visual polish wave:

- premium board materials and surface treatment
- refined lighting and atmosphere tuning
- more sophisticated piece sculpting and silhouette polish
- high-quality movement animations
- sound design
- external production-ready 3D asset integration
- broader presentation polish beyond the current MVP interaction goals

That future wave should build on the current playability baseline instead of
replacing it. The board must stay readable, the camera must stay recoverable,
and the controls must stay usable even after visuals become more ambitious.

## Manual Test Checklist

Use these checks in a real browser session.

### Camera Orbit, Zoom, And Reset

1. Open the app and confirm the board is visible.
2. Click `Rotate left` and confirm the viewing angle changes smoothly and the
   board remains visible.
3. Click `Rotate right` and confirm the view updates again without breaking the
   scene.
4. Click `Tilt up` and `Tilt down` and confirm the camera angle changes in a
   controlled way.
5. Click `Zoom in` and `Zoom out` and confirm the board stays readable instead
   of disappearing into an unusable camera position.
6. Click `Overhead view` and confirm the camera state changes to the overhead
   perspective.
7. Click `Reset view` and confirm the camera returns to `Default camera view`.

Expected result: the camera feels controlled and recoverable, not fragile.

### Visible-Board Human To Stockfish Play

1. Start from the default view or return there with `Reset view`.
2. Make a legal visible-board human move such as `e2` to `e4`.
3. Confirm the moved piece appears on its new square on the rendered board.
4. Confirm move history records the human move.
5. Confirm the engine enters its normal thinking state.
6. Confirm Stockfish produces one reply.
7. Confirm move history records the Stockfish reply.
8. Confirm the engine returns to `Engine idle`.
9. Repeat after using one or more camera controls first.

Expected result: visible-board gameplay continues to work before and after
camera interaction.

### Long Move History Containment

1. Play or seed a long game history until the move list is much longer than the
   visible panel height.
2. Confirm the move history list scrolls inside its own panel area.
3. Confirm the overall app layout does not expand into an uncontrolled long
   page on desktop.
4. Confirm `New game` remains reachable.
5. Confirm `AI difficulty` remains reachable.
6. Confirm the board region remains separate from the move history list.

Expected result: long history stays contained inside the controls panel.

### Piece Identification

1. Inspect the white and black kings and confirm they are distinguishable as
   the cross-topped pieces.
2. Inspect the queens and confirm they are distinguishable as the crown-like
   pieces with multiple pearls.
3. Inspect the rooks and confirm they are distinguishable as the battlement
   pieces.
4. Inspect the bishops and confirm they are distinguishable as the spire pieces
   with the cut detail.
5. Inspect the knights and confirm they are distinguishable as the horse-head
   pieces.
6. Inspect the pawns and confirm they are distinguishable as the simplest
   orb-topped pieces.
7. Confirm a human can identify King, Queen, Rook, Bishop, Knight, and Pawn
   without depending on final external art assets.

Expected result: every piece type is recognizable during play.

## Ongoing Contract

Future visual work should preserve these Wave 4B playability outcomes:

- camera controls stay smooth, bounded, and easy to recover from
- move history keeps scrolling internally inside the controls panel
- the board-and-panel workspace remains contained and readable
- piece identity remains obvious even before final art polish arrives
- the MVP remains local-only with no auth, no backend, no database, no
  persistence, no routing, and no multiplayer
