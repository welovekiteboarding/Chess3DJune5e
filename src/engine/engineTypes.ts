import type { ParsedBestMove, ParsedInfo } from './stockfishProtocol';

export const AI_DIFFICULTY_LEVELS = ['easy', 'medium', 'hard'] as const;

export type AiDifficulty = (typeof AI_DIFFICULTY_LEVELS)[number];

export interface StockfishSearchSettings {
  depth: number;
}

// Keep the mapping intentionally small and deterministic so difficulty changes
// are easy to reason about in tests and at the UCI adapter boundary.
export const STOCKFISH_SEARCH_SETTINGS_BY_DIFFICULTY: Readonly<
  Record<AiDifficulty, StockfishSearchSettings>
> = {
  easy: { depth: 6 },
  medium: { depth: 10 },
  hard: { depth: 14 },
};

export type EngineLifecycleState =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'searching'
  | 'disposed';

export interface BestMoveRequest {
  fen: string;
}

export interface BestMoveResponse extends ParsedBestMove {
  difficulty: AiDifficulty;
  fen: string;
  info?: ParsedInfo;
}

export type EngineCancellationReason = 'cancelled' | 'disposed';

export interface EngineCancellation {
  reason: EngineCancellationReason;
}

export interface EngineDisposal {
  disposed: true;
}

export interface AsyncEngineAdapter {
  readonly state: EngineLifecycleState;
  setDifficulty(difficulty: AiDifficulty): Promise<void>;
  requestBestMove(request: BestMoveRequest): Promise<BestMoveResponse>;
  cancelSearch(reason?: EngineCancellationReason): Promise<void>;
  dispose(): Promise<void>;
}

export type EngineFactory = () => AsyncEngineAdapter;
