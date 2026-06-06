# Professional Visual Design

## Purpose

This document summarizes the implemented professional visual design direction
for the Wave 4D chess experience. It describes the current dark cockpit shell,
board material and frame treatment, procedural piece design, move-highlight
language, lighting presentation, motion behavior, and the browser regression
contracts that protect the visual surface.

The generated image used during design exploration is a directional visual
target only. It informs the intended mood and composition, but it is not a
pixel-perfect requirement and it does not override the shipped implementation
or test contracts.

## MVP Boundary

This visual work stays inside the local-only MVP:

- no login
- no authentication
- no database
- no backend
- no persistence
- no routing
- no multiplayer

The goal is a polished browser-based human-versus-Stockfish experience, not a
product-scope expansion.

## Dark Cockpit Layout

The interface is implemented as a dark cockpit-style command surface built
around the board. The board region remains the hero element, while the right
panel acts as a compact operational console for status, Stockfish state, move
history, and local controls.

The shell uses layered navy-to-black gradients, restrained gold and green
accents, rounded glass-like panels, and bounded card regions. The board area is
wider than the control panel by design, and the desktop layout is constrained
to stay inside the viewport rather than growing into a full-page scrolling app.

## Board Material And Frame Choices

The board uses a premium framed-material treatment rather than flat debug
surfaces. The current board contract is:

- light squares: `maple-stone-inlay`
- dark squares: `walnut-slate-inlay`
- frame: `walnut-bevel-frame`

The square finishes are procedurally varied within each light and dark family
so the board reads as crafted material instead of a single repeated color. The
outer frame uses walnut-toned rails, highlighted bevel segments, inner trim,
and a darker plinth to make the board feel planted and substantial from the
default and overhead views.

## Refined Procedural Piece Design

The chess set is implemented with procedural geometry rather than imported art
assets. Each piece type has a distinct silhouette contract so identity remains
readable during real play:

- king: tallest royal profile with cross crown
- queen: tiara crown with slightly lower royal height
- rook: battlement top
- bishop: mitre profile with slit
- knight: forward-reaching horse-head silhouette
- pawn: smallest orb-topped profile

White pieces use warm ivory, tan, and brass-adjacent accents. Black pieces use
deep blue-black bodies with cooler trim and warm accent notes. The overall
effect is more professional than placeholder cylinders while still prioritizing
recognition speed over ornamental complexity.

## Legal Move And Selection Styling

Move guidance is intentionally integrated into the premium board language.

Legal destination styling:

- empty legal squares use a sage-green flat dot treatment
- occupied legal destinations switch to a perimeter treatment
- markers sit slightly above the board to remain readable over richer materials

Selected square styling:

- selection uses a green-and-gold perimeter highlight
- the selected marker is a dual-ring treatment rather than a filled square
- contrast is explicitly tuned to stay readable across both light and dark
  square materials

These choices keep move cues visible without making them feel like temporary
debug overlays.

## Lighting Presentation

The scene lighting uses a studio-style readable rig, not a neutral ambient
wash. The active lighting contract is `studio-warm-key` with
`soft-readable` shadows.

The presentation combines:

- a warm front-right key light for primary definition
- a cool left fill light to keep dark forms readable
- a cool back rim light for silhouette separation
- ambient and hemisphere fill for baseline visibility
- a dark blue-gray background and fog to maintain the cinematic cockpit mood

The lighting target is default-and-overhead readability first, with enough
shadow softness and contrast to make the board feel dimensional without hiding
piece identity.

## Piece Movement Transitions

Piece movement is presented as a short eased translation instead of an instant
teleport. Normal moves animate over a 260 ms window with a smooth ease-in/ease-
out curve, and animation metadata is exposed so browser tests can confirm that
motion starts and settles correctly.

This keeps the board feeling deliberate and readable during human and AI play.
Reduced-motion preference still disables active animation so accessibility does
not depend on motion.

## Browser Regression Contracts

The visual surface is protected by browser-facing regression coverage, not only
by design intent. The current contracts cover:

- board-first layout that keeps the board and right panel inside the desktop
  viewport
- stable default, overhead, rotate, tilt, reset, and zoom camera behavior
- useful zoom bounds while keeping the board flat relative to screen-up
- lighting telemetry that confirms the active rig and shadow style
- piece identity telemetry that resolves type, side, square, and silhouette
- selected-square and legal-move marker treatments
- move-history containment through internal panel scrolling instead of page
  growth
- human move to Stockfish reply flow at default and custom camera views
- animation-state completion after human and AI moves

These contracts are anchored in the browser smoke coverage for the shipped app
surface, especially the checks around camera stability, piece identity,
highlight visibility, long move history containment, and visible human-to-AI
gameplay.

## Manual Visual Review Checklist

Use this checklist when reviewing the rendered app manually in a browser:

- Default view: confirm the board is the visual hero, the right panel reads as
  a cockpit console, and the shell stays contained within the viewport.
- Overhead view: confirm the board remains readable, grounded, and visually
  premium rather than flattening into a low-contrast grid.
- Rotate and zoom: confirm orbiting keeps the board usable, zoom stays within a
  helpful range, and the presentation does not clip or lose orientation.
- Piece identity: confirm king, queen, rook, bishop, knight, and pawn remain
  easy to distinguish for both colors from normal play angles.
- Move highlights: confirm legal move dots and perimeter markers remain visible
  on both light and dark squares.
- Selected square: confirm the green-and-gold perimeter selection treatment is
  obvious without overpowering the board.
- Move history containment: confirm long move history scrolls inside the panel
  instead of forcing page-level scrolling on desktop.
- Human to Stockfish gameplay: confirm a human move completes, Stockfish
  answers once, and the board remains readable throughout the exchange.
- Animation completion: confirm moved pieces animate to the correct square and
  return to an idle settled state after motion completes.
