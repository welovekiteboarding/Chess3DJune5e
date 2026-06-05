# Wave 3 — Reliable Stockfish Auto-Play Report

**Date:** 2026-06-05
**Repo:** `Chess3DJune5e` (`https://github.com/welovekiteboarding/Chess3DJune5e`)
**Graph:** [`planning/graphs/2026-06-07-3d-chess-stockfish-gameplay.json`](../../planning/graphs/2026-06-07-3d-chess-stockfish-gameplay.json)
**Branch (operate control branch):** `codex/wave-3-stockfish-gameplay`
**Linear team:** `C`
**Loop command:** `mix symphony.operate --graph planning/graphs/2026-06-07-3d-chess-stockfish-gameplay.json --team-key C --auto-rework-continue --interval-seconds 30`
**Outcome:** All 9 graph tasks Done. 9 PRs merged into `main`. Zero manual interventions. Four auto-resolved reworks across three tasks. The MVP's central claim — real-browser human-vs-Stockfish auto-play — is now automatically validated by a Playwright smoke test the loop wrote and the loop verified.

This report is the third in the per-wave retrospective series. It follows the same structure as `docs/waves/wave-1-foundation-report.md` and `docs/waves/wave-2-human-interaction-report.md`.

---

## 1. Summary

| Metric | Wave 1 | Wave 2 | Wave 3 |
|---|---|---|---|
| Total graph tasks | 9 | 8 | 9 |
| Tasks Done | 9 | 8 | 9 |
| Tasks needing rework | 5 | 2 | 3 |
| Tasks needing >1 rework | 0 | 0 | 1 (C-26, two retries) |
| Tasks clean on first attempt | 4 | 6 | 6 |
| Manual interventions | 0 | 0 | 0 |
| Total PRs merged | 9 | 8 | 9 |
| Wall time (operate launch → all Done) | ~3 h | ~75 min | ~1 h 52 min |
| Average minutes per merged PR (incl. reworks) | ~20 | ~9 | ~12 |
| Used `npm run test:browser` | n/a | n/a | yes, on 4 of 9 tasks |
| Cumulative reworks resolved one-shot | 5 / 5 | 2 / 2 | 3 / 4 (C-26 needed two retries) |

Wave 3 was meaningfully faster than Wave 1 despite introducing Playwright cold-install and four real-browser test runs. It was slower than Wave 2 because C-26 needed two retries and because each browser-test task added 30–60 s for the actual browser-runtime validation. Across all three waves: **8 of 9 reworks now resolved on the first retry; 1 of 9 needed a second retry.** Auto-rework-continue's one-shot resolution rate dipped slightly here but every rework still resolved without manual help.

---

## 2. Task-by-task

### 2.1 Clean tasks (no rework, merged on first attempt) — 6 of 9

| Task ID | Linear | PR | Title |
|---|---|---|---|
| `stockfish-real-browser-boot-020` | C-21 | #21 | Boot real Stockfish in browser |
| `stockfish-auto-play-loop-021` | C-22 | #22 | Formalize AI auto-play loop |
| `engine-difficulty-mapping-022` | C-23 | #23 | Map engine difficulty levels |
| `engine-thinking-state-023` | C-24 | #24 | Show engine thinking state |
| `stockfish-browser-smoke-026` | C-27 | #27 | Add Stockfish browser smoke test |
| `stockfish-license-docs-027` | C-28 | #28 | Document Stockfish gameplay |

Notable that the **central runtime claim — `stockfish-auto-play-loop-021` and `stockfish-browser-smoke-026` — both landed clean.** The auto-play loop logic and the real-browser exchange smoke test that proves it both passed first-attempt review. The reworks clustered around the failure-handling tasks (cancel, error handling), which are conceptually the hardest part of a concurrency-aware system.

### 2.2 Tasks that went through rework — 3 of 9

| Task ID | Linear | Reworks | Root cause family |
|---|---|---|---|
| `browser-test-harness-019` | C-20 | 1 | Scope spillover (Playwright test-results artifact) |
| `engine-cancel-control-024` | C-25 | 1 | Concurrency race (cancel-vs-await) |
| `engine-error-handling-025` | C-26 | 2 | First: regression (dead-end cancel); second: under-specification (timeouts not actually bounded) |

---

## 3. Rework stories

### 3.1 `browser-test-harness-019` (C-20, PR #20) — Playwright test-results not gitignored

**Symphony classification:** `category: review, stage: automated_review, reason: changes_requested`

**What happened on the first attempt:** the Codex worker chose Playwright as the browser test runner (a reasonable pick given the existing Vite/Vitest setup), added the dependency, wrote `playwright.config.ts`, wrote a small smoke test, and wired `npm run test:browser`. Validation passed. But Playwright writes a `test-results/.last-run.json` artifact next to the spec on every run, and the worker did not pre-gitignore it. The artifact landed in the PR.

The reviewer flagged the scope spillover:

> `test-results/.last-run.json` is a generated Playwright artifact that falls outside the declared task scope and is not required for the browser harness itself. This is unnecessary scope spillover; remove it from the PR before approval.

**What changed on the retry:** the rework prompt told the worker about the artifact. The retry added `test-results/` to `.gitignore` and removed the file from the index. The next review returned `approved`. Merged at 19:08:59 UTC.

**Lesson:** every new test-runner introduction in a fresh worktree should pre-emptively gitignore that runner's generated artifacts. This is the same pattern as Wave 1's C-2 (which committed `dist/` and `node_modules/`) — different artifact, same class of mistake. The finalization scope-validator catches some of these (when the path is in `scope.exclude`), but new artifact paths introduced by new tooling will slip through unless either the graph author lists them in `scope.exclude` or the worker pre-emptively gitignores them.

### 3.2 `engine-cancel-control-024` (C-25, PR #25) — cancellation race reproduced by reviewer

**Symphony classification:** `category: review, stage: automated_review, reason: changes_requested`

**What happened on the first attempt:** the worker implemented `cancelAiMove()` in the store, wired the cancel button in `GamePanel`, and added the cancellation path through the engine adapter. The fake-transport unit tests for cancel-during-pending-request passed. But the reviewer found and reproduced a real race condition:

> src/game/gameStore.ts:312-317 and 379-396: cancellation is not safe if it happens while `engine.setDifficulty()` is still awaiting. `cancelAiMove()` clears store thinking state and calls `engine.cancelSearch()`, but `requestAiMove()` does not re-check whether the request was cancelled before it proceeds to `engine.requestBestMove()`. I reproduced this with a fake async `setDifficulty()`: after cancel, the store reports the request as superseded, but `requestBestMove()` still starts afterward, leaving a hidden engine search running and creating follow-on race/failure risk for the next AI request.

**Reviewer non-blocking note:**

> Declared validation passed in this workspace: `npm run lint`, `npm run build`, `npm run test -- --run`, and `mix check`.

This is a step beyond ordinary review behavior: **the reviewer wrote a fake async `setDifficulty()` to actively reproduce the bug.** That's a deeper analysis than diff-reading. The race window is between the cancellation flag being cleared by `cancelAiMove()` and the awaited `setDifficulty()` returning inside `requestAiMove()` — the worker checked cancellation before the await but not after.

**What changed on the retry:** the rework prompt carried the finding verbatim. The retry worker added a post-await cancellation re-check (a guard before `engine.requestBestMove()` is called, after the awaited `engine.setDifficulty()` returns). The round-2 review returned `approved`. Merged at 20:14:43 UTC.

**Lesson:** the reviewer is willing to construct fake test harnesses to reproduce concurrency bugs that unit tests didn't cover. That meaningfully raises the practical bar of what "review" catches.

### 3.3 `engine-error-handling-025` (C-26, PR #26) — two distinct reworks

This was the only Wave 3 task to need more than one retry.

#### 3.3a Round 1: dead-end cancel regression

**Round 1 finding:**

> `cancelAiMove()` introduces a dead-end game state with no recovery path for the current position. In `src/game/gameStore.ts:391` it sets `isAiAutoPlayBlocked: true`; then `src/app/App.tsx:63` refuses to auto-call `requestAiMove()` while that flag is set, and `src/game/gameStore.ts:133` still blocks human interaction when it is the AI side to move. `src/ui/GamePanel.tsx:124` exposes a new `Cancel AI move` button but no retry/resume control, so pressing it leaves the current game stuck unless the user abandons progress with `New game`. That is a material regression introduced by this change.

**Reviewer non-blocking notes:**

> `npm run lint`, `npm run build`, `npm run test -- --run`, and `mix check` all passed on commit `f4a8897e4974dd75d81c5b3c1466827d0a62f164`.
>
> The reviewed commit itself stays within the declared issue scope; the broader file list in the task text appears to describe wider PR context rather than this specific commit.

What happened: the worker, trying to defend against the cancel race from C-25, over-corrected by introducing a permanent `isAiAutoPlayBlocked` flag in `cancelAiMove()`. The flag did its job — auto-play would not restart spuriously — but it also blocked auto-play *forever* with no resume path, while the existing input-block-on-AI's-turn was still active. Result: a stuck game after every cancel. The reviewer traced through three files to identify the interaction.

#### 3.3b Round 2: bounded error handling not actually bounded

The round-1 retry fixed the dead-end-cancel regression. But the reviewer caught a different defect in round 2:

**Round 2 finding:**

> src/engine/stockfishEngine.ts:222-234 and 382-389 still wait indefinitely for `uciok`, `readyok`, and ultimately a `bestmove` line, with no timeout or other bound. If the worker stalls instead of throwing, `requestBestMove()` never settles, so `src/game/gameStore.ts:301-377` leaves `isEngineThinking` stuck `true` and never records a user-visible error. That still violates the issue's bounded error-handling requirement and the requirement that the app must not silently spin forever.

The task's stated requirement was **bounded** engine error handling, not just exception handling around the engine. The first retry added catch handlers but didn't add timeouts on the engine init waits. The reviewer was literal about the contract: an unbounded `await` for `uciok` is still unbounded, even if exceptions get caught when they happen. A worker that hangs silently instead of throwing would leave the app spinning forever.

**Round 3 retry result:** approved. The worker added real wall-clock timeouts to the engine init/best-move waits, plus tests for the timeout path. The round-3 review returned 0 findings. Merged at 20:47:53 UTC.

**Lesson:** for tasks whose stated requirement uses words like "bounded," "deterministic," or "no unbounded retries," the reviewer enforces those words literally. A retry that addresses an adjacent concern but doesn't satisfy the literal requirement will be sent back. This is a feature, not a bug — it pushes workers toward actually implementing the stated invariant rather than only addressing visible symptoms.

---

## 4. Patterns and observations

### 4.1 Reviewer reproduces bugs

C-25's review wrote a fake async `setDifficulty()` to reproduce the cancellation race. C-26's first review traced three files (`gameStore.ts:391`, `App.tsx:63`, `gameStore.ts:133`, `GamePanel.tsx:124`) to construct the dead-end-cancel scenario. C-26's second review located the specific unbounded `await` lines. None of these were possible from reading the diff alone — the reviewer is actively investigating the integrated behavior.

This raises the practical floor of what "review approves" means in Wave 3 territory. The reviewer is functioning more as an investigator than a checker.

### 4.2 Reviewer non-blocking notes are operationally useful

Several Wave 3 reviews included `notes` (separate from blocking `findings`). These don't stop the merge but document operational truths:

- "Declared validation passed in this workspace" (C-25, C-26 rounds 1 and 2) — useful: confirms the issue isn't a stale validator.
- "The broader file list in the task text appears to describe wider PR context rather than this specific commit" (C-26) — useful: tells the operator the review packet may be lagging the actual PR state, which is consistent with the same observation made during Wave 2 C-18.

This is a useful pattern: notes give operators visibility into reviewer methodology without blocking work.

### 4.3 Wave 3's reworks clustered in the failure-handling tasks

Six of nine tasks landed clean on first attempt, and the three that needed rework were specifically the ones dealing with cancellation, race conditions, or bounded-error-handling. The straight-line gameplay tasks (auto-play loop, difficulty mapping, thinking state, the actual real-browser smoke test) all landed clean.

This pattern matches a general intuition: happy-path logic is easier to get right on first attempt than failure-handling logic. The reviewer's role is more load-bearing on failure-handling tasks than on happy-path tasks.

### 4.4 The C-26 multi-retry escalation worked

C-26 is the first task across three waves to need more than one retry. The fact that auto-rework-continue handled it without manual intervention is meaningful: each retry got a sharper, more specific finding (round 1: "you broke cancel"; round 2: "your bounds are not bounds"), and the worker incrementally tightened the implementation until the literal stated requirement was met. This suggests the auto-rework-continue loop does not have a hard cap on retries — it'll keep trying as long as the reviewer's findings change.

In practice this is bounded by the total operate runtime + the user's patience, but for short retries on small focused tasks the multi-retry path is viable.

### 4.5 Browser-test infrastructure cost was paid once, amortized across four tasks

Task C-20 (browser-test-harness-019) carried the cold install of Playwright and its browser binaries. Tasks C-21, C-22, C-27 each reused the user-global Playwright browser cache and were comparable in wall time to non-browser tasks. The graph's ordering (harness first, then everything that needs it) was correct: putting the harness install on the first task amortizes the cost.

### 4.6 Real-browser smoke test landed clean

C-27 (`stockfish-browser-smoke-026`) — the wave's central MVP-validation claim — opened PR #27, passed `npm run test:browser` during finalization, and was approved by the reviewer with 0 findings on first attempt. The test performs a real human move in a real browser, observes Stockfish thinking state, observes it clear after Stockfish responds, and verifies move history reflects both moves — without screenshots or pixel assertions.

**This is the first wave whose central runtime claim is automatically validated by an automated browser test, not just by inspection of the code.** Future waves now have a regression guard.

### 4.7 What the loop still does NOT catch

The browser smoke test is one exchange — one human move, one AI response, on the default difficulty, with default starting position. It doesn't validate:
- Long games (will the engine still be responsive after 30 moves?)
- Endgame positions (does the bounded-error handling fire correctly when Stockfish enters a long search?)
- Cancel timing during the actual real-browser flow (the unit tests cover this with fake transport; the smoke test doesn't exercise it)
- Difficulty changes during play
- Network-disconnect or worker-crash scenarios in the browser

These are reasonable Wave 5 (MVP Hardening) targets.

### 4.8 The end-of-wave operate idle behavior matches Wave 2

Unlike Wave 1 (which crashed at the end with `plan_cycle: review failed: :timeout`), Wave 3 idled cleanly after Done(9) — same as Wave 2. Each subsequent 30 s tick observed `Ready(0) / In Progress(0) / Blocked(0) / Rework(0) / Done(9)` and emitted `plan_cycle: materialized 0 task(s)` without crashing. The user stopped operate with SIGINT after the wave was fully verified Done.

Two consecutive waves with clean idle exit suggests this is now the normal end-of-wave behavior.

---

## 5. What this wave produced

### Files added (4 new, vs Wave 2 main)

```
playwright.config.ts
vitest.config.ts
tests/browser/app-shell.smoke.spec.ts        (and the human→AI smoke test in the same dir)
docs/stockfish-gameplay.md
```

### Files modified by Wave 3

```
package.json                       (+ Playwright + test:browser script)
package-lock.json                  (regenerated)
.gitignore                         (+ test-results/ added during C-20 rework)
vite.config.ts                     (browser-test harness wiring)
src/main.tsx                       (real Stockfish factory wired for production)
src/engine/engineTypes.ts          (cancellation + error types)
src/engine/stockfishEngine.ts      (real browser boot, bounded timeouts, cancel)
src/engine/stockfishEngine.test.ts (tests for above)
src/engine/stockfishProtocol.ts    (error-handling refinements)
src/engine/stockfishProtocol.test.ts
src/game/gameStore.ts              (auto-play loop, thinking state, cancel, error)
src/game/gameStore.test.ts
src/app/App.tsx                    (auto-play wiring, difficulty, thinking, cancel)
src/app/App.test.tsx
src/ui/GamePanel.tsx               (difficulty control, thinking, cancel, error display)
src/ui/GamePanel.test.tsx
```

The Wave 2.5 patch to the embedded harness (`lib/symphony_1/planning/graph.ex` plus the two `test/unit/planning/` tests) also lives between this report and Wave 2's report, since it was committed after Wave 2 closed.

### Boundaries preserved

- UI components do not import `stockfish` directly.
- `BoardScene` does not import `stockfish` directly.
- `GamePanel` does not import `stockfish` directly.
- Stockfish remains behind `src/engine/stockfishEngine.ts` and the engine factory boundary established in Wave 1.
- AI moves continue to be validated through `src/chess/chessRules.ts` before applying to the store.
- The store coordinates rules and engine adapter without rendering or owning Stockfish details.

### Validation that passed on every accepted PR

- `npm install` (setup), `npm run lint`, `npm run build`, `npm run test -- --run`, `mix check`
- `npm run test:browser` on tasks 019, 020, 021, 026
- GitHub Actions `bootstrap-proof` workflow

### What Wave 3 deliberately did NOT do

- No GLTF piece models, professional materials, or polished animations (Wave 4)
- No new game / side selection / captured-pieces panel (Wave 5)
- No backend services, auth, database, persistence, multiplayer, routing, deployment infra
- No new graph allowlist commands beyond what Wave 2.5 already added (`npm run test:browser`)

---

## 6. Deviations from the original graph

**Zero.** The graph applied exactly as written. The control branch `codex/wave-3-stockfish-gameplay` was created before launching operate, as required by Symphony's graph-mutating-command guard.

---

## 7. Final state

```
Ready (0) | In Progress (0) | Blocked (0) | Rework (0) | Done (9)
```

| Linear | Task | PR | Merged (UTC) | Reworks |
|---|---|---|---|---|
| C-20 | `browser-test-harness-019` | #20 | 2026-06-05 19:08:59 | 1 |
| C-21 | `stockfish-real-browser-boot-020` | #21 | 2026-06-05 19:21:52 | 0 |
| C-22 | `stockfish-auto-play-loop-021` | #22 | 2026-06-05 19:38:12 | 0 |
| C-23 | `engine-difficulty-mapping-022` | #23 | 2026-06-05 19:47:24 | 0 |
| C-24 | `engine-thinking-state-023` | #24 | 2026-06-05 19:55:39 | 0 |
| C-25 | `engine-cancel-control-024` | #25 | 2026-06-05 20:14:43 | 1 |
| C-26 | `engine-error-handling-025` | #26 | 2026-06-05 20:47:53 | 2 |
| C-27 | `stockfish-browser-smoke-026` | #27 | 2026-06-05 20:56:25 | 0 |
| C-28 | `stockfish-license-docs-027` | #28 | 2026-06-05 21:00:53 | 0 |

Total Wave 3 wall-clock: ~1 h 52 min for 9 PRs through worker + review + merge with 4 rework cycles across 3 tasks. Average ~12 min per merged PR including reworks. Zero manual interventions.

---

## 8. Recommended Wave 4 — Professional 3D Visuals

Per the wave plan, Wave 4 = professional 3D visuals. Suggested file: `planning/graphs/2026-06-08-3d-chess-professional-visuals.json` (7 tasks).

Suggested DAG:

1. `board-materials-028` — replace placeholder squares with professional board geometry + alternating wood/stone-style materials (scope: `src/scene/BoardScene.tsx`, `src/scene/BoardScene.test.tsx`).
2. `procedural-piece-models-029` — replace placeholder pieces with procedural geometry composed from primitives. Avoid external GLTF to keep the task self-contained, unit-testable, and license-free (scope: `src/scene/pieces/`, `src/scene/BoardScene.tsx`).
3. `lighting-camera-030` — three-point lighting + orbit camera + sensible defaults (scope: `src/scene/lighting/`, `src/scene/BoardScene.tsx`).
4. `piece-movement-animation-031` — animate piece transitions ~200–400 ms when moves apply. Acceptance criteria must explicitly require that animations DO NOT defeat the existing test-IDs / accessible surface (otherwise C-27's browser smoke test breaks).
5. `responsive-layout-032` — board scales sensibly across viewport widths; UI panel reflows (scope: `src/app/App.tsx`, `src/styles/globals.css`, `src/ui/`).
6. `visuals-browser-smoke-033` — extend the existing browser smoke to assert the polished surface still permits a human→AI exchange (regression guard for the visuals refresh).
7. `visuals-docs-034` — docs-only task summarizing the visual design decisions.

**Hard contract to inherit explicitly in every Wave 4 task** (avoid cross-wave rework risk): each visuals task should include the acceptance criterion *"The existing `tests/browser/` smoke test for human→AI auto-play still passes after this change."* That guards against animations or layout changes inadvertently breaking the test-IDs / accessible labels the C-27 smoke test relies on.

Validation pattern unchanged: `setup_commands: ["npm install"]`, `commands: ["npm run lint", "npm run build", "npm run test -- --run", "mix check"]`. Add `"npm run test:browser"` before `mix check` on tasks 028, 029, 031, 033 (anything that touches the rendered surface or piece animation).

**For Wave 4 also consider** adding a Symphony-side validator entry for `npm run test:browser:visual` if you want a separate, optional perceptual-regression test (e.g., Percy / Chromatic) without blocking on it for every Wave 4 task. That would be a Wave 3.5 patch analogous to the Wave 2.5 patch.
