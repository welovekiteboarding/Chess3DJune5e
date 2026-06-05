# Wave 1 — Local Foundation Report

**Date:** 2026-06-05
**Repo:** `Chess3DJune5e` (`https://github.com/welovekiteboarding/Chess3DJune5e`)
**Graph:** [`planning/graphs/2026-06-05-3d-chess-local-foundation.json`](../../planning/graphs/2026-06-05-3d-chess-local-foundation.json)
**Linear team:** `C`
**Loop command:** `mix symphony.operate --graph planning/graphs/2026-06-05-3d-chess-local-foundation.json --team-key C --auto-rework-continue --interval-seconds 30`
**Outcome:** All 9 graph tasks Done. 9 PRs merged into `main`. Zero manual interventions.

This report is meta/retrospective documentation. It records what the Symphony harness actually did during Wave 1, with verbatim reviewer findings from the recorder where rework happened, so future operators can see how the automated review/rework loop behaved on a real product graph.

---

## 1. Summary

| Metric | Value |
|---|---|
| Total graph tasks | 9 |
| Tasks Done | 9 |
| Tasks needing rework | 5 |
| Tasks clean on first attempt | 4 |
| Manual interventions | 0 |
| Total PRs merged | 9 |
| First PR merged | 08:11 UTC |
| Last PR merged | 10:29 UTC |
| Wall time end-to-end (operate launch → all 9 Done) | ~3h |

The `--auto-rework-continue` flag did all the recovery itself. Every rework was triggered either by Symphony's own finalization scope-validator or by the Codex-based reviewer reading the diff against the task's acceptance criteria. Each retry attempt continued on the same Linear issue, same branch, same workspace, and same PR.

---

## 2. Task-by-task

### 2.1 Clean tasks (no rework, merged on first attempt)

| Task ID | Linear | PR | Title |
|---|---|---|---|
| `stockfish-protocol-parser-003` | C-6 | #3 | Parse Stockfish UCI output |
| `local-board-scene-shell-006` | C-3 | #8 | Add 3D board scene shell |
| `local-game-panel-007` | C-5 | #5 | Add local game control panel |
| `local-foundation-docs-009` | C-10 | #10 | Document local MVP architecture |

Observation: the four clean tasks all have either pure-function logic (the UCI protocol parser), a tightly bounded React component (board scene, game panel), or pure docs. None of them have cross-module integration. This pattern matches the intuition that integration tasks are where reviewers find real defects.

### 2.2 Tasks that went through rework

Five tasks (out of nine) triggered at least one rework cycle. All five eventually merged after the first retry without further intervention.

---

## 3. Rework stories

Each story below uses the exact reviewer text (or finalization validator output) recorded by Symphony's per-issue recorder, the failure category Symphony classified it as, and what changed on the retry attempt.

---

### 3.1 `local-chess-scaffold-001` (C-2, PR #2) — committed `dist/` and `node_modules/`

**Symphony classification:** `category: validation, stage: review_preparation, reason: scope_violation`

**What happened on the first attempt:** the Codex worker scaffolded the Vite/React/TypeScript foundation correctly. But during finalization it ran `npm install` and `npm run build` inside the worktree, which produced `node_modules/` and `dist/` directories on disk. The worker then staged everything in the worktree with `git add` — including `node_modules/` and `dist/`.

Symphony's **finalization-stage scope validator** caught it. The graph task's `scope.exclude` list contained `node_modules/` and `dist/`, but the worker's commit was about to touch hundreds of files under those paths (the recorder captured the literal excluded-paths list, which spans entire npm sub-package contents like `node_modules/@adobe/css-tools/dist/cjs/adobe-css-tools.cjs`, `node_modules/@asamuzakjp/css-color/dist/esm/index.js`, and so on for ~50KB of paths).

The full Symphony classification, as written into `last_failure.reason`:

> `scope_violation: %{status: :fail, excluded: ["dist/assets/index-CI8oxv2w.js", "dist/assets/index-QX79opN1.css", "dist/index.html", "node_modules/.bin/acorn", "node_modules/.bin/baseline-browser-mapping", ... ]}`

The validator failed *before* the PR was opened, transitioned the issue to `Rework`, and persisted the failure category as `validation`, stage `review_preparation`.

**What changed on the retry:** the rework prompt re-injected the previous failure context (excluded paths + scope rules) into the next worker turn. The worker on the retry attempt added a `.gitignore` containing `node_modules/` and `dist/` (which the scaffold should have included from the start), staged only the intended source/config files, and the scope validator passed cleanly. PR #2 opened, reviewer approved, merged at 08:11 UTC.

**Lesson:** the finalization scope validator is a cheap and effective rail. It prevents accidental megabyte-scale commits before they reach the reviewer. Wave-1's first task was unintentionally a real-world test of this validator and it held.

---

### 3.2 `local-chess-rules-002` (C-4, PR #6) — worker wrote files outside the task's scope

**Symphony classification:** `category: review, stage: automated_review, reason: changes_requested`

**What happened on the first attempt:** the Codex worker correctly implemented the chess rules wrapper at `src/chess/chessTypes.ts`, `src/chess/chessRules.ts`, and `src/chess/chessRules.test.ts`. But it also created files that belonged to *other* graph tasks — `src/app/App.tsx`, `src/ui/GamePanel.tsx`, `src/engine/stockfishEngine.ts`, and their tests — in the same commit. The scope validator did not catch this because those paths weren't in the task's `scope.exclude` list — they simply weren't in `scope.include` either. The PR opened and went to Human Review.

The **Codex reviewer** then read the PR diff against the task's acceptance criteria and the explicit scope and flagged it:

> The change is materially out of scope for C-4. This issue was scoped to the chess rules boundary in `src/chess/chessTypes.ts`, `src/chess/chessRules.ts`, and `src/chess/chessRules.test.ts`, but the commit also adds unrelated app shell, UI, and Stockfish work such as `src/app/App.tsx`, `src/ui/GamePanel.tsx`, `src/engine/stockfishEngine.ts`, and their tests. That scope expansion is not clearly necessary to implement the chess.js wrapper and should be removed from this issue or split into separate issues/PRs.

The review artifact (`tmp/reviews/C-4.json`) was written with `outcome: changes_requested`. The merge phase saw `changes_requested` and refused to merge. `--auto-rework-continue` moved C-4 back to `Todo` *on the same branch* and re-queued the work.

**What changed on the retry:** the rework prompt told the worker: "you previously created files outside your task scope; here's the reviewer's exact text." The retry worker removed everything outside `src/chess/`, re-committed only the chess rules wrapper, and the next review cycle returned `approved`. Merged at 09:11 UTC.

**Lesson:** the Codex reviewer is the second line of defense after the structural scope validator — it catches *intent-level* scope creep that the path-based validator can't see. Scope.include is a positive list and not enforced as a hard upper bound by finalization; the reviewer is what enforces it.

---

### 3.3 `stockfish-engine-adapter-004` (C-7, PR #4) — wrong Stockfish package API

**Symphony classification:** `category: review, stage: automated_review, reason: changes_requested`

**What happened on the first attempt:** the worker implemented the Stockfish engine adapter and the fake-UCI-transport test pattern correctly. All unit tests passed. The adapter compiled and built. The reviewer read the diff and found a real runtime bug that none of the unit tests could catch:

> `src/engine/stockfishEngine.ts:401-423` does not actually support the real `stockfish` package factory API. `createStockfishTransportFromPackage()` only subscribes via `addEventListener`/`onmessage`, but the installed `stockfish` package resolves to an engine that accepts input through `sendCommand` and emits output through `engine.listener`. In that configuration the adapter never sees `uciok`, `readyok`, or `bestmove`, so `requestBestMove()` hangs with a real package-backed engine even though the fake transport tests pass.

That's a concrete, file-and-line-cited finding about real-world engine integration — the kind of bug that would have shipped, passed every unit test, then failed silently in the browser when a real human opened the app and made the first move.

**What changed on the retry:** the rework prompt carried the reviewer's exact text into the next worker turn. The retry worker rewrote `createStockfishTransportFromPackage()` to use the `sendCommand` / `engine.listener` shape that the real package exposes, kept the fake-transport tests intact, and re-submitted. The next review returned `approved`. Merged at 08:47 UTC.

**Lesson:** for any task whose acceptance includes integrating with an external library whose API is fluid or under-documented, the unit-test boundary alone is not enough — the reviewer reading the actual implementation against the package's real shape catches what tests can't. The graph anticipated this by allowing the fake-transport pattern; the reviewer caught what the fake pattern intentionally couldn't.

---

### 3.4 `local-game-store-005` (C-8, PR #7) — GitHub API transient failure

**Symphony classification:** `category: review_infrastructure, stage: automated_review, reason: command_failed gh HTTP 504`

**What happened on the first attempt:** the worker implemented the Zustand game store correctly. The PR opened. The reviewer attempted to read the PR diff via `gh` and hit a GitHub GraphQL infrastructure outage:

> `{:command_failed, "gh", 1, "HTTP 504: We couldn't respond to your request in time. Sorry about that. Please try resubmitting your request and contact us if the problem persists. (https://api.github.com/graphql)"}`

This is **not a code defect** — it's an infrastructure failure outside Symphony's control. The harness correctly classified the category as `review_infrastructure` (distinct from `review`, which is for actual reviewer findings). `--auto-rework-continue` moved C-8 back to `Todo` and the next operate tick re-attempted the review.

**What changed on the retry:** nothing about the code changed. The retry worker re-pushed the same content. The reviewer retried against the same PR diff, GitHub answered, the review returned `approved`. Merged at 09:54 UTC.

**Lesson:** the harness's `review_infrastructure` category vs `review` category distinction is load-bearing. A transient `gh` 504 doesn't mean the code is bad; it means try again. The auto-rework loop transparently rode through it without manual intervention.

---

### 3.5 `local-app-composition-008` (C-9, PR #9) — incomplete engine wiring + unbounded retry loop

**Symphony classification:** `category: review, stage: automated_review, reason: changes_requested` (two findings)

**What happened on the first attempt:** the worker composed the app shell — wired `gameStore` into `App.tsx`, passed state to `BoardScene`, passed state to `GamePanel`. All unit tests passed. The reviewer read the integrated diff and found **two** real defects:

**Finding 1 — engine never actually boots:**

> `src/app/App.tsx:39-49` builds the default app store with `createStockfishEngine()` but never supplies a transport, worker, or package factory. `src/engine/stockfishEngine.ts:550-576` throws when none is configured, so the shipped localhost app cannot complete an AI turn: after the first human move it falls into an error state instead of producing a reply. That breaks the task goal of proving the integrated shell works end to end in localhost.

**Finding 2 — engine failure becomes an unbounded retry loop:**

> `src/app/App.tsx:94-111` auto-calls `requestAiMove()` whenever it is the AI side's turn and `isEngineThinking` is false. On failure, `src/game/gameStore.ts:243-264` sets `isEngineThinking` back to false without changing the turn or status, so the effect conditions become true again immediately and the app retries again. Any engine failure therefore turns into an unbounded retry/error loop instead of a single surfaced failure.

This is a high-quality multi-file review. The reviewer didn't just read `App.tsx` in isolation — it traced the engine factory call back to `stockfishEngine.ts:550-576` to see what happens when no transport is configured, and traced the `isEngineThinking` cleanup back to `gameStore.ts:243-264` to see how a failure cycles. It then identified the **interaction** between the two as the actual user-facing bug.

**What changed on the retry:** the rework prompt carried both findings verbatim. The retry worker did two things:

1. Wired a default transport into the engine factory so the app can complete a real AI turn on localhost.
2. Added a guard in the `App.tsx` effect so the auto-call only fires once per turn and surfaces a single error instead of retrying unboundedly.

The next review returned `approved`. Merged at 10:24 UTC. The git log shows the intermediate fix commit `565dd3d Fix local app shell engine wiring` on the issue branch, exactly between the two attempts.

**Lesson:** the reviewer's ability to cross-reference multiple files in a single PR is what makes the harness's review boundary substantively better than just "did the tests pass." Tests can prove a unit works in isolation; the reviewer is what proves the units work *together*.

---

## 4. Patterns and observations

### 4.1 Where rework happened and why

| Rework cause | Tasks | Mechanism that caught it |
|---|---|---|
| Committed build artifacts / node_modules | 1 (C-2) | Symphony's finalization scope-validator (`category: validation`) |
| Scope creep — worker wrote files outside task scope | 1 (C-4) | Codex reviewer reading diff against `scope.include` (`category: review`) |
| Wrong external-library API used | 1 (C-7) | Codex reviewer reading real package shape (`category: review`) |
| Transient GitHub infrastructure outage | 1 (C-8) | Symphony's distinct `review_infrastructure` category — retried, no code change |
| Integration defects across multiple modules | 1 (C-9) | Codex reviewer cross-referencing multiple files (`category: review`) |

The split between **validation rail** (1 case, structural) and **reviewer** (3 cases of real defects + 1 transient) suggests the reviewer is doing most of the substantive quality work. The validator stops the dumb cases (committing node_modules); the reviewer stops the smart cases (wrong API, broken integrations).

### 4.2 `--auto-rework-continue` behavior

For every rework cycle:

- the same Linear issue identifier was preserved (C-2 stayed C-2 through both attempts; no `C-2-retry` or `C-2b`)
- the same git branch (`issue-c-2`, `issue-c-4`, etc.) was reused
- the same PR number was reused (the worker pushed a new commit; the PR's commit list grew)
- the same worktree was reused
- the previous failure reason (verbatim) was injected into the next worker's prompt

This matches the documented intent of `--auto-rework-continue` vs `--auto-rework` (which creates a fresh Linear issue per retry). For Wave 1, continuing on the same issue worked perfectly — the worker had to fix a specific finding, not start over.

### 4.3 Codex worker quality is non-deterministic, but the reviewer normalizes it

Five of nine tasks had defects on first attempt. Four did not. This matches the conversation history: even simple tasks (the bootstrap proof itself) sometimes succeeded clean and sometimes produced subtle defects (e.g., writing `Branch: C-1` instead of `Branch: issue-c-1` during the proof — caught and fixed in an earlier scaffold run via RA1-124's revalidation logic). The reviewer's role is to make this non-determinism invisible to the user: the loop self-heals.

### 4.4 What the loop did NOT catch

The reviewer can only see what's in the PR diff. It cannot:

- run the real app in a real browser
- exercise real Stockfish WASM
- click around the 3D board
- detect performance regressions

C-7 is the cautionary example: the reviewer caught the real-API-mismatch bug by *reading* the integration, not by *running* it. If the worker had used the right API shape but the underlying WASM had a different problem at runtime, no part of Wave 1's validation would have detected it. Wave 3 (or a Wave 2 follow-up) should add a real-browser smoke check.

### 4.5 The end-of-wave operate exit

Operate exited at the end of Wave 1 with `** (Mix) plan_cycle: review failed: :timeout`. By that point all 9 tasks were already merged. The crash was on what should have been an idle final tick. This is cosmetic — the work was already done — but suggests a Symphony improvement: when the graph is all-Done, operate should detect that and exit clean rather than crash on a redundant review tick. Tracking as a possible RA1 follow-up rather than blocking forward progress.

---

## 5. What this Wave produced

Wave 1's stated purpose was *foundation*, not playable chess. The 22 files now on `main` of `Chess3DJune5e` are:

```
package.json
vite.config.ts
tsconfig.json
tsconfig.node.json
eslint.config.js
index.html
src/app/App.tsx
src/app/App.test.tsx
src/chess/chessTypes.ts
src/chess/chessRules.ts
src/chess/chessRules.test.ts
src/engine/engineTypes.ts
src/engine/stockfishProtocol.ts
src/engine/stockfishProtocol.test.ts
src/engine/stockfishEngine.ts
src/engine/stockfishEngine.test.ts
src/game/gameStore.ts
src/game/gameStore.test.ts
src/scene/BoardScene.tsx
src/scene/BoardScene.test.tsx
src/ui/GamePanel.tsx
src/ui/GamePanel.test.tsx
src/styles/globals.css
docs/architecture.md
```

Boundaries preserved:
- UI components do not import `chess.js` directly (they go through `chessRules.ts`).
- UI components do not import `stockfish` directly (they go through the engine adapter).
- The board scene stays presentation-focused.
- The game store coordinates rules and engine without rendering.

Validation that passed on every accepted PR:
- `npm install` (setup)
- `npm run lint`
- `npm run build`
- `npm run test -- --run`
- `mix check`
- `bootstrap-proof` GitHub Actions check from the scaffold template

---

## 6. Deviations from the original graph

Three changes were applied to the graph file before materialization (each approved in-line during the conversation):

1. **Added `setup_commands: ["npm install"]`** to tasks 002–008. Required because workers get fresh isolated worktrees without `node_modules`. Without this, the `npm run *` validation commands would fail with `command not found`.

2. **Added `"mix check"`** to commands on tasks 001–008. Required by `lib/symphony_1/planning/validator.ex:65-80` which hardcodes that every `kind: "code"` task must include `mix check` in `validation.commands`. The scaffolded repo's `mix.exs` already defines `check` as `[format --check-formatted, credo --strict --only warning, test]`.

3. **Created `codex/wave-1-foundation` branch** before launching operate. `mix symphony.operate` refuses to run on `main` (`refusing to run graph-mutating Symphony command on main`) — graph-mutating commands require a `codex/*` control branch.

No other deviations. All 9 tasks executed as written.

---

## 7. Recommended Wave 2

Wave 2 = Human Chess Interaction. Suggested graph file: `planning/graphs/2026-06-06-3d-chess-human-interaction.json`. Likely 6 tasks:

1. `render-pieces-from-fen-010` — board scene renders all 32 pieces from current FEN
2. `square-selection-011` — clicking a square updates `gameStore.selectedSquare`
3. `legal-move-highlighting-012` — highlight legal destination squares in 3D when a piece is selected
4. `legal-move-application-013` — clicking a highlighted square applies the move via `gameStore.attemptHumanMove`
5. `turn-status-display-014` — `GamePanel` shows live turn / check / checkmate / draw
6. `promotion-handling-015` — pawn promotion UI + UCI promotion strings wired through the store

Same validation pattern as Wave 1. Add `setup_commands: ["npm install"]` and `"mix check"` from the start.

Recommended cross-cutting Wave 3 task: a real-browser smoke check (Playwright or @web-test-runner/playwright) that loads the real Stockfish package, makes a human move, and asserts a real engine reply. The Wave 1 reviewer caught the C-7 API mismatch by reading code; a future similar bug elsewhere might only surface in a real browser run.

---

## 8. Final state

```
Ready (0) | In Progress (0) | Blocked (0) | Rework (0) | Done (9)
```

Total Wave 1 cost (loop time, excluding the bootstrap proof): ~3 hours wall clock for 9 PRs through worker + review + merge with 5 rework cycles. Average ~20 minutes per merged PR including reworks. Zero manual interventions.
