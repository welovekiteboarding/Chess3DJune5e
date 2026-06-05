# Local Game Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Zustand-backed local human-vs-AI chess store that delegates move validation to the chess domain wrapper and keeps engine integration behind the adapter interface.

**Architecture:** The store will own serializable game/session state and expose imperative actions for selection, human moves, AI moves, new game reset, and difficulty updates. Chess legality, turn handling, and FEN updates stay inside `src/chess/chessRules.ts`; engine calls stay abstracted behind `AsyncEngineAdapter`-compatible dependencies.

**Tech Stack:** TypeScript, Zustand, Vitest

---

### Task 1: Add the failing game-store tests

**Files:**
- Create: `src/game/gameStore.test.ts`
- Test: `src/game/gameStore.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests that cover:
- initial state
- selecting `e2` and exposing legal destinations including `e3` and `e4`
- applying human `e2e4`
- rejecting illegal human `e2e5`
- applying a valid fake AI move
- rejecting an invalid fake AI move
- resetting to a fresh game

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run src/game/gameStore.test.ts`
Expected: FAIL because `src/game/gameStore.ts` does not exist yet.

### Task 2: Implement the Zustand store

**Files:**
- Create: `src/game/gameStore.ts`
- Test: `src/game/gameStore.test.ts`

- [ ] **Step 1: Write minimal implementation**

Define the store state and actions:
- current FEN
- selected square
- legal destination squares
- move history
- game status
- human side / AI side
- AI difficulty
- engine thinking state
- latest error

Actions:
- `selectSquare`
- `clearSelection`
- `attemptHumanMove`
- `startNewGame`
- `setAiDifficulty`
- `applyAiMove`

Implementation constraints:
- import `src/chess/chessRules.ts`, not `chess.js`
- depend on engine adapter types, not concrete Stockfish boot logic
- validate AI moves through the same chess boundary as human moves

- [ ] **Step 2: Run test to verify it passes**

Run: `npm run test -- --run src/game/gameStore.test.ts`
Expected: PASS

### Task 3: Focused verification

**Files:**
- Verify: `src/game/gameStore.ts`
- Verify: `src/game/gameStore.test.ts`

- [ ] **Step 1: Run focused verification**

Run: `npm run test -- --run src/game/gameStore.test.ts`
Expected: PASS

- [ ] **Step 2: Run broader verification if time remains**

Run: `npm run test -- --run`
Expected: PASS or capture exact failure for handoff
