import { createStore } from 'zustand/vanilla';

import {
  applyMove,
  applyUciMove,
  createInitialGameState,
  getFen,
  getGameStatus,
  getLegalMoves,
  getTurn,
} from '../chess/chessRules';
import type {
  ChessAppliedMove,
  ChessGameState,
  ChessGameStatus,
  ChessMove,
  ChessMoveResult,
  ChessPlayer,
  ChessPromotionPiece,
  ChessSquare,
  ChessUciMove,
} from '../chess/chessTypes';
import type { AiDifficulty, AsyncEngineAdapter } from '../engine/engineTypes';

export interface GameMoveRecord {
  player: 'human' | 'ai';
  uci: ChessUciMove;
}

export type GameMoveAttemptResult =
  | {
      ok: true;
      move: ChessAppliedMove;
    }
  | {
      ok: false;
      error: string;
    };

export interface GameStoreState {
  currentFen: string;
  selectedSquare: ChessSquare | null;
  legalDestinationSquares: ChessSquare[];
  moveHistory: GameMoveRecord[];
  gameStatus: ChessGameStatus;
  humanSide: ChessPlayer;
  aiSide: ChessPlayer;
  aiDifficulty: AiDifficulty;
  isEngineThinking: boolean;
  latestError: string | null;
  selectSquare: (square: ChessSquare) => void;
  clearSelection: () => void;
  attemptHumanMove: (
    to: ChessSquare,
    promotion?: ChessPromotionPiece,
  ) => GameMoveAttemptResult;
  startNewGame: () => void;
  setAiDifficulty: (difficulty: AiDifficulty) => Promise<void>;
  applyAiMove: (uciMove: ChessUciMove | string) => GameMoveAttemptResult;
}

export interface CreateGameStoreOptions {
  engine?: AsyncEngineAdapter;
  humanSide?: ChessPlayer;
  aiDifficulty?: AiDifficulty;
}

export type GameStore = ReturnType<typeof createGameStore>;
type SetGameStoreState = (
  partial:
    | Partial<GameStoreState>
    | ((state: GameStoreState) => Partial<GameStoreState>),
) => void;

export function createGameStore(options: CreateGameStoreOptions = {}) {
  const humanSide = options.humanSide ?? 'white';
  const aiSide = humanSide === 'white' ? 'black' : 'white';
  const initialDifficulty = options.aiDifficulty ?? 'medium';
  const engine = options.engine ?? createNoopEngine(initialDifficulty);
  let engineRequestVersion = 0;

  const invalidatePendingEngineRequest = () => {
    engineRequestVersion += 1;
  };

  const cancelPendingEngineRequest = () => {
    invalidatePendingEngineRequest();
    void engine.cancelSearch().catch(() => undefined);
  };

  return createStore<GameStoreState>()((set, get) => ({
    ...buildStateSnapshot({
      gameState: createInitialGameState(),
      humanSide,
      aiSide,
      aiDifficulty: initialDifficulty,
      moveHistory: [],
      isEngineThinking: false,
      latestError: null,
    }),

    selectSquare: (square) => {
      const gameState = getGameState(get);

      if (getTurn(gameState) !== get().humanSide) {
        set({
          selectedSquare: null,
          legalDestinationSquares: [],
        });
        return;
      }

      set({
        selectedSquare: square,
        legalDestinationSquares: getLegalMoves(gameState, square).map(
          (move) => move.to,
        ),
      });
    },

    clearSelection: () => {
      set({
        selectedSquare: null,
        legalDestinationSquares: [],
      });
    },

    attemptHumanMove: (to, promotion) => {
      const state = get();

      if (!state.selectedSquare) {
        return failMoveAttempt(set, 'No square selected.');
      }

      const gameState = getGameState(get);

      if (getTurn(gameState) !== state.humanSide) {
        return failMoveAttempt(set, 'It is not the human side to move.');
      }

      const result = applyValidatedMove({
        get,
        set,
        move: {
          from: state.selectedSquare,
          to,
          ...(promotion ? { promotion } : {}),
        },
        player: 'human',
      });

      if (result.ok) {
        requestAiMove({
          engine,
          get,
          set,
          invalidatePendingEngineRequest,
          getCurrentEngineRequestVersion: () => engineRequestVersion,
        });
      }

      return result;
    },

    startNewGame: () => {
      cancelPendingEngineRequest();
      set((state) => ({
        ...buildStateSnapshot({
          gameState: createInitialGameState(),
          humanSide: state.humanSide,
          aiSide: state.aiSide,
          aiDifficulty: state.aiDifficulty,
          moveHistory: [],
          isEngineThinking: false,
          latestError: null,
        }),
      }));
    },

    setAiDifficulty: async (difficulty) => {
      try {
        await engine.setDifficulty(difficulty);
        set({
          aiDifficulty: difficulty,
          latestError: null,
        });
      } catch (error) {
        set({
          latestError: toErrorMessage(error, 'Failed to set AI difficulty.'),
        });
      }
    },

    applyAiMove: (uciMove) => {
      const state = get();
      const gameState = getGameState(get);

      if (getTurn(gameState) !== state.aiSide) {
        return failMoveAttempt(set, 'It is not the AI side to move.');
      }

      const result = applyUciMove(gameState, uciMove);

      if (result.ok) {
        cancelPendingEngineRequest();
      }

      return applyMoveResult({
        get,
        set,
        result,
        player: 'ai',
      });
    },
  }));
}

function applyValidatedMove({
  get,
  set,
  move,
  player,
}: {
  get: () => GameStoreState;
  set: (
    partial:
      | Partial<GameStoreState>
      | ((state: GameStoreState) => Partial<GameStoreState>),
  ) => void;
  move: ChessMove;
  player: GameMoveRecord['player'];
}): GameMoveAttemptResult {
  return applyMoveResult({
    get,
    set,
    result: applyMove(getGameState(get), move),
    player,
  });
}

function applyMoveResult({
  get,
  set,
  result,
  player,
}: {
  get: () => GameStoreState;
  set: SetGameStoreState;
  result: ChessMoveResult;
  player: GameMoveRecord['player'];
}): GameMoveAttemptResult {
  if (!result.ok) {
    return failMoveAttempt(set, result.error.message, {
      isEngineThinking: false,
    });
  }

  const state = get();
  const nextGameStatus = getGameStatus(result.gameState);
  const shouldRequestAiMove =
    player === 'human' &&
    shouldRequestAiMoveAfterHumanMove({
      aiSide: state.aiSide,
      gameState: result.gameState,
      gameStatus: nextGameStatus,
    });

  set({
    ...buildStateSnapshot({
      gameState: result.gameState,
      humanSide: state.humanSide,
      aiSide: state.aiSide,
      aiDifficulty: state.aiDifficulty,
      moveHistory: [
        ...state.moveHistory,
        {
          player,
          uci: result.move.uci,
        },
      ],
      isEngineThinking: shouldRequestAiMove,
      latestError: null,
    }),
  });

  return {
    ok: true,
    move: result.move,
  };
}

function failMoveAttempt(
  set: SetGameStoreState,
  error: string,
  extraState: Partial<GameStoreState> = {},
): GameMoveAttemptResult {
  set({
    ...extraState,
    latestError: error,
  });

  return {
    ok: false,
    error,
  };
}

function buildStateSnapshot({
  gameState,
  humanSide,
  aiSide,
  aiDifficulty,
  moveHistory,
  isEngineThinking,
  latestError,
}: {
  gameState: ChessGameState;
  humanSide: ChessPlayer;
  aiSide: ChessPlayer;
  aiDifficulty: AiDifficulty;
  moveHistory: GameMoveRecord[];
  isEngineThinking: boolean;
  latestError: string | null;
}) {
  return {
    currentFen: getFen(gameState),
    selectedSquare: null,
    legalDestinationSquares: [],
    moveHistory,
    gameStatus: getGameStatus(gameState),
    humanSide,
    aiSide,
    aiDifficulty,
    isEngineThinking,
    latestError,
  } satisfies Pick<
    GameStoreState,
    | 'currentFen'
    | 'selectedSquare'
    | 'legalDestinationSquares'
    | 'moveHistory'
    | 'gameStatus'
    | 'humanSide'
    | 'aiSide'
    | 'aiDifficulty'
    | 'isEngineThinking'
    | 'latestError'
  >;
}

function getGameState(get: () => GameStoreState): ChessGameState {
  return {
    fen: get().currentFen,
  };
}

function requestAiMove({
  engine,
  get,
  set,
  invalidatePendingEngineRequest,
  getCurrentEngineRequestVersion,
}: {
  engine: AsyncEngineAdapter;
  get: () => GameStoreState;
  set: SetGameStoreState;
  invalidatePendingEngineRequest: () => void;
  getCurrentEngineRequestVersion: () => number;
}) {
  const state = get();

  if (!state.isEngineThinking) {
    return;
  }

  const requestFen = state.currentFen;
  invalidatePendingEngineRequest();
  const requestVersion = getCurrentEngineRequestVersion();

  void engine
    .requestBestMove({
      fen: requestFen,
    })
    .then((response) => {
      if (!isCurrentEngineRequest(get, requestFen, requestVersion, getCurrentEngineRequestVersion)) {
        return;
      }

      if (response.fen !== requestFen) {
        failMoveAttempt(
          set,
          'Engine returned a best move for an unexpected position.',
          {
            isEngineThinking: false,
          },
        );
        return;
      }

      applyMoveResult({
        get,
        set,
        result: applyUciMove(getGameState(get), response.move),
        player: 'ai',
      });
    })
    .catch((error) => {
      if (!isCurrentEngineRequest(get, requestFen, requestVersion, getCurrentEngineRequestVersion)) {
        return;
      }

      failMoveAttempt(
        set,
        toErrorMessage(error, 'Failed to request AI move.'),
        {
          isEngineThinking: false,
        },
      );
    });
}

function isCurrentEngineRequest(
  get: () => GameStoreState,
  requestFen: string,
  requestVersion: number,
  getCurrentEngineRequestVersion: () => number,
): boolean {
  return (
    getCurrentEngineRequestVersion() === requestVersion &&
    get().currentFen === requestFen
  );
}

function shouldRequestAiMoveAfterHumanMove({
  aiSide,
  gameState,
  gameStatus,
}: {
  aiSide: ChessPlayer;
  gameState: ChessGameState;
  gameStatus: ChessGameStatus;
}): boolean {
  return (
    getTurn(gameState) === aiSide &&
    (gameStatus.kind === 'ongoing' || gameStatus.kind === 'check')
  );
}

function createNoopEngine(difficulty: AiDifficulty): AsyncEngineAdapter {
  return {
    state: 'idle',
    async setDifficulty() {},
    async requestBestMove(request) {
      return {
        move: 'a2a3',
        difficulty,
        fen: request.fen,
      };
    },
    async cancelSearch() {},
    async dispose() {},
  };
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
