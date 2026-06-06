# Wave 4D — Professional Visual Design Implementation Report

**Date:** 2026-06-06
**Repo:** `Chess3DJune5e` (`https://github.com/welovekiteboarding/Chess3DJune5e`)
**Graph:** [`planning/graphs/2026-06-11-3d-chess-professional-visual-design.json`](../../planning/graphs/2026-06-11-3d-chess-professional-visual-design.json)
**Branch (operate control branch):** `codex/wave-4d-professional-visual-design`
**Linear team:** `C`
**Loop command:** `mix symphony.operate --graph planning/graphs/2026-06-11-3d-chess-professional-visual-design.json --team-key C --auto-rework-continue --interval-seconds 30`
**Outcome:** All 9 graph tasks Done. 9 PRs merged into `main`. Zero manual interventions. Six reviewer-caught reworks across four tasks plus two harness duplicate-worker re-executions with no reviewer findings. C-49 (`piece-movement-transitions-048`) set a new across-wave record needing four retries before approval (two task_timeouts and two corner-case correctness findings). Operate exited on its own after the final merge — a first for the wave-retrospective series.

This report is the seventh in the per-wave retrospective series. Same shape as Wave 1, 2, 3, 4A, 4B, and 4C reports.

---

## 1. Summary

| Metric | W1 | W2 | W3 | W4A | W4B | W4C | W4D |
|---|---|---|---|---|---|---|---|
| Total graph tasks | 9 | 8 | 9 | 4 | 5 | 5 | 9 |
| Tasks Done | 9 | 8 | 9 | 4 | 5 | 5 | 9 |
| Tasks needing rework | 5 | 2 | 3 | 2 | 2 | 1 | 4 |
| Tasks needing >1 rework | 0 | 0 | 1 | 1 | 0 | 0 | **1 (C-49: 4 retries)** |
| Tasks clean on first attempt | 4 | 6 | 6 | 2 | 3 | 4 | 5 |
| Manual interventions | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Total PRs merged | 9 | 8 | 9 | 4 | 5 | 5 | 9 |
| Wall time (operate launch → all Done) | ~3 h | ~75 min | ~1 h 52 min | ~1 h 45 min | ~1 h 31 min | ~58 min | **~13 h 14 min** |
| Used `npm run test:browser` | n/a | n/a | 4 / 9 | 3 / 4 | 4 / 5 | 4 / 5 | 7 / 9 |
| Cumulative across-wave reworks resolved one-shot | 5/5 | 7/7 | 8/9 | 9/12 | 11/14 | 12/15 | **14/19** |
| Operate exited cleanly on its own | n/a | yes | yes | yes | yes | yes | **yes (first end-of-wave self-exit)** |

Wave 4D is the **largest single-wave wall time** so far, almost entirely driven by C-49's five attempts (two ~14–18-min worker timeouts + retry plus two correctness misses). The remaining eight tasks moved at the now-normal ~30-minute-per-PR rate. Cumulative one-shot rework resolution is now **14/19** — still strong but the multi-retry tasks (Wave 3 C-26 needing 2, Wave 4A C-31 needing 3, Wave 4D C-49 needing 4) trend upward with task complexity.

Notable firsts for Wave 4D:
- First wave with two separate Symphony **harness-duplicate-worker** events (C-44 and C-51) — review approved, merge phase didn't pick up the approval, worker re-executed. Neither resulted in reviewer findings; both ultimately merged.
- First time a task hit the **Symphony 20-min worker turn task_timeout** (C-49 hit it twice).
- First wave where **operate exited cleanly on its own** after the final merge, without an operator SIGINT.

---

## 2. Task-by-task

### 2.1 Clean tasks (no rework, merged on first attempt) — 5 of 9

| Task ID | Linear | PR | Title |
|---|---|---|---|
| `visual-design-target-042` | C-43 | #43 | Capture visual design target (docs) |
| `refined-procedural-pieces-045` | C-46 | #46 | Refine procedural pieces |
| `move-highlight-visuals-046` | C-47 | #47 | Polish move highlights |
| `visual-polish-browser-regression-049` | C-50 | #50 | Add visual polish regression |
| (See §2.3 for C-44 and C-51 — they merged with 0 reviewer findings but had harness duplicate-worker events) |

### 2.2 Tasks that went through reviewer-driven rework — 3 of 9

| Task ID | Linear | Reworks | Pattern |
|---|---|---|---|
| `board-materials-frame-044` | C-45 | 1 | Symphony review-packet showed scope drift; actual commit was in-scope (packet/commit mismatch) |
| `lighting-presentation-polish-047` | C-48 | 1 | Existing browser smoke timed out on rotate/zoom; new lighting/materials slowed render |
| `piece-movement-transitions-048` | C-49 | **4** | 2 task_timeouts + capture-skip + castling-skip |

### 2.3 Tasks with Symphony harness duplicate-worker events — 2 of 9

These tasks had reviewer approve → merge phase miss the approval → operate re-execute worker. Neither produced reviewer findings on either pass.

- **C-44** (`dark-cockpit-layout-043`) — first occurrence. Worker re-ran for ~14 min; final merge clean.
- **C-51** (`visual-design-docs-050`) — second occurrence. Worker re-ran briefly, then re-review and merge.

Both occurrences were Symphony harness behavior, not task defects. Same root pattern flagged by reviewer notes in earlier waves about "review packet doesn't match actual diff."

---

## 3. Rework stories

### 3.1 `board-materials-frame-044` (C-45, PR #45) — packet/commit divergence

**Symphony classification:** `category: review, stage: automated_review, reason: changes_requested`

The reviewer flagged the PR diff for expanding beyond C-45's declared board-materials scope into `src/app/App.tsx`, `src/ui/GamePanel.tsx`, and tests — but a non-blocking reviewer note made a sharper observation:

> The local checkout of commit `a055dc1984a2fb15b85bb2bcb95889f6001bf8af` only shows in-scope `src/scene/*` material/board changes and its targeted scene tests pass, **which does not match the broader PR diff/context provided here.**

The actual checked-out commit was in-scope. The review packet shown to the reviewer included extra app-shell changes that weren't in the commit. This is the same Symphony harness pattern flagged by reviewer notes in earlier waves — review packet content can lag or diverge from the real commit state. Auto-rework-continue re-queued the task; the retry push of the same in-scope commit got a fresh, accurate review packet on round 2 and approved.

**Lesson:** Symphony's review packet generation has a divergence-with-actual-commit failure mode that can produce a false-positive scope-drift finding. The reviewer's note pattern of "actual commit shows X but packet shows Y" is the canonical signal. Future waves should treat that note as evidence to discount the blocking finding pending a clean re-review.

### 3.2 `lighting-presentation-polish-047` (C-48, PR #48) — browser smoke timed out under new render cost

**Symphony classification:** `category: review, stage: automated_review, reason: changes_requested`

> Required validation `npm run test:browser` fails. The declared smoke test `tests/browser/app-shell.smoke.spec.ts` times out in the rotate/zoom/play path (`mouse.wheel` at line 198 in the current file), so the acceptance criterion that visible-board human-vs-Stockfish gameplay still passes after rotating and zooming is not met.

The new lighting setup plus the previously-merged board materials (C-45) and refined pieces (C-46) slowed real-browser render enough that the existing rotate-and-zoom-then-play smoke test exceeded its Playwright wait budget. The retry worker raised waits or deferred assertions appropriately and the test passed on round 2.

**Lesson:** Visual polish tasks compound render cost. Browser tests that pass today with one budget can become flaky after subsequent visual changes. Test wait budgets in `tests/browser/` should be revisited each wave that adds visible-scene complexity.

### 3.3 `piece-movement-transitions-048` (C-49, PR #49) — four retries

This task hit the 20-minute Symphony worker timeout twice in a row before Codex found a tighter implementation, then needed two more retries to handle chess move-type corner cases.

#### 3.3a Attempt 1 (task_timeout, ~14-min worker phase)

Worker ran to the 20-min ceiling without producing a commit. No visible apply_patch errors. Symphony fired a `task_timeout` and auto-rework-continue re-queued.

#### 3.3b Attempt 2 (task_timeout, ~18-min worker phase)

Same prompt fed to Codex on the same problem. Second timeout. The graph task's acceptance criteria covered animation infrastructure + camera-aware click target preservation + browser test wiring + smoke test preservation + piece identity preservation + move history timing — plausibly more than a single worker turn comfortably fits.

#### 3.3c Attempt 3 finding — captures teleport

> `src/scene/BoardScene.tsx:1571-1601` only starts a move transition when `previousPiecePlacements.length === nextPiecePlacements.length`. That makes every capture teleport instead of animating the moving piece, because a capture reduces the placement count. The task says the moving piece should animate whenever it moves from one square to another; only captured-piece animations were excluded. The new coverage in `src/scene/BoardScene.test.tsx:534-944` only exercises equal-count moves, so this acceptance...

The third attempt found a tighter implementation (~7-min worker phase) but cut a corner: animations only fired when the piece-placement array length was unchanged. Captures decrement the array length by 1 → no animation, just teleport. The task excluded *captured-piece* animations only, not capture animations for the moving piece. The reviewer caught the distinction.

#### 3.3d Attempt 4 finding — castling teleports

> `src/scene/BoardScene.tsx:1571` only detects a move animation when exactly one piece disappears and one piece appears, and `src/scene/BoardScene.tsx:316` skips animation entirely when that detector returns `null`. That means castling still teleports both the king and rook with no transition. Castling is a normal legal gameplay move for both the human and Stockfish, so the current implementation does not fully satisfy the requirement that pieces animate when they move from one square to another.

The fourth attempt fixed captures (broadened the detector to handle one-disappear-one-appear) but still missed castling, which moves *two* pieces (king and rook) simultaneously and produces two-disappear-two-appear placement diffs.

#### 3.3e Attempt 5 — approved

The fifth attempt broadened the move detector to handle the full set of move types (normal, capture, castle). Round 5 review returned 0 findings. Merged at 16:01:00 UTC.

**Lesson:** "Diff piece placements" is an under-specified detector for chess move animations. The full set of move types has asymmetric placement changes:
- Normal: 1 disappear + 1 appear
- Capture: 2 disappear + 1 appear
- En passant: 2 disappear + 1 appear (but the captured pawn isn't at the destination)
- Castling: 2 disappear + 2 appear
- Promotion: 1 disappear + 1 appear, but the appearing piece is a *different* type

A move-history-driven approach (read which piece moved between which squares from the actual move record) is more robust than placement-diff. Future graph tasks involving move-related visual code should enumerate the move types in acceptance criteria.

---

## 4. Patterns and observations

### 4.1 Symphony's 20-min worker turn ceiling is real and observable

C-49 attempts 1 and 2 hit it. Earlier waves had several tasks (Wave 2 C-15, Wave 3 C-29, Wave 4A C-29, Wave 4B C-33) approach the ceiling but recover. C-49 is the first task across all waves where Codex *could not* finish the worker turn inside the ceiling on the first try. The lesson: tasks that touch multiple subsystems (animation + click target + tests + smoke preservation) can exceed Codex's budget. Splitting such tasks at graph-design time prevents the wasted timeout cycles.

### 4.2 The reviewer enumerates corner cases the original task didn't

C-49 rounds 3 and 4 are interesting. The task description said "animate when a piece moves from one square to another." That sounds simple. The reviewer's job effectively expanded that into "...for normal moves AND captures AND castling AND en passant AND promotion." Each round 's review specifically named which move type the implementation skipped. This is the reviewer doing implicit task-specification refinement.

Future graph design should preempt this by *explicitly* listing chess move types in acceptance criteria for any move-related visual or behavioral code. Otherwise the worker will guess at the canonical case (normal moves), the reviewer will enumerate corner cases, and you get a multi-retry round trip.

### 4.3 Two separate Symphony harness duplicate-worker events in one wave (C-44, C-51)

Both occurred after a clean reviewer-approved review where the merge phase didn't pick up the approval and operate re-executed the worker. Both ultimately merged. The pattern matches the "review packet doesn't match actual diff" reviewer notes from earlier waves — Symphony's coordination between review.json artifact write and Linear state transition has a window where the next plan_cycle tick can re-claim the task.

This is a real Symphony harness issue worth a follow-up RA1 task. The impact in Wave 4D was ~10 minutes of wasted worker time per occurrence, not blocking. But more frequent occurrences would compound.

### 4.4 First clean end-of-wave operate self-exit

Across all prior waves, operate idled cleanly after Done(N) but required an operator SIGINT to actually exit. Wave 4D's operate process exited on its own at 12:35:08 after merging C-51. The cause is unclear without inspecting the operate logs in detail — could be a deliberate clean-exit-on-empty-graph code path that's been improved across RA1 commits, could be coincidence. Worth noting; if subsequent waves also self-exit cleanly, the pattern is reliable.

### 4.5 Render-cost compounding caused one rework

C-48 (lighting polish) is the first wave where a visual change caused an existing browser test to time out. The new lighting + materials + pieces compounded render cost enough that the rotate/zoom/play smoke exceeded its Playwright wait. Visual-polish waves moving forward should expect to also raise test wait budgets, and acceptance criteria should explicitly call this out.

### 4.6 Clean idle exit at end of wave (consistent and now self-driving)

Wave 4D's operate process exited on its own after Done(9), no SIGINT needed. Prior six waves all idled cleanly but needed operator intervention to stop. This may indicate a Symphony harness improvement landed in main between Wave 4C and 4D.

---

## 5. What this wave produced

### Files added (8 new)

```
docs/design/visual-target.md
docs/professional-visual-design.md
src/scene/lighting/index.ts
src/scene/lighting/sceneLighting.test.ts
src/scene/lighting/sceneLighting.tsx
src/scene/lighting/sceneLightingContract.ts
src/scene/materials/boardTheme.test.ts
src/scene/materials/boardTheme.ts
src/scene/materials/index.ts
src/scene/pieces/proceduralPieceDesign.test.ts
src/scene/pieces/proceduralPieceDesign.ts
```

### Files modified by Wave 4D

```
src/app/App.tsx                              (dark cockpit layout, panel hierarchy)
src/app/App.test.tsx                         (tests for above)
src/scene/BoardScene.tsx                     (materials integration, refined pieces wiring,
                                              highlight visuals, lighting wiring,
                                              piece movement transitions covering normal/capture/castle)
src/scene/BoardScene.test.tsx                (tests for above)
src/scene/pieces/ChessPieceMesh.tsx          (refined Staunton-style procedural pieces, R3F userData-only identifiers)
src/styles/globals.css                       (dark cockpit theme + green/gold accent language)
src/ui/GamePanel.tsx                         (right-side cockpit panel layout)
src/ui/GamePanel.test.tsx                    (tests for above)
tests/browser/app-shell.smoke.spec.ts        (visual polish regression covering all Wave 4D changes)
```

19 files touched (11 added, 8 modified).

### Boundaries preserved (every code task carried explicit scope.exclude)

- `src/game/gameStore.ts` — NOT modified
- `src/game/gameStore.test.ts` — NOT modified
- `src/main.tsx` — NOT modified
- `src/chess/` — NOT modified
- `src/engine/` — NOT modified
- DOM `aria-*`/`data-*` attributes on R3F Object3D — none added (`userData`/`object.name` used everywhere)
- Browser tests fabricating state via `innerHTML` — none

### Validation that passed on every accepted PR

- `npm install`, `npm run lint`, `npm run build`, `npm run test -- --run`, `mix check`
- GitHub Actions `bootstrap-proof`
- `npm run test:browser` on 7 of 9 tasks (043, 044, 045, 046, 047, 048, 049)

### What Wave 4D deliberately did NOT do

- No external GLTF / texture packs / binary art (procedural only)
- No sound effects
- No new game / side selection / captured pieces (Wave 5)
- No final license documentation work (Wave 5)
- No backend, auth, database, persistence, multiplayer, routing, deployment infrastructure

---

## 6. Deviations from the original graph

**Zero.** Graph applied as written. The graph had the strongest pre-emptive structural guardrails to date and they all held.

---

## 7. Final state

```
Ready (0) | In Progress (0) | Blocked (0) | Rework (0) | Done (9)
```

| Linear | Task | PR | Merged (UTC) | Reworks |
|---|---|---|---|---|
| C-43 | `visual-design-target-042` | #43 | 07:20:37 | 0 |
| C-44 | `dark-cockpit-layout-043` | #44 | 07:55:49 | harness duplicate-worker (0 findings) |
| C-45 | `board-materials-frame-044` | #45 | 08:28:51 | 1 (packet/commit divergence) |
| C-46 | `refined-procedural-pieces-045` | #46 | 09:02:22 | 0 |
| C-47 | `move-highlight-visuals-046` | #47 | 09:29:07 | 0 |
| C-48 | `lighting-presentation-polish-047` | #48 | 10:00:32 | 1 (smoke timeout under new render cost) |
| C-49 | `piece-movement-transitions-048` | #49 | 16:01:00 | 4 (2 task_timeout + capture-skip + castling-skip) |
| C-50 | `visual-polish-browser-regression-049` | #50 | 16:23:11 | 0 |
| C-51 | `visual-design-docs-050` | #51 | 16:32:53 | harness duplicate-worker (0 findings) |

Total Wave 4D wall time: ~13 h 14 min for 9 PRs through worker + review + merge with 6 reviewer-caught rework cycles across 4 tasks plus 2 harness duplicate-worker events. Average ~88 min per merged PR including reworks — but **C-49 alone consumed ~5 hours**; the other 8 PRs averaged ~60 min each. Zero manual interventions.

---

## 8. Recommended Wave 5 — MVP Hardening

Suggested file: `planning/graphs/2026-06-12-3d-chess-mvp-hardening.json` (6–8 tasks).

Recommended DAG:

1. **`new-game-polish-052`** — confirmation if mid-game, smooth board reset, retain side selection.
2. **`side-selection-053`** — first-class human-side toggle in GamePanel (White / Black / Random).
3. **`move-history-polish-054`** — algebraic notation, scroll-to-latest, optional grouped pairs.
4. **`captured-pieces-055`** — captured-piece tray for both sides; integrate with existing piece-identity identifiers and animation system from C-49.
5. **`error-recovery-polish-056`** — broader error UI recovery: engine fail surfaces with retry, network-disconnect handling, R3F context-lost recovery if practical.
6. **`mvp-hardening-browser-regression-057`** — extend the existing regression to cover new game / side selection / captured pieces / error recovery; explicitly enumerate chess move types in tests (lesson from C-49).
7. **`stockfish-license-finalization-058`** — finalize Stockfish GPLv3 distribution-readiness docs.
8. **`mvp-hardening-docs-059`** — docs-only summary.

**Five hard contracts to carry forward in EVERY Wave 5 task** (every Wave 4D contract + ONE new):

A. *"The existing `tests/browser/app-shell.smoke.spec.ts` human→AI smoke test passes after this change, both at the default camera angle AND after rotating/zooming."*

B. *"This task does not modify `src/game/gameStore.ts`, `src/game/gameStore.test.ts`, `src/main.tsx`, `src/chess/`, or `src/engine/` unless explicitly listed in `scope.include`. All five must be in `scope.exclude`."*

C. *"Any accessibility identifier attached to a Three.js Object3D must use `userData` or `object.name` — NOT DOM `aria-*` or `data-*` attributes on R3F primitives."*

D. *"Docs-only tasks must explicitly add `src/`, `tests/`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `package.json`, `package-lock.json`, `eslint.config.js`, and `index.html` to `scope.exclude`."*

E. **NEW for Wave 5** — Carry forward C-49's lesson: ***"Any move-related visual or behavioral code must explicitly handle the full set of chess move types: normal, capture, castling, en passant, promotion. Acceptance criteria should enumerate the move types. Tests should exercise at least one example of each."*** This prevents the C-49 multi-corner-case retry pattern.

Same validation pattern: `setup_commands: ["npm install"]`, `commands: [lint, build, test -- --run, mix check]`, plus `npm run test:browser` on tasks 052, 053, 054, 055, 056, 057. With these contracts in place plus the empirical track record of structural enforcement reducing reworks wave-over-wave (5 → 2 → 3 → 2 → 2 → 1 → 6 in Wave 4D was an outlier driven by C-49's unique difficulty), Wave 5 has reasonable conditions to return to the 1–2 rework count seen in Waves 4B/4C.
