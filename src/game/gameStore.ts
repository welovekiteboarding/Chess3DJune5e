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

export type GameErrorKind = 'input' | 'engine';

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
  boardResetRevision: number;
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
  latestErrorKind: GameErrorKind | null;
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
  cancelAiMove: () => void;
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
  let pendingAiRequestFen: string | null = null;
  let pendingAiRequestPromise: Promise<GameMoveAttemptResult> | null = null;

  const invalidatePendingEngineRequest = () => {
    engineRequestVersion += 1;
    pendingAiRequestFen = null;
    pendingAiRequestPromise = null;
    return engineRequestVersion;
  };

  const cancelPendingEngineRequest = (set: SetGameStoreState) => {
    invalidatePendingEngineRequest();
    set({
      isEngineThinking: false,
      latestError: null,
      latestErrorKind: null,
    });
    void engine.cancelSearch().catch(() => undefined);
  };

  return createStore<GameStoreState>()((set, get) => ({
    ...buildStateSnapshot({
      gameState: initialGameState,
      humanSide,
      aiSide,
      aiDifficulty: initialDifficulty,
      boardResetRevision: 0,
      moveHistory: [],
      isEngineThinking: false,
      latestError: null,
      latestErrorKind: null,
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
          latestErrorKind: null,
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
        latestErrorKind: null,
      });
    },

    startNewGame: () => {
      cancelPendingEngineRequest(set);
      const nextGameState = createInitialGameState();

      set((state) => ({
        ...buildStateSnapshot({
          gameState: nextGameState,
          humanSide: state.humanSide,
          aiSide: state.aiSide,
          aiDifficulty: state.aiDifficulty,
          boardResetRevision: state.boardResetRevision + 1,
          moveHistory: [],
          isEngineThinking: false,
          latestError: null,
          latestErrorKind: null,
        }),
      }));
    },

    setAiDifficulty: async (difficulty) => {
      try {
        await engine.setDifficulty(difficulty);
        set({
          aiDifficulty: difficulty,
          latestError: null,
          latestErrorKind: null,
        });
      } catch (error) {
        set({
          latestError: toErrorMessage(error, 'Failed to set AI difficulty.'),
          latestErrorKind: 'engine',
        });
      }
    },

    requestAiMove: async () => {
      const state = get();
      const gameState = getGameState(state);

      if (state.pendingPromotion) {
        return failMoveAttempt(set, 'A promotion choice is pending.');
      }

      if (getTurn(gameState) !== state.aiSide) {
        return failMoveAttempt(set, 'It is not the AI side to move.');
      }

      if (!canRequestMove(state.gameStatus)) {
        return failMoveAttempt(set, 'The game is over.');
      }

      const requestFen = state.currentFen;

      if (
        pendingAiRequestFen === requestFen &&
        pendingAiRequestPromise
      ) {
        return pendingAiRequestPromise;
      }

      const requestVersion = invalidatePendingEngineRequest();

      set({
        isEngineThinking: true,
        latestError: null,
        latestErrorKind: null,
      });

      let requestPromise: Promise<GameMoveAttemptResult> | null = null;

      requestPromise = (async (): Promise<GameMoveAttemptResult> => {
        try {
          await engine.setDifficulty(state.aiDifficulty);

          if (
            !isCurrentEngineRequest(
              get,
              requestFen,
              requestVersion,
              () => engineRequestVersion,
            )
          ) {
            return createSupersededAiMoveAttempt();
          }

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
            return createSupersededAiMoveAttempt();
          }

          if (response.fen !== requestFen) {
            return failMoveAttempt(
              set,
              'Engine returned a best move for an unexpected position.',
              {
                isEngineThinking: false,
              },
              'engine',
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
            return createSupersededAiMoveAttempt();
          }

          return failMoveAttempt(
            set,
            toErrorMessage(error, 'Failed to request AI move.'),
            {
              isEngineThinking: false,
            },
            'engine',
          );
        } finally {
          if (pendingAiRequestPromise === requestPromise) {
            pendingAiRequestFen = null;
            pendingAiRequestPromise = null;
          }
        }
      })();

      pendingAiRequestFen = requestFen;
      pendingAiRequestPromise = requestPromise;

      return requestPromise;
    },

    cancelAiMove: () => {
      const state = get();

      if (
        !state.isEngineThinking ||
        pendingAiRequestPromise === null ||
        pendingAiRequestFen !== state.currentFen
      ) {
        return;
      }

      invalidatePendingEngineRequest();
      set({
        isEngineThinking: false,
        latestError: CANCELLED_AI_MOVE_ERROR,
        latestErrorKind: 'engine',
      });
      void engine.cancelSearch().catch(() => undefined);
    },

    applyAiMove: (uciMove) => {
      const state = get();
      const gameState = getGameState(state);

      if (getTurn(gameState) !== state.aiSide) {
        return failMoveAttempt(set, 'It is not the AI side to move.');
      }

      cancelPendingEngineRequest(set);

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
    return failMoveAttempt(
      set,
      result.error.message,
      {
        isEngineThinking: false,
      },
      player === 'ai' ? 'engine' : 'input',
    );
  }

  const state = get();

  set({
    ...buildStateSnapshot({
      gameState: result.gameState,
      humanSide: state.humanSide,
      aiSide: state.aiSide,
      aiDifficulty: state.aiDifficulty,
      boardResetRevision: state.boardResetRevision,
      moveHistory: [
        ...state.moveHistory,
        {
          player,
          uci: result.move.uci,
        },
      ],
      isEngineThinking: false,
      latestError: null,
      latestErrorKind: null,
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
  kind: GameErrorKind = 'input',
): GameMoveAttemptResult {
  set({
    ...extraState,
    latestError: error,
    latestErrorKind: kind,
  });

  return {
    ok: false,
    error,
  };
}

function createSupersededAiMoveAttempt(): GameMoveAttemptResult {
  return {
    ok: false,
    error: 'AI move request was superseded.',
  };
}

const CANCELLED_AI_MOVE_ERROR =
  'AI move was cancelled. Retry AI move to continue.';

function buildStateSnapshot({
  gameState,
  humanSide,
  aiSide,
  aiDifficulty,
  boardResetRevision,
  moveHistory,
  isEngineThinking,
  latestError,
  latestErrorKind,
}: {
  gameState: ChessGameState;
  humanSide: ChessPlayer;
  aiSide: ChessPlayer;
  aiDifficulty: AiDifficulty;
  boardResetRevision: number;
  moveHistory: GameMoveRecord[];
  isEngineThinking: boolean;
  latestError: string | null;
  latestErrorKind: GameErrorKind | null;
}) {
  const displayState = getGameDisplayState(gameState);

  return {
    boardResetRevision,
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
    latestErrorKind,
  } satisfies Pick<
    GameStoreState,
    | 'boardResetRevision'
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
    | 'latestErrorKind'
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
