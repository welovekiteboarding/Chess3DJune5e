import type { ParsedBestMove, ParsedInfo } from './stockfishProtocol';

export type AiDifficulty = 'easy' | 'medium' | 'hard';

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
