# Wave 4A — Gameplay Reliability + Camera Usability Report

**Date:** 2026-06-05 / 2026-06-06
**Repo:** `Chess3DJune5e` (`https://github.com/welovekiteboarding/Chess3DJune5e`)
**Graph:** [`planning/graphs/2026-06-08-3d-chess-gameplay-reliability-camera.json`](../../planning/graphs/2026-06-08-3d-chess-gameplay-reliability-camera.json)
**Branch (operate control branch):** `codex/wave-4a-gameplay-reliability-camera`
**Linear team:** `C`
**Loop command:** `mix symphony.operate --graph planning/graphs/2026-06-08-3d-chess-gameplay-reliability-camera.json --team-key C --auto-rework-continue --interval-seconds 30`
**Outcome:** All 4 graph tasks Done. 4 PRs merged into `main`. Zero manual interventions. Four auto-resolved reworks across two tasks. C-31 (`orbit-zoom-camera-controls-030`) set a new across-wave record by needing three retries before approval.

This report is the fourth in the per-wave retrospective series. It follows the same structure as Wave 1, Wave 2, and Wave 3 reports.

---

## 1. Summary

| Metric | W1 | W2 | W3 | W4A |
|---|---|---|---|---|
| Total graph tasks | 9 | 8 | 9 | 4 |
| Tasks Done | 9 | 8 | 9 | 4 |
| Tasks needing rework | 5 | 2 | 3 | 2 |
| Tasks needing >1 rework | 0 | 0 | 1 | **1 (C-31, three retries)** |
| Tasks clean on first attempt | 4 | 6 | 6 | 2 |
| Manual interventions | 0 | 0 | 0 | 0 |
| Total PRs merged | 9 | 8 | 9 | 4 |
| Wall time (operate launch → all Done) | ~3 h | ~75 min | ~1 h 52 min | ~1 h 45 min |
| Average min per merged PR (incl. reworks) | ~20 | ~9 | ~12 | ~26 |
| Used `npm run test:browser` | n/a | n/a | 4 / 9 | 3 / 4 |
| Cumulative across-wave reworks resolved one-shot | 5/5 | 7/7 | 8/9 | **9/12** |

Wave 4A was the most surgically scoped wave (4 tasks vs 8–9) but had the highest per-PR average wall time. That's almost entirely driven by C-31's three retries (which produced four reviewer rounds and four worker runs for one task). C-29 and C-31 — both the visible-board interaction tasks — needed real-browser pixel-position verification to catch defects that unit tests could not, validating the reviewer's deep-investigation behavior.

The MVP central bug — *visible-board first move did not auto-trigger Stockfish* — is fixed. Camera orbit/zoom controls land without breaking square selection.

---

## 2. Task-by-task

### 2.1 Clean tasks (no rework, merged on first attempt) — 2 of 4

| Task ID | Linear | PR | Title |
|---|---|---|---|
| `visible-board-browser-smoke-029` | C-30 | #30 | Strengthen visible-board smoke test |
| `interaction-camera-docs-031` | C-32 | #32 | Document gameplay and camera testing |

C-30 landed clean specifically because C-29 had already done the hard architectural work of producing a properly-positioned overlay; C-30 only needed to retrofit the assertion path of an existing browser test to use the visible click surface and add the "would fail if stale latestError blocks" guard.

### 2.2 Tasks that went through rework — 2 of 4

| Task ID | Linear | Reworks | Pattern |
|---|---|---|---|
| `visible-board-auto-ai-reliability-028` | C-29 | 1 | Overlay positioned outside visible board → repositioned |
| `orbit-zoom-camera-controls-030` | C-31 | **3** | Camera vs click target → out-of-scope main.tsx → out-of-scope gameStore → finally clean |

---

## 3. Rework stories

### 3.1 `visible-board-auto-ai-reliability-028` (C-29, PR #29) — overlay mispositioned by 210px

**Symphony classification:** `category: review, stage: automated_review, reason: changes_requested`

**What happened on the first attempt:** the Codex worker fixed the central bug (transient `latestError` no longer blocks auto-AI after a successful human move) and added an overlay grid of clickable square buttons over the 3D BoardScene so the browser test could click visible squares. All unit and browser tests passed in the worker's worktree.

The reviewer, however, *launched the app in a live browser and measured DOM coordinates*:

> src/scene/BoardScene.tsx:40-47 and 165-188 do not currently satisfy the visible-board acceptance path because the new overlay grid is mispositioned in the real app once the existing `.board-scene > div` rule applies (`src/styles/globals.css:154-160`). **In a live run, the board scene ended at `bottom=844px` while the overlay grid ended at `bottom=1054px`**, so buttons like `e2 square` were rendered below the visible board surface. As a result, `tests/browser/app-shell.smoke.spec.ts:15-16` is still clicking transparent off-surface controls instead of the actual visible/manual board area, so the browser validation does not prove the required first-move path is fixed.

The reviewer caught a **false-positive test**: the test passed but it was clicking invisible buttons 210 pixels below the actual rendered board. That's exactly the failure mode this wave was designed to prevent.

**What changed on the retry:** the rework prompt carried the verbatim finding (including the `bottom=844px` vs `bottom=1054px` measurement). The retry worker fixed the overlay positioning so it aligns with the rendered board. The round-2 review approved. Merged at 00:56:54 UTC.

**Lesson:** the reviewer now does live-browser DOM measurement to catch tests that pass for the wrong reason. This is meaningfully stronger than diff-reading or even running tests in CI — those would have shown green. Only an actual browser session with pixel inspection caught it.

### 3.2 `orbit-zoom-camera-controls-030` (C-31, PR #31) — three reworks

This is the first task across all waves to need more than two retries. Each retry fixed the prior finding but introduced new scope drift.

#### 3.2a Round 1: camera moves, click target doesn't (predicted in graph review)

**Round 1 finding:**

> src/scene/BoardScene.tsx:72-79,121-126,303-336,396-418 introduces camera movement for the rendered board but leaves visible-board input on the old fixed absolute overlay (`inset: '38% 0 34% 0'`). After `Overhead view`/zoom/rotate, the 3D board visibly moves while those transparent square buttons stay in the same screen positions, so clicking a square on the rendered board can select the wrong square or no square at all. That breaks the acceptance criteria that camera controls must not break visible-board square selection and legal-move highlighting. The current browser smoke test still passes…

The worker added OrbitControls but kept the static CSS overlay grid from C-29's fix. The browser smoke test (run at the default camera angle) still passed because the overlay happens to align there — but rotate/zoom and the clicks miss.

This is the OrbitControls-vs-fixed-overlay tension flagged in the initial graph review at the start of Wave 4A.

#### 3.2b Round 2: out-of-scope `src/main.tsx` change

**Round 2 finding:**

> src/main.tsx removes React StrictMode even though that file is outside the declared task scope and the PR does not show a camera-specific correctness reason for broadening the change there. Disabling StrictMode is an unrelated app-lifecycle change that can mask side-effect bugs across the whole app, so this should be reverted or explicitly justified with a scope-valid necessity before approval.

The retry-2 worker DID fix the original camera-overlay issue (the click target now tracks the camera), but in the process of debugging an auto-play double-fire that StrictMode's double-effect-invocation was producing, the worker disabled StrictMode globally in `src/main.tsx`. That file was not in the task's `scope.include`. The reviewer correctly classified this as both (a) out-of-scope and (b) a lifecycle regression risk.

#### 3.2c Round 3: out-of-scope `src/game/gameStore.ts` changes

**Round 3 finding:**

> Scope drift: the PR expands into `src/game/gameStore.ts` and `src/game/gameStore.test.ts` to add `latestErrorKind` plumbing and change AI auto-request/retry behavior (`src/game/gameStore.ts:38-65`, `src/game/gameStore.ts:284-315`, `src/app/App.tsx:60-88`, `src/app/App.tsx:205-226`). That store-level error-policy work is not clearly necessary to add orbit/zoom camera controls or preserve board clicks, and the task context already flagged those files as outside the declared scope. Per the scope policy, this should be trimmed back unless the author can show a direct correctness dependency.

The retry-3 worker fixed the StrictMode issue by reverting `main.tsx` but, attempting to fix the double-fire correctly, expanded into `gameStore.ts` to introduce a `latestErrorKind` discriminator and rework the AI auto-request/retry behavior. Those changes are conceptually reasonable but they belong to a future Wave 5 error-handling-polish task, not to a camera-controls task. The reviewer enforced literal `scope.include`.

#### 3.2d Round 4: approved

The retry-4 worker reverted the gameStore changes and fixed the original double-fire problem inside `src/app/App.tsx` (which IS in scope) using a single-fire ref or equivalent idempotent effect guard. Round-4 review returned 0 findings. Merged at 02:00:58 UTC.

**Lesson:** when a worker is fixing finding N+1, it tends to drift the fix into the broader codebase — not from carelessness but because the cleanest architectural fix often lives upstream of the originally-scoped files. The reviewer's literal scope enforcement forces the fix to stay narrow even when narrow is harder. For Wave 4B, the recommendation is to add an explicit "do not touch these files" clause in each task's description so the worker knows the constraint *before* drifting.

---

## 4. Patterns and observations

### 4.1 The reviewer now does live-browser pixel inspection

C-29 round 1's finding was that "the overlay extends to `bottom=1054px` but the board ends at `bottom=844px`." Those are real DOM-coordinate measurements from a live browser session. The reviewer ran the app, opened devtools (or the equivalent programmatic inspection), and measured rect positions. This is the most thorough review work across all four waves and meaningfully raises what "review approves" implies for visual/spatial tasks.

### 4.2 Codex's `apply_patch` failures can produce long silent-recovery windows

C-29's first attempt hit `apply_patch verification failed: Failed to find expected lines` at ~5 min into the worker turn. The visible operate log went silent for ~10 min after the failure. Codex internally recovered (likely via re-prompting itself with the actual file content) and produced a corrected patch, with the worker turn eventually completing at ~17 min. Symphony's worker-turn timeout (~20 min default) gave enough headroom. Operators watching the loop should not interpret a single `apply_patch verification failed` line followed by silence as a crash — it's often a recoverable internal retry.

### 4.3 Three-retry tasks ARE viable on auto-rework-continue

C-31's four-attempt resolution is the first across all waves. Auto-rework-continue does not have a retry cap as far as we have observed; it kept queueing the same Linear issue back to Todo with the verbatim previous-failure context until the reviewer approved. Each round, the reviewer's finding was more targeted (camera-vs-click → scope drift A → scope drift B → done). The loop is robust to multi-round refinement without manual help.

The cost is wall time: C-31 alone consumed ~70 min (four worker turns × ~5–15 min + four reviews × ~5 min). If we accept that pattern as normal for tasks that genuinely require multi-round refinement, the ~26-minute-per-merged-PR average for this wave is consistent with one task absorbing most of the budget.

### 4.4 Scope drift is the dominant rework cause when the underlying defect has a tempting upstream fix

C-31 rounds 2 and 3 were both pure scope-drift findings. The worker wanted to fix a double-fire issue, and the cleanest fix was in `main.tsx` (StrictMode) or `gameStore.ts` (error-policy refactor). Neither was in `scope.include`. The narrower in-scope fix exists (an idempotent effect guard in `App.tsx`) but takes more thought than the broader rewrites.

This matches Wave 1 C-4 (chess-rules task wrote app/UI/engine files) and Wave 2 C-17 (turn-status task disabled auto-play) — both lost a rework round to scope drift. Lesson for Wave 4B graph authoring: name the off-limits files explicitly in each task description, not just by omission from `scope.include`.

### 4.5 Pre-emptive `test-results/` exclude prevented a Wave 3 C-20 repeat

Wave 4A's graph included `test-results/` in every `scope.exclude` (lesson from Wave 3 C-20's Playwright-artifact spillover). Zero Wave 4A tasks committed unintended test-results artifacts. The structural scope validator caught no scope_violation errors; only the reviewer caught higher-level scope drift. The structural validator + the reviewer together cover different layers.

### 4.6 The MVP central claim is now end-to-end-validated through the visible board

Before Wave 4A:
- Real Stockfish ran in browser ✅ (Wave 3)
- Browser smoke test asserted a human→AI exchange ✅ (Wave 3 C-27)
- But the smoke test used test-id controls, NOT visible 3D board clicks ❌
- Manual users hit a stale-error first-move bug not covered by the test ❌

After Wave 4A:
- Real Stockfish runs in browser ✅
- Browser smoke test asserts a human→AI exchange ✅
- The smoke test now clicks the actual visible 3D board overlay surface ✅ (C-30)
- Stale transient errors no longer block first-move auto-play ✅ (C-29)
- The test would fail if stale errors blocked first-turn auto-AI ✅ (C-30 explicit guard)
- Orbit/zoom camera controls preserve all of the above ✅ (C-31)

This is the most comprehensive end-to-end MVP coverage achieved so far.

### 4.7 Clean idle exit at end of wave (consistent with Waves 2 and 3)

After Done(4), operate idled cleanly emitting `plan_cycle: materialized 0 task(s)` every 30s with no crashes. The user stopped operate with SIGINT after verifying completion. Three consecutive waves with clean idle exit confirms this is the normal end-of-wave behavior.

---

## 5. What this wave produced

### Files added (1 new)

```
docs/gameplay-reliability-camera.md
```

### Files modified by Wave 4A

```
src/scene/BoardScene.tsx          (overlay grid for clickable squares, then re-attached to camera transform, then camera-aware click target)
src/scene/BoardScene.test.tsx     (tests for above)
src/app/App.tsx                   (auto-play guard + single-fire ref + camera controls wiring)
src/app/App.test.tsx              (tests for above)
src/game/gameStore.ts             (clear transient latestError after successful human move)
src/game/gameStore.test.ts        (tests for above)
src/styles/globals.css            (board-scene layout + camera control button styling)
tests/browser/app-shell.smoke.spec.ts  (visible-board click path + stale-error guard + camera regression guard)
```

8 files touched (1 added, 7 modified). No unexpected files.

### Boundaries preserved

- Stockfish stays behind the engine adapter (unchanged from Wave 3).
- UI components do not import Stockfish or chess.js directly.
- BoardScene click target is now camera-aware but still presentation-focused.
- The store coordinates rules + engine; it does not own rendering or camera state.
- AI auto-play remains on by default; the bug fix does NOT gate auto-play behind any user action.
- Retry AI move remains available for real engine failures (not required for normal first move).

### Validation that passed on every accepted PR

- `npm install` (setup), `npm run lint`, `npm run build`, `npm run test -- --run`, `mix check`
- GitHub Actions `bootstrap-proof` workflow
- `npm run test:browser` on tasks 028, 029, 030 (each runs the visible-board human→AI exchange smoke test)

### What Wave 4A deliberately did NOT do

- No professional board materials, procedural piece models, or lighting polish (Wave 4B)
- No piece movement animations or responsive layout polish (Wave 4B)
- No new game / side selection / captured-pieces panel (Wave 5)
- No final Stockfish license polish (Wave 5)

---

## 6. Deviations from the original graph

**Zero.** Graph applied exactly as written. The pre-emptive `test-results/` in every `scope.exclude` (lesson carried forward from Wave 3) worked as intended.

---

## 7. Final state

```
Ready (0) | In Progress (0) | Blocked (0) | Rework (0) | Done (4)
```

| Linear | Task | PR | Merged (UTC) | Reworks |
|---|---|---|---|---|
| C-29 | `visible-board-auto-ai-reliability-028` | #29 | 2026-06-06 00:56 | 1 |
| C-30 | `visible-board-browser-smoke-029` | #30 | 2026-06-06 01:05 | 0 |
| C-31 | `orbit-zoom-camera-controls-030` | #31 | 2026-06-06 02:00 | 3 |
| C-32 | `interaction-camera-docs-031` | #32 | 2026-06-06 02:06 | 0 |

Total Wave 4A wall time: ~1 h 45 min for 4 PRs through worker + review + merge with 4 rework cycles across 2 tasks. Average ~26 min per merged PR including reworks (skewed by C-31's three retries).

---

## 8. Recommended Wave 4B — Professional 3D Visuals

Per the wave plan, Wave 4B = the professional visual polish that was explicitly deferred from Wave 4A. Suggested file: `planning/graphs/2026-06-09-3d-chess-professional-visuals.json` (6–7 tasks).

Recommended DAG:

1. **`board-materials-032`** — replace placeholder geometry/materials with professional alternating wood/stone-style materials. Scope: `src/scene/BoardScene.tsx`, `src/scene/BoardScene.test.tsx`, possibly a new `src/scene/materials/` dir.
2. **`procedural-piece-models-033`** — replace placeholder pieces with composed procedural geometry (no external GLTF — keeps the task self-contained and license-free).
3. **`lighting-presentation-034`** — three-point lighting + shadow plane + ambient.
4. **`piece-movement-animation-035`** — animate piece transitions ~200–400 ms.
5. **`responsive-layout-polish-036`** — board scales sensibly across viewport widths.
6. **`visuals-browser-regression-037`** *(highly recommended)* — extend the existing browser smoke to assert one human→AI exchange still works after each visual change; add a camera-rotated assertion to confirm the camera-aware click target still works.
7. **`visuals-docs-038`** — docs-only summary.

**Two hard contracts to inherit explicitly in EVERY Wave 4B task** to avoid C-31-style retry storms:

A. *"The existing `tests/browser/app-shell.smoke.spec.ts` human→AI smoke test passes after this change, both at the default camera angle AND after rotating/zooming."* — This guards against visuals or layout changes inadvertently breaking the camera-aware click target.

B. *"This task does not modify `src/game/gameStore.ts`, `src/game/gameStore.test.ts`, or `src/main.tsx` unless explicitly listed in `scope.include`. If you find you need to, stop and report it as a finding — don't drift."* — Wave 4A C-31 lost two retries (rounds 2 and 3) to scope drift into these files. Pre-declaring them off-limits prevents that pattern.

Validation pattern unchanged: `setup_commands: ["npm install"]`, `commands: ["npm run lint", "npm run build", "npm run test -- --run", "mix check"]`, plus `"npm run test:browser"` on tasks that touch the rendered surface (032, 033, 035, 037).

**Optional Wave 4.5 patch (analogous to Wave 2.5):** if you want a separate perceptual-regression test path (e.g., Percy / Chromatic) without blocking on it for every Wave 4B task, add a Symphony validator entry for `npm run test:browser:visual` first. Not strictly needed — the existing `npm run test:browser` covers functional regression — but recommended if visual diff is desirable.
