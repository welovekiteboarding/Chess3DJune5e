import { createStore } from 'zustand/vanilla';

import {
  applyMove,
  applyUciMove,
  createInitialGameState,
  getFen,
  getGameDisplayState,
  getLegalMoves,
  getTurn,
  loadGameStateFromFen,
} from '../chess/chessRules';
import {
  CHESS_PROMOTION_PIECES,
  type ChessAppliedMove,
  type ChessGameState,
  type ChessGameStatus,
  type ChessMove,
  type ChessMoveResult,
  type ChessPlayer,
  type ChessPromotionPiece,
  type ChessSquare,
  type ChessUciMove,
} from '../chess/chessTypes';
import type { AiDifficulty, AsyncEngineAdapter } from '../engine/engineTypes';

export interface GameMoveRecord {
  player: 'human' | 'ai';
  uci: ChessUciMove;
}

export interface PendingPromotionState {
  from: ChessSquare;
  to: ChessSquare;
  choices: ChessPromotionPiece[];
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
  pendingPromotion: PendingPromotionState | null;
  moveHistory: GameMoveRecord[];
  gameStatus: ChessGameStatus;
  gameStatusLabel: string;
  humanSide: ChessPlayer;
  aiSide: ChessPlayer;
  sideToMove: ChessPlayer;
  sideToMoveLabel: string;
  aiDifficulty: AiDifficulty;
  isEngineThinking: boolean;
  latestError: string | null;
  selectSquare: (square: ChessSquare) => void;
  clearSelection: () => void;
  attemptHumanMove: (
    to: ChessSquare,
    promotion?: ChessPromotionPiece,
  ) => GameMoveAttemptResult;
  completePendingPromotion: (
    promotion: ChessPromotionPiece,
  ) => GameMoveAttemptResult;
  cancelPendingPromotion: () => void;
  startNewGame: () => void;
  setAiDifficulty: (difficulty: AiDifficulty) => Promise<void>;
  requestAiMove: () => Promise<GameMoveAttemptResult>;
  applyAiMove: (uciMove: ChessUciMove | string) => GameMoveAttemptResult;
}

export interface CreateGameStoreOptions {
  engine: AsyncEngineAdapter;
  humanSide?: ChessPlayer;
  aiDifficulty?: AiDifficulty;
  initialFen?: string;
}

export type GameStore = ReturnType<typeof createGameStore>;
type SetGameStoreState = (
  partial:
    | Partial<GameStoreState>
    | ((state: GameStoreState) => Partial<GameStoreState>),
) => void;

export function createGameStore(options: CreateGameStoreOptions) {
  const { engine } = options;
  const humanSide = options.humanSide ?? 'white';
  const aiSide = humanSide === 'white' ? 'black' : 'white';
  const initialDifficulty = options.aiDifficulty ?? 'medium';
  const initialGameState = resolveInitialGameState(options.initialFen);
  let engineRequestVersion = 0;

  const invalidatePendingEngineRequest = () => {
    engineRequestVersion += 1;
    return engineRequestVersion;
  };

  const cancelPendingEngineRequest = () => {
    invalidatePendingEngineRequest();
    void engine.cancelSearch().catch(() => undefined);
  };

  return createStore<GameStoreState>()((set, get) => ({
    ...buildStateSnapshot({
      gameState: initialGameState,
      humanSide,
      aiSide,
      aiDifficulty: initialDifficulty,
      moveHistory: [],
      isEngineThinking: false,
      latestError: null,
    }),

    selectSquare: (square) => {
      const state = get();

      if (state.pendingPromotion) {
        return;
      }

      const gameState = getGameState(state);

      if (getTurn(gameState) !== state.humanSide) {
        return;
      }

      const legalMoves = getLegalMoves(gameState, square);

      if (legalMoves.length === 0) {
        return;
      }

      set({
        selectedSquare: square,
        legalDestinationSquares: legalMoves.map((move) => move.to),
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

      if (state.pendingPromotion) {
        return failMoveAttempt(set, 'A promotion choice is already pending.');
      }

      if (!state.selectedSquare) {
        return failMoveAttempt(set, 'No square selected.');
      }

      const gameState = getGameState(state);

      if (getTurn(gameState) !== state.humanSide) {
        return failMoveAttempt(set, 'It is not the human side to move.');
      }

      if (
        !promotion &&
        moveRequiresPromotion(gameState, {
          from: state.selectedSquare,
          to,
        })
      ) {
        set({
          selectedSquare: null,
          legalDestinationSquares: [],
          pendingPromotion: {
            from: state.selectedSquare,
            to,
            choices: [...CHESS_PROMOTION_PIECES],
          },
          latestError: null,
        });

        return {
          ok: false,
          error: 'Human promotion piece selection is required.',
        };
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

    completePendingPromotion: (promotion) => {
      const state = get();
      const pendingPromotion = state.pendingPromotion;

      if (!pendingPromotion) {
        return failMoveAttempt(set, 'No promotion choice is pending.');
      }

      return applyValidatedMove({
        get,
        set,
        move: {
          from: pendingPromotion.from,
          to: pendingPromotion.to,
          promotion,
        },
        player: 'human',
      });
    },

    cancelPendingPromotion: () => {
      set({
        pendingPromotion: null,
        latestError: null,
      });
    },

    startNewGame: () => {
      cancelPendingEngineRequest();
      const nextGameState = initialGameState;

      set((state) => ({
        ...buildStateSnapshot({
          gameState: nextGameState,
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

    requestAiMove: async () => {
      const state = get();
      const gameState = getGameState(state);

      if (getTurn(gameState) !== state.aiSide) {
        return failMoveAttempt(set, 'It is not the AI side to move.');
      }

      if (!canRequestMove(state.gameStatus)) {
        return failMoveAttempt(set, 'The game is over.');
      }

      const requestFen = state.currentFen;
      const requestVersion = invalidatePendingEngineRequest();

      set({
        isEngineThinking: true,
        latestError: null,
      });

      try {
        const response = await engine.requestBestMove({
          fen: requestFen,
        });

        if (
          !isCurrentEngineRequest(
            get,
            requestFen,
            requestVersion,
            () => engineRequestVersion,
          )
        ) {
          return {
            ok: false,
            error: 'AI move request was superseded.',
          };
        }

        if (response.fen !== requestFen) {
          return failMoveAttempt(
            set,
            'Engine returned a best move for an unexpected position.',
            {
              isEngineThinking: false,
            },
          );
        }

        return applyMoveResult({
          get,
          set,
          result: applyUciMove(getGameState(get()), response.move),
          player: 'ai',
        });
      } catch (error) {
        if (
          !isCurrentEngineRequest(
            get,
            requestFen,
            requestVersion,
            () => engineRequestVersion,
          )
        ) {
          return {
            ok: false,
            error: 'AI move request was superseded.',
          };
        }

        return failMoveAttempt(
          set,
          toErrorMessage(error, 'Failed to request AI move.'),
          {
            isEngineThinking: false,
          },
        );
      }
    },

    applyAiMove: (uciMove) => {
      const state = get();
      const gameState = getGameState(state);

      if (getTurn(gameState) !== state.aiSide) {
        return failMoveAttempt(set, 'It is not the AI side to move.');
      }

      cancelPendingEngineRequest();

      return applyMoveResult({
        get,
        set,
        result: applyUciMove(gameState, uciMove),
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
  set: SetGameStoreState;
  move: ChessMove;
  player: GameMoveRecord['player'];
}): GameMoveAttemptResult {
  return applyMoveResult({
    get,
    set,
    result: applyMove(getGameState(get()), move),
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
  const displayState = getGameDisplayState(gameState);

  return {
    currentFen: getFen(gameState),
    selectedSquare: null,
    legalDestinationSquares: [],
    pendingPromotion: null,
    moveHistory,
    gameStatus: displayState.gameStatus,
    gameStatusLabel: displayState.gameStatusLabel,
    humanSide,
    aiSide,
    sideToMove: displayState.sideToMove,
    sideToMoveLabel: displayState.sideToMoveLabel,
    aiDifficulty,
    isEngineThinking,
    latestError,
  } satisfies Pick<
    GameStoreState,
    | 'currentFen'
    | 'selectedSquare'
    | 'legalDestinationSquares'
    | 'pendingPromotion'
    | 'moveHistory'
    | 'gameStatus'
    | 'gameStatusLabel'
    | 'humanSide'
    | 'aiSide'
    | 'sideToMove'
    | 'sideToMoveLabel'
    | 'aiDifficulty'
    | 'isEngineThinking'
    | 'latestError'
  >;
}

function getGameState(
  stateOrGet: GameStoreState | (() => GameStoreState),
): ChessGameState {
  const state =
    typeof stateOrGet === 'function' ? stateOrGet() : stateOrGet;

  return {
    fen: state.currentFen,
  };
}

function resolveInitialGameState(initialFen?: string): ChessGameState {
  if (!initialFen) {
    return createInitialGameState();
  }

  const result = loadGameStateFromFen(initialFen);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.gameState;
}

function moveRequiresPromotion(
  gameState: ChessGameState,
  move: Pick<ChessMove, 'from' | 'to'>,
): boolean {
  return getLegalMoves(gameState, move.from).some(
    (legalMove) => legalMove.to === move.to && legalMove.promotion,
  );
}

function canRequestMove(gameStatus: ChessGameStatus): boolean {
  return gameStatus.kind === 'ongoing' || gameStatus.kind === 'check';
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

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
