# Wave 4C — Camera and Geometry Fixes Report

**Date:** 2026-06-06
**Repo:** `Chess3DJune5e` (`https://github.com/welovekiteboarding/Chess3DJune5e`)
**Graph:** [`planning/graphs/2026-06-10-3d-chess-camera-geometry-fixes.json`](../../planning/graphs/2026-06-10-3d-chess-camera-geometry-fixes.json)
**Branch (operate control branch):** `codex/wave-4c-camera-geometry-fixes`
**Linear team:** `C`
**Loop command:** `mix symphony.operate --graph planning/graphs/2026-06-10-3d-chess-camera-geometry-fixes.json --team-key C --auto-rework-continue --interval-seconds 30`
**Outcome:** All 5 graph tasks Done. 5 PRs merged into `main`. Zero manual interventions. **All four CODE tasks landed clean on first attempt; only the docs task needed a rework.** The cleanest substantive wave run so far.

This report is the sixth in the per-wave retrospective series. Same shape as Wave 1, 2, 3, 4A, and 4B reports.

---

## 1. Summary

| Metric | W1 | W2 | W3 | W4A | W4B | W4C |
|---|---|---|---|---|---|---|
| Total graph tasks | 9 | 8 | 9 | 4 | 5 | 5 |
| Tasks Done | 9 | 8 | 9 | 4 | 5 | 5 |
| Tasks needing rework | 5 | 2 | 3 | 2 | 2 | 1 |
| Tasks needing >1 rework | 0 | 0 | 1 | 1 | 0 | 0 |
| **CODE tasks needing rework** | 5 | 2 | 3 | 2 | 2 | **0** |
| Tasks clean on first attempt | 4 | 6 | 6 | 2 | 3 | **4** |
| Manual interventions | 0 | 0 | 0 | 0 | 0 | 0 |
| Total PRs merged | 9 | 8 | 9 | 4 | 5 | 5 |
| Wall time (operate launch → all Done) | ~3 h | ~75 min | ~1 h 52 min | ~1 h 45 min | ~1 h 31 min | ~58 min |
| Used `npm run test:browser` | n/a | n/a | 4 / 9 | 3 / 4 | 4 / 5 | 4 / 5 |
| Cumulative across-wave reworks resolved one-shot | 5/5 | 7/7 | 8/9 | 9/12 | 11/14 | **12/15** |

**Wave 4C is the first wave where every CODE task landed clean on first attempt.** The one rework hit only the docs task (scope drift). The four 3D-scene/camera fixes — piece grounding, flat-board orbit, wheel/trackpad zoom, browser regression — all merged on round 1.

This continues the trend visible across Waves 4A → 4B → 4C: structural enforcement via `scope.exclude` is doing more and more of the work the reviewer used to catch by hand. Wave 4C added `src/chess/` and `src/engine/` to the standard scope.exclude block on every code task, on top of Wave 4B's `src/game/gameStore.ts` / `src/game/gameStore.test.ts` / `src/main.tsx`. Each new exclusion is a tax on previous rework patterns.

Wall time of ~58 minutes is the shortest of any wave to date, despite Wave 4C touching the actual 3D scene geometry (piece origins) and camera control system (orbit + zoom) — areas where reviewer rounds historically took longest.

---

## 2. Task-by-task

### 2.1 Clean tasks (no rework, merged on first attempt) — 4 of 5

| Task ID | Linear | PR | Title |
|---|---|---|---|
| `fix-piece-grounding-037` | C-38 | #38 | Fix piece grounding |
| `fix-flat-board-camera-orbit-038` | C-39 | #39 | Fix flat board camera orbit |
| `fix-wheel-trackpad-zoom-039` | C-40 | #40 | Fix wheel and trackpad zoom |
| `camera-geometry-browser-regression-040` | C-41 | #41 | Add camera geometry regression |

The three substantive 3D fixes (C-38 grounding, C-39 flat-board orbit, C-40 wheel zoom) all landed first-attempt. Each had a non-trivial worker phase (4–8 minutes) and a thorough reviewer round, but none triggered changes_requested. The reviewer's live-browser verification pattern — which has caught false-positive overlay and accessibility tests in earlier waves — accepted all three on first read.

C-41 added the new browser regression covering grounding + flat orbit + zoom + post-camera gameplay. Despite being a comprehensive regression task, it merged clean.

### 2.2 Task that went through rework — 1 of 5

| Task ID | Linear | Reworks | Pattern |
|---|---|---|---|
| `camera-geometry-docs-041` | C-42 | 1 | Docs-task scope drift (worker also modified 7 app/test files) |

---

## 3. Rework story

### `camera-geometry-docs-041` (C-42, PR #42) — docs-only task drifted into app code

**Symphony classification:** `category: review, stage: automated_review, reason: changes_requested`

**What happened on the first attempt:** the Codex worker wrote `docs/camera-geometry-fixes.md` correctly — the docs file itself satisfied every acceptance criterion. But the worker also touched seven other files while writing the docs: `src/scene/BoardScene.tsx`, `src/scene/BoardScene.test.tsx`, `src/scene/pieces/ChessPieceMesh.tsx`, `src/scene/pieces/index.ts`, `src/scene/pieces/pieceMetadata.ts`, `src/styles/globals.css`, and `tests/browser/app-shell.smoke.spec.ts`. None of these were in the task's `scope.include` (which was only `docs/camera-geometry-fixes.md`).

The reviewer flagged it:

> C-42 is explicitly a docs-only task, but the diff under review also changes application and test code in `src/scene/BoardScene.tsx`, `src/scene/BoardScene.test.tsx`, `src/scene/pieces/ChessPieceMesh.tsx`, `src/scene/pieces/index.ts`, `src/scene/pieces/pieceMetadata.ts`, `src/styles/globals.css`, and `tests/browser/app-shell.smoke.spec.ts`; that scope expansion is not necessary for correctness and violates the task's no-application-code requirement.

**Reviewer non-blocking note:**

> `docs/camera-geometry-fixes.md` itself appears to satisfy the stated documentation acceptance criteria.

The docs were good. The drift was the problem. This was almost certainly an "I see something I think I can improve while I'm here" scope leak.

**What changed on the retry:** the rework prompt told the worker the docs are fine but the extras must come out. The retry worker reverted the seven extraneous file changes, kept the docs intact, and resubmitted. Round 2 approved. Merged at 06:14:45 UTC. Retry worker phase was ~1.5 minutes — the fastest retry across all waves.

**Lesson:** docs-task scope drift can slip past the structural scope validator because the validator only enforces what's in `scope.exclude`. The task's `scope.include: ["docs/camera-geometry-fixes.md"]` is a positive list, not a negative bound. For the validator to prevent this kind of drift, the docs task's `scope.exclude` needs to explicitly list the application source tree. Wave 4C's scope.exclude on C-42 only listed `tmp/`, `.symphony/`, `.env`, `.env.local`, `dist/`, `node_modules/`, and `test-results/` — none of which catch `src/scene/*` modifications. The reviewer caught it; the validator could have.

This is a graph-design pattern for future docs tasks: explicitly add the source tree (`src/`, `tests/`, top-level configs) to `scope.exclude`.

---

## 4. Patterns and observations

### 4.1 The "lock down what's not in scope" pattern is structurally working

Wave 4A C-31 lost two retries to scope drift into `src/main.tsx` and `src/game/gameStore.ts`. Wave 4B added those three files to `scope.exclude` on every code task. Wave 4B had zero scope-drift code reworks. Wave 4C extended the same pattern by adding `src/chess/` and `src/engine/` (defining this wave as scene/camera focused) and again had zero scope-drift code reworks.

Each wave that has added new files/dirs to the standard scope-exclude block has eliminated a previous wave's rework class:

- Wave 4A → Wave 4B: added `gameStore.ts`/`gameStore.test.ts`/`main.tsx` → killed C-31's scope drift class
- Wave 4B → Wave 4C: added `src/chess/`/`src/engine/` → defined wave as scene-only

The recurring pattern: each wave's reviewer-caught scope drift becomes the next wave's structural-validator-caught structural exclusion.

### 4.2 The reviewer's live-browser verification budget has stabilized

Three consecutive waves (4A C-29, 4B C-35, 4C nothing) showed the reviewer doing live-browser verification — measuring DOM positions, reproducing race conditions with fake transports, running R3F in a real browser and catching attribute errors. Wave 4C's clean code-task pass-through could mean:

- The implementation is genuinely correct on first attempt (Codex's quality on R3F has improved given the corrected patterns from Wave 4B).
- The reviewer's live-browser verification is now part of its standard process and the worker is anticipating it (writing code that holds up under real-browser inspection rather than "tests pass" alone).
- Some combination of both.

Either way: the reviewer's deep-investigation reputation now seems to shape what the worker produces in advance.

### 4.3 The docs-task scope-drift is the one rework class still un-structurally-enforced

Wave 4C exposed that docs tasks have a softer scope guard than code tasks. Each new wave has caught and fixed a docs-related variant: Wave 2 C-18 (docs say X but code does Y → factual contradiction), Wave 4C C-42 (docs task drifts into app code). The structural enforcement pattern for docs tasks now is clear: add `src/`, `tests/`, top-level configs to `scope.exclude` so the validator catches docs-task drift the same way it catches code-task drift.

### 4.4 Wall time keeps coming down

| Wave | Wall time | Tasks | Reworks |
|---|---|---|---|
| W1 | ~3 h | 9 | 5 |
| W2 | ~75 min | 8 | 2 |
| W3 | ~1 h 52 min | 9 | 3 |
| W4A | ~1 h 45 min | 4 | 2 (incl. C-31 × 3) |
| W4B | ~1 h 31 min | 5 | 2 |
| W4C | **~58 min** | 5 | 1 |

Wave 4C is the fastest wave despite touching 3D-scene/camera-control internals — historically the hardest review surface. The compounding cause: fewer reworks (1 vs 2 vs 2 vs 2 vs 3 vs 5) means less wall time absorbed by retry worker turns. The structural scope enforcement compounds.

### 4.5 The 11-minute worker phase on C-41 (regression task) was the longest of the wave

C-41 had an unusually long worker phase (~11 min) for a regression-coverage task. The breadth of the test (grounding + flat orbit + zoom + post-camera gameplay) and the need to write deterministic camera-state readouts that Playwright can read both contributed. Despite the long phase, no apply_patch errors visible in the log; Codex completed normally and the test ran cleanly through validation including `npm run test:browser`.

### 4.6 Clean idle exit at end of wave (consistent with Waves 2, 3, 4A, 4B)

After Done(5), operate idled cleanly emitting `plan_cycle: materialized 0 task(s)` every 30s. The user stopped operate with SIGINT after verifying completion. Five consecutive waves with clean idle exit confirms this is the normal end-of-wave behavior.

---

## 5. What this wave produced

### Files added (1 new)

```
docs/camera-geometry-fixes.md
```

### Files modified by Wave 4C

```
src/scene/BoardScene.tsx                  (flat-board orbit, wheel zoom, camera-state readouts for tests)
src/scene/BoardScene.test.tsx             (tests for above)
src/scene/pieces/ChessPieceMesh.tsx       (grounding: consistent base-on-board origin)
src/scene/pieces/index.ts                 (grounding helpers)
src/scene/pieces/pieceMetadata.ts         (grounding metadata)
src/styles/globals.css                    (camera control styling adjustments)
tests/browser/app-shell.smoke.spec.ts     (regression test covering grounding + orbit + zoom + post-camera gameplay)
```

8 files touched (1 added, 7 modified).

### Boundaries preserved

- Stockfish stays behind the engine adapter.
- UI components do not import Stockfish or chess.js directly.
- BoardScene click target remains camera-aware after camera changes.
- The store (`src/game/gameStore.ts`) was NOT modified — pre-emptive scope-exclude worked.
- `src/main.tsx`, `src/chess/`, `src/engine/` all NOT modified.
- AI auto-play remains on by default.

### Validation that passed on every accepted PR

- `npm install`, `npm run lint`, `npm run build`, `npm run test -- --run`, `mix check`
- GitHub Actions `bootstrap-proof`
- `npm run test:browser` on tasks 037, 038, 039, 040

### What Wave 4C deliberately did NOT do

- No final luxury board materials (Wave 4D)
- No piece movement animations (Wave 4D)
- No external GLTF or binary assets
- No sound
- No new game / side selection / captured pieces (Wave 5)

---

## 6. Deviations from the original graph

**Zero.** Graph applied exactly as written. Pre-emptive scope.exclude on `src/game/gameStore.ts`/`src/game/gameStore.test.ts`/`src/main.tsx`/`src/chess/`/`src/engine/` (Wave 4B + Wave 4C lessons) prevented any scope drift on code tasks. The single rework was on the docs task, where scope.exclude did not yet cover the source tree.

---

## 7. Final state

```
Ready (0) | In Progress (0) | Blocked (0) | Rework (0) | Done (5)
```

| Linear | Task | PR | Merged (UTC) | Reworks |
|---|---|---|---|---|
| C-38 | `fix-piece-grounding-037` | #38 | 2026-06-06 05:25 | 0 |
| C-39 | `fix-flat-board-camera-orbit-038` | #39 | 2026-06-06 05:37 | 0 |
| C-40 | `fix-wheel-trackpad-zoom-039` | #40 | 2026-06-06 05:46 | 0 |
| C-41 | `camera-geometry-browser-regression-040` | #41 | 2026-06-06 06:02 | 0 |
| C-42 | `camera-geometry-docs-041` | #42 | 2026-06-06 06:14 | 1 |

Total Wave 4C wall time: ~58 min for 5 PRs through worker + review + merge with 1 rework cycle. Average ~12 min per merged PR including rework. Zero manual interventions.

---

## 8. Recommended Wave 4D — Professional Visual Polish

Suggested file: `planning/graphs/2026-06-11-3d-chess-professional-visual-polish.json` (6–7 tasks).

Recommended DAG:

1. **`board-materials-042`** — professional alternating wood/stone-style materials (procedural; no GLTF). Scope: `src/scene/BoardScene.tsx`, possibly a new `src/scene/materials/`.
2. **`refined-piece-models-043`** — refine Wave 4B/4C piece geometry into more polished procedural shapes (still no GLTF). Scope: `src/scene/pieces/`.
3. **`deeper-lighting-polish-044`** — three-point lighting + soft shadows + ambient. Scope: `src/scene/lighting/`.
4. **`piece-movement-animations-045`** — ~200–400 ms move transitions. Must preserve the camera-aware click target and per-piece accessibility identifiers.
5. **`responsive-visual-polish-046`** — board scales sensibly across viewport widths.
6. **`visual-polish-browser-regression-047`** — extend the camera-geometry regression from C-41 to also assert post-visual-polish behavior.
7. **`visual-polish-docs-048`** — docs-only summary.

**Four hard contracts to inherit in EVERY Wave 4D task** (carry forward what worked + ONE new from this wave):

A. *"The existing `tests/browser/app-shell.smoke.spec.ts` human→AI smoke test passes after this change, both at the default camera angle AND after rotating/zooming."* (Wave 4A C-31 lesson)

B. *"This task does not modify `src/game/gameStore.ts`, `src/game/gameStore.test.ts`, `src/main.tsx`, `src/chess/`, or `src/engine/` unless explicitly listed in `scope.include`. All five must be in `scope.exclude`."* (Wave 4B + 4C lesson, structurally enforced)

C. *"Any accessibility identifier attached to a Three.js Object3D must use `userData` or `object.name` — NOT DOM `aria-*` or `data-*` attributes on R3F primitives."* (Wave 4B C-35 lesson)

D. **NEW for Wave 4D** — Carry forward Wave 4C C-42's lesson: ***"Docs-only tasks must explicitly add `src/`, `tests/`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `package.json`, `package-lock.json`, `eslint.config.js`, and `index.html` to `scope.exclude` so the structural validator enforces docs-only literally."***

Same validation pattern: `setup_commands: ["npm install"]`, `commands: ["npm run lint", "npm run build", "npm run test -- --run", "mix check"]`, plus `"npm run test:browser"` on tasks 042, 043, 045, 047.

If contract D is applied, Wave 4D could plausibly be the **first wave with zero reworks** — all the structural enforcement is now in place across both code and docs tasks.
