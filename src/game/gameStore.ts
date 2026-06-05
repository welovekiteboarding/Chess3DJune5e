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

export function createGameStore(options: CreateGameStoreOptions = {}) {
  const humanSide = options.humanSide ?? 'white';
  const aiSide = humanSide === 'white' ? 'black' : 'white';
  const initialDifficulty = options.aiDifficulty ?? 'medium';
  const engine = options.engine ?? createNoopEngine(initialDifficulty);

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

      return applyValidatedMove({
        get,
        set,
        move: {
          from: state.selectedSquare,
          to,
          ...(promotion ? { promotion } : {}),
        },
        player: 'human',
      });
    },

    startNewGame: () => {
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

      if (!result.ok) {
        return failMoveAttempt(set, result.error.message);
      }

      set({
        ...buildStateSnapshot({
          gameState: result.gameState,
          humanSide: state.humanSide,
          aiSide: state.aiSide,
          aiDifficulty: state.aiDifficulty,
          moveHistory: [
            ...state.moveHistory,
            {
              player: 'ai',
              uci: result.move.uci,
            },
          ],
          isEngineThinking: false,
          latestError: null,
        }),
      });

      return {
        ok: true,
        move: result.move,
      };
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
  const state = get();
  const result = applyMove(getGameState(get), move);

  if (!result.ok) {
    return failMoveAttempt(set, result.error.message);
  }

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
      isEngineThinking: false,
      latestError: null,
    }),
  });

  return {
    ok: true,
    move: result.move,
  };
}

function failMoveAttempt(
  set: (
    partial:
      | Partial<GameStoreState>
      | ((state: GameStoreState) => Partial<GameStoreState>),
  ) => void,
  error: string,
): GameMoveAttemptResult {
  set({
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
