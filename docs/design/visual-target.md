# Visual Target

## Purpose

This document defines the target visual direction for the professional 3D chess
interface. It is a design target for future UI polish work, not a pixel-perfect
specification and not an implementation plan for backend or product-scope
changes.

The graph acceptance criteria are the source of truth. If a future reference
image exists, including `docs/design/reference-ui-concept.png`, it should be
treated as directional only and never as a strict pixel map. This document must
remain sufficient on its own even if no image is present.

## MVP Product Boundary

The target interface must preserve the current local-only MVP scope:

- no login
- no account system
- no authentication
- no backend service
- no database
- no remote API dependency
- no saved games or other persistence

The screen should feel like a professional game application, but it must stay
focused on local chess play only.

## Overall Visual Direction

The UI should read as a dark cockpit-style command surface built around the 3D
board.

Key traits:

- dark navy to near-black cinematic background
- subtle premium lighting, not a flat black void
- focused, professional, restrained presentation rather than arcade styling
- strong contrast between the play surface and the surrounding shell
- clear information hierarchy so the board remains the hero element

The interface should feel closer to a premium analysis console or simulator
display than to a generic web dashboard.

## Layout Target

The primary layout is a two-zone composition:

- a large premium 3D chess board on the left
- a right-side cockpit panel for information and controls

The board should dominate the screen and remain the first thing the player
notices. The right panel should feel integrated with the board rather than like
a separate app page.

### Left Board Zone

- the board occupies most of the available width
- the camera framing should make the board feel substantial and physical
- the board area should have enough breathing room to showcase materials,
  lighting, and piece readability

### Right Cockpit Panel

The right-side panel should stack the operational UI in a clear order:

- game status
- move history
- game controls
- camera controls

This panel should feel like a compact command console: structured, readable,
and visually secondary to the board without feeling disposable.

## Information And Controls

### Game Status

The status area should communicate the current match state immediately. It
should clearly show:

- whose turn it is
- whether the engine is thinking
- check, checkmate, draw, or other game-state messaging

### Move History

Move history should remain easy to scan and should fit naturally inside the
right-side panel. It should present moves as a reliable play log rather than as
decorative text.

### Game Controls

Game controls should look deliberate and professional, with clear affordances
for actions such as starting a new game or adjusting local gameplay settings.

### Camera Controls

Camera controls should stay visible and understandable. They should read as
board-navigation tools, not as unrelated page controls, and should fit the same
cockpit visual language as the rest of the panel.

## Board And Material Direction

The board should look premium and grounded in real materials.

Required material cues:

- a warm wood-like outer frame
- professional board materials for the playable surface
- believable contrast between light and dark squares
- a finish that feels polished but not glossy to the point of reducing clarity

The target result is a board that feels expensive, stable, and readable from
the active camera angle.

## Piece Direction

The chess pieces must be readable at a glance and clearly distinct by type and
side color.

Required qualities:

- each piece type has a recognizable silhouette
- white and black sides are immediately separable
- shapes remain readable from the normal gameplay camera
- the set feels professional and intentional, not placeholder or toy-like

Readability matters more than decorative complexity. Premium styling is useful
only if the player can still identify pieces instantly during play.

## Interaction Cues

Move guidance and selection feedback should be obvious without overwhelming the
scene.

Required cues:

- legal moves appear as green dots on valid destination squares
- the selected square receives a clear highlight
- highlights should feel integrated with the premium board presentation rather
  than like temporary debug overlays

These cues should stay visible on top of the darker presentation and across the
board materials.

## Non-Goals

This design target does not introduce:

- login or account UI
- backend-connected status surfaces
- database-driven history
- persistence or saved-session management
- unrelated web-app shell features

The goal is a polished local chess interface, not expansion of product scope.
