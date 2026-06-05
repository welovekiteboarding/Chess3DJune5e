# Wave 2 — Human Chess Interaction Report

**Date:** 2026-06-05
**Repo:** `Chess3DJune5e` (`https://github.com/welovekiteboarding/Chess3DJune5e`)
**Graph:** [`planning/graphs/2026-06-06-3d-chess-human-interaction.json`](../../planning/graphs/2026-06-06-3d-chess-human-interaction.json)
**Branch (operate control branch):** `codex/wave-2-human-interaction`
**Linear team:** `C`
**Loop command:** `mix symphony.operate --graph planning/graphs/2026-06-06-3d-chess-human-interaction.json --team-key C --auto-rework-continue --interval-seconds 30`
**Outcome:** All 8 graph tasks Done. 8 PRs merged into `main`. Zero manual interventions. Two auto-resolved reworks, both surfacing the same Wave-1-vs-Wave-2 contract conflict.

This report is the second in the per-wave retrospective series. It records what the Symphony harness actually did during Wave 2, with verbatim reviewer findings for each task that needed rework, in the same shape as `docs/waves/wave-1-foundation-report.md`.

---

## 1. Summary

| Metric | Wave 1 | Wave 2 |
|---|---|---|
| Total graph tasks | 9 | 8 |
| Tasks Done | 9 | 8 |
| Tasks needing rework | 5 | 2 |
| Tasks clean on first attempt | 4 | 6 |
| Manual interventions | 0 | 0 |
| Total PRs merged | 9 | 8 |
| Wall time (operate launch → all Done) | ~3 h | ~75 min |
| Average minutes per merged PR | ~20 | ~9 |

Wave 2 was roughly **2.5× faster** than Wave 1 by wall time and had **less than half the rework rate** (25 % vs 55 %). Two effects together: (a) the per-worktree `npm install` was largely cache-warm after Wave 1, shaving setup time, and (b) the cleaner up-front graph (already including `setup_commands: ["npm install"]` and `mix check` from the start) avoided the scope-validator and admission-policy reworks that hit Wave 1's first tasks.

Both Wave 2 reworks were caused by the same underlying cross-wave contract conflict — see §3 and §4.

---

## 2. Task-by-task

### 2.1 Clean tasks (no rework, merged on first attempt) — 6 of 8

| Task ID | Linear | PR | Title |
|---|---|---|---|
| `render-pieces-from-fen-010` | C-11 | #11 | Render pieces from FEN |
| `square-selection-011` | C-12 | #12 | Wire square selection |
| `legal-move-highlighting-012` | C-13 | #13 | Highlight legal moves |
| `legal-move-application-013` | C-14 | #14 | Apply legal human moves |
| `promotion-rules-support-014` | C-15 | #15 | Add promotion rules support |
| `promotion-ui-flow-015` | C-16 | #16 | Add promotion UI flow |

The clean tasks broadly trace the human-interaction data flow from "render pieces" → "select square" → "highlight legal moves" → "apply move" → "promotion rules" → "promotion UI". Each task adds one user-visible capability and is scoped to a tight set of files. None of these tasks cross into the AI-turn wiring inherited from Wave 1 — which is why all six landed clean.

### 2.2 Tasks that went through rework — 2 of 8

Both reworks surfaced the same Wave-1-vs-Wave-2 contract conflict: Wave 1's C-9 wired AI auto-play (`autoRequestAiMoves={true}` is the production default in `main.tsx` → `App.tsx`), but Wave 2's instructions said "do not trigger Stockfish; defer real human-vs-Stockfish play to Wave 3." Workers tried to satisfy the Wave 2 instruction; the reviewer caught them breaking the Wave 1 contract.

---

## 3. Rework stories

### 3.1 `turn-status-display-016` (C-17, PR #17) — broke AI auto-play to satisfy Wave 2 deferral instruction

**Symphony classification:** `category: review, stage: automated_review, reason: changes_requested`

**What happened on the first attempt:** the Codex worker implemented the live turn/status display correctly (`White to move`, `Check`, `Checkmate`, etc.) across `chessRules.ts`, `gameStore.ts`, `GamePanel.tsx`, and `App.tsx`. But the worker also tried to honor the Wave 2 instruction *"do not trigger the full AI response loop yet"* by flipping the default of the `autoRequestAiMoves` prop on `App.tsx` from `true` to `false`. The worker did not update the production caller in `main.tsx` to pass `autoRequestAiMoves={true}`, because that file was outside the task's `scope.include`.

The **Codex reviewer** read the full PR diff against `main.tsx`'s current behavior and flagged it:

> `src/app/App.tsx:55` changes `autoRequestAiMoves` to default to `false`, while `src/main.tsx:14` still renders plain `<App />` with no override. That means the shipped app no longer auto-requests Stockfish moves after a human move, and a game with the human on Black would never start. This is a core gameplay regression unrelated to the status-display goal, so the PR should not be approved until the default behavior is restored (or the production caller explicitly passes `autoRequestAiMoves={true}`).

**Reviewer non-blocking note:**

> The scope expansion into `src/chess/chessTypes.ts`, `src/scene/BoardScene.*`, and `src/ui/PromotionDialog.*` looks justified by the promotion-aware move flow and testability work; the blocker is the AI-turn regression, not the expanded file list.

This second observation is interesting: the reviewer separated "scope expansion" (acceptable here because it served the task's status-display goal) from "behavior regression" (unacceptable). That nuance shows the reviewer is not enforcing scope rigidly — it weighs whether the expansion is justified by the task's intent.

**What changed on the retry:** the rework prompt carried the reviewer's verbatim finding into the next worker turn. The retry worker restored the `autoRequestAiMoves` default to `true`, preserving the Wave 1 contract while keeping the new status-display logic. The round-2 review returned `approved` (commit `ba32fb02`, 0 findings). Merged at 17:26:18 UTC.

**Lesson:** when one wave is told to "defer X to a later wave" but the previous wave already wired X, the worker faces a contradictory instruction. The reviewer correctly enforces the wave-1 contract (continuity of shipped behavior) over the wave-2 prompt's literal text. Future graphs should be explicit when modifying behavior that prior waves established — either "leave the existing auto-play default alone" or "explicitly gate auto-play behind a new control."

### 3.2 `human-interaction-docs-017` (C-18, PR #18) — docs claimed Stockfish was deferred, but the code already runs it

**Symphony classification:** `category: review, stage: automated_review, reason: changes_requested`

**What happened on the first attempt:** the Codex worker wrote `docs/human-interaction.md` following the Wave 2 graph's acceptance criterion: *"The docs state that Stockfish gameplay response is deferred to Wave 3."* The worker dutifully wrote that statement into the docs.

The **Codex reviewer** then cross-referenced the new docs against the actual shipped code and the existing architecture docs, and found a factual contradiction:

> `docs/human-interaction.md:23-24 and 126` say that Stockfish response behavior is deferred to Wave 3, but the current app already auto-requests and applies AI moves when it becomes the engine's turn (`src/app/App.tsx:113-127`), and the existing architecture doc already describes local human-vs-AI Stockfish play (`docs/architecture.md:5-7` and `52-63`). That makes the new documentation factually inaccurate about current behavior.

This is a high-quality cross-document/cross-code review — the reviewer didn't just rubber-stamp the docs against the acceptance criteria; it checked the docs against ground truth in the actual codebase.

**Reviewer non-blocking note (a real Symphony harness observation):**

> The actual branch diff against `origin/main` is docs-only (`docs/human-interaction.md`); the broader changed-file list in the review packet appears stale and did not match the checked-out PR state.

This is a metadata observation about the review packet itself — Symphony fed the reviewer a stale changed-file list. The reviewer compensated by reading the actual branch diff. Worth filing as a Symphony harness follow-up: review packet's changed-file list can lag the real PR state.

**What changed on the retry:** the retry worker received the verbatim finding and rewrote the docs to describe the actual current behavior — the app DOES already auto-request AI moves (per the Wave 1 C-9 wiring, preserved through C-17), and what Wave 3 will add is the polish layer (real WASM boot in production, difficulty levels, thinking state, cancellation). The round-2 review returned `approved` (commit `fcb56414`, 0 findings). Merged at 17:36:40 UTC.

**Lesson:** the reviewer enforces factual consistency between docs and code, not just acceptance-criteria checkbox compliance. A wave's docs should describe *what is actually true after this wave ships*, not *what the prompt told the worker to assert*. Future graph authors should phrase doc acceptance criteria as "document what the current implementation does after this task" rather than "state that X is deferred to a later wave."

---

## 4. Patterns and observations

### 4.1 Both Wave 2 reworks have a single root cause

Both reworks (C-17 and C-18) trace back to the same Wave-1-vs-Wave-2 contract conflict around AI auto-play. The Wave 2 instructions said "defer Stockfish to Wave 3" but Wave 1's C-9 had already wired the auto-call. The worker tried to honor the Wave 2 wording; the reviewer enforced the Wave 1 reality. After C-17's resolution restored Wave 1 behavior, C-18's docs task had to be rewritten to match reality rather than the Wave 2 prompt.

This is a useful diagnostic: **cross-wave contract conflicts surface as predictable rework pairs** — the first task tries to break the prior wave's contract, the second task tries to document the (already broken or restored) contract.

### 4.2 Reviewer behavior matures across waves

Wave 1's rework findings tended to be in-file mechanical issues (scope_violation: committed node_modules, wrong API method on Stockfish factory). Wave 2's findings were cross-file integration concerns (App vs main.tsx wiring; docs vs implementation reality). The reviewer is consistently using cross-file context. This suggests we can trust the reviewer to enforce architectural invariants, not just per-file diff correctness.

### 4.3 `--auto-rework-continue` resolved both reworks in one retry each

Same as Wave 1: same Linear issue identifier preserved, same git branch reused, same PR number reused, retry prompt seeded with verbatim previous-failure context. No manual intervention. Both reworks resolved on the first retry. Wave 1 also achieved one-shot rework resolution on all 5 of its reworks. Across both waves, **the auto-rework loop has now resolved 7 of 7 reworks (100 %) on the first retry attempt** without operator help.

### 4.4 No carry-over from Wave 1's local graph state

The branch `codex/wave-2-human-interaction` was created cleanly from `main` after Wave 1's PR #10 merged. Only expected untracked files (`config/symphony_setup.state.json`, `tmp/`). The Wave 1 graph file at `planning/graphs/2026-06-05-3d-chess-local-foundation.json` was already merged to `main` and stayed as historical evidence; Wave 2's graph at `planning/graphs/2026-06-06-3d-chess-human-interaction.json` was authored fresh per the doc rule against rewriting historical graphs.

### 4.5 What the loop did NOT catch

Same as Wave 1: the reviewer reads code, it does not run the app in a real browser. Wave 2 added click-to-move and promotion-rules behavior that the reviewer validated via unit tests and code inspection. Whether the actual 3D scene clicks correctly in a real browser remains untested by the loop. A real-browser smoke check should be a Wave 3 cross-cutting task.

Additionally: the cross-wave contract conflict between Wave 1 and Wave 2 was caught *during review* (good — defect did not ship), but it could have been caught at the *graph design phase* if there were a contract-diff between successive graphs. Possible Symphony harness improvement: a `mix symphony.plan_contract_diff` command that compares a new graph's "do not" list against the prior wave's shipped behavior.

### 4.6 The end-of-wave operate idle behavior

Unlike Wave 1 (which crashed at the end with `plan_cycle: review failed: :timeout` on a redundant tick), Wave 2's operate idled cleanly after Done(8). Each subsequent 30s tick observed `Ready(0) / In Progress(0) / Blocked(0) / Rework(0) / Done(8)` and emitted `plan_cycle: materialized 0 task(s)` without crashing. The user stopped operate with SIGINT after the wave was fully verified Done.

This is a noticeably cleaner end-of-wave behavior than Wave 1. Whether the difference is due to (a) a Symphony harness improvement landed between waves, (b) a different state shape at the end of Wave 2, or (c) just luck on the timing of the no-op review tick, is not determined here. Worth noting if Wave 3 also exits cleanly.

---

## 5. What this Wave produced

### Files added (3 new)

```
docs/human-interaction.md
src/ui/PromotionDialog.tsx
src/ui/PromotionDialog.test.tsx
```

### Files modified (10 evolved by Wave 2 tasks)

```
src/chess/chessTypes.ts          (+ChessPromotionPiece, piece placement model)
src/chess/chessRules.ts          (+fenToPlacements, +UCI promotion application, +richer status)
src/chess/chessRules.test.ts     (+tests for above)
src/scene/BoardScene.tsx         (+piece rendering, +square selection callback, +legal-destination markers)
src/scene/BoardScene.test.tsx    (+tests for above)
src/game/gameStore.ts            (+selectedSquare logic, +legal destinations, +human move flow,
                                  +pending promotion state, +promotion completion/cancel actions)
src/game/gameStore.test.ts       (+tests for above)
src/app/App.tsx                  (+square-selection wiring, +legal-destination passthrough,
                                  +promotion UI composition, +restored autoRequestAiMoves default)
src/app/App.test.tsx             (+tests for above)
src/ui/GamePanel.test.tsx        (+turn/status display tests)
```

13 files touched in total. No unexpected files were created.

### Boundaries preserved

- UI components do not import `chess.js` directly (still wrapped by `chessRules.ts`).
- UI components do not import `stockfish` directly.
- The board scene does not parse FEN directly; FEN interpretation lives in the chess domain layer (`fenToPlacements`).
- Promotion behavior flows through the chess rules / store boundary, not hardcoded in UI.
- The promotion UI is a small reusable component (`PromotionDialog`) consumed by `App.tsx` and driven by store state.

### Validation that passed on every accepted PR

- `npm install` (as setup_commands), `npm run lint`, `npm run build`, `npm run test -- --run`, `mix check`
- GitHub Actions `bootstrap-proof` workflow

### What Wave 2 deliberately did NOT do

- Did not boot real Stockfish in the browser (Wave 3)
- Did not add difficulty levels, thinking state, or cancellation (Wave 3)
- Did not add GLTF piece models, professional materials, or animations (Wave 4)
- Did not add a New Game / side selection / captured-pieces panel (Wave 5)

---

## 6. Deviations from the original graph

**Zero.** The graph applied exactly as written.

All Wave 1 lessons were already pre-applied by the graph author (`setup_commands: ["npm install"]` on every code task, `mix check` in every code task's commands, tight `scope.include` per task, docs task using `test -f` validation). The control branch `codex/wave-2-human-interaction` was created before launching operate, as required by Symphony's graph-mutating-command guard.

---

## 7. Final state

```
Ready (0) | In Progress (0) | Blocked (0) | Rework (0) | Done (8)
```

| Linear | Task | PR | Merged (UTC) | Reworks |
|---|---|---|---|---|
| C-11 | `render-pieces-from-fen-010` | #11 | 2026-06-05 16:26 | 0 |
| C-12 | `square-selection-011` | #12 | 2026-06-05 16:34 | 0 |
| C-13 | `legal-move-highlighting-012` | #13 | 2026-06-05 16:42 | 0 |
| C-14 | `legal-move-application-013` | #14 | 2026-06-05 16:51 | 0 |
| C-15 | `promotion-rules-support-014` | #15 | 2026-06-05 17:02 | 0 |
| C-16 | `promotion-ui-flow-015` | #16 | 2026-06-05 17:10 | 0 |
| C-17 | `turn-status-display-016` | #17 | 2026-06-05 17:26 | 1 |
| C-18 | `human-interaction-docs-017` | #18 | 2026-06-05 17:37 | 1 |

Total Wave 2 wall-clock time: ~75 minutes for 8 PRs through worker + review + merge with 2 rework cycles. Average ~9 min per merged PR including reworks. Zero manual interventions.

---

## 8. Recommended Wave 3 — Stockfish Gameplay

Before designing Wave 3, an explicit decision is needed on the cross-wave contract conflict that produced both Wave 2 reworks: **does AI auto-play stay on by default, or is it gated behind a new explicit user action?**

**Recommendation:** option (a) — AI auto-play stays on by default, and Wave 3 only adds the polish layer (difficulty, thinking state, cancellation, real WASM boot in production). This matches the MVP goal ("Human can play a complete chess game against Stockfish") and avoids re-litigating C-17.

If option (a) is accepted, suggested Wave 3 graph at `planning/graphs/2026-06-07-3d-chess-stockfish-gameplay.json` (6–7 tasks):

1. `stockfish-real-boot-018` — wire real Stockfish via the package factory in production (`main.tsx` provides a real transport; closes the gap C-7 and C-9 reviewers worried about in Wave 1)
2. `engine-difficulty-019` — map the existing `AiDifficulty` type to real `go depth N` or time-budget commands in the adapter
3. `engine-thinking-state-020` — UI shows "Engine thinking…" tied to `isEngineThinking`; spinner or status text in `GamePanel`
4. `engine-cancel-021` — user can cancel a pending best-move request; the adapter's `cancel()` (already typed in Wave 1) gets exercised
5. `engine-error-handling-022` — surface engine boot/run failures cleanly without an unbounded retry loop (the failure mode the Wave 1 C-9 reviewer originally caught)
6. `stockfish-license-docs-023` — Stockfish GPLv3 obligations doc (already referenced in Wave 1's `docs/architecture.md`)
7. **Optional cross-cutting:** `real-browser-smoke-024` — a Playwright (or `@web-test-runner/playwright`) test that loads real Stockfish in a real browser and asserts one human-AI exchange. This addresses the gap flagged in the Wave 1 report — would have caught C-7's API-shape issue at runtime rather than at code review.

Same validation pattern as Waves 1 and 2: `setup_commands: ["npm install"]`, `commands: ["npm run lint", "npm run build", "npm run test -- --run", "mix check"]`. If task 024 is included, a new Symphony allowlist entry for the browser test command is needed first (one-line addition to `lib/symphony_1/planning/validator.ex`'s parser allowlist).

To avoid Wave 2's pair of contract-conflict reworks: Wave 3's graph should explicitly state the AI-auto-play contract it inherits (one acceptance criterion like *"`autoRequestAiMoves` default remains `true` and `main.tsx` continues to render `<App />` without override"*), so workers know it's a hard constraint rather than a defer-to-later instruction.
