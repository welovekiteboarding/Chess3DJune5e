import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import { useStore } from 'zustand';

import '../styles/globals.css';
import type { ChessGameStatus, ChessSquare } from '../chess/chessTypes';
import { getPiecePlacementsFromFen } from '../chess/chessRules';
import type { AiDifficulty } from '../engine/engineTypes';
import {
  createStockfishEngine,
  type StockfishWorkerLike,
} from '../engine/stockfishEngine';
import { createGameStore, type GameStore } from '../game/gameStore';
import { BoardScene, type BoardSceneCanvasProps } from '../scene/BoardScene';
import { GamePanel } from '../ui/GamePanel';
import { PromotionDialog } from '../ui/PromotionDialog';
import stockfishWorkerUrl from 'stockfish/bin/stockfish-18-asm.js?url';

const difficultyOptions = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
] as const;

interface OwnedGameStoreRuntime {
  engine: ReturnType<typeof createStockfishEngine>;
  store: GameStore;
}

function createStockfishWorker(): StockfishWorkerLike {
  return new Worker(stockfishWorkerUrl, {
    name: 'stockfish-engine',
    type: 'classic',
  }) as StockfishWorkerLike;
}

function createOwnedGameStoreRuntime(): OwnedGameStoreRuntime {
  const engine = createStockfishEngine({
    workerFactory: createStockfishWorker,
  });

  return {
    engine,
    store: createGameStore({ engine }),
  };
}

export interface AppProps {
  autoRequestAiMoves?: boolean;
  boardSceneCanvasBoundary?: ComponentType<BoardSceneCanvasProps>;
  store?: GameStore;
}

export function App({
  autoRequestAiMoves = true,
  boardSceneCanvasBoundary,
  store: providedStore,
}: AppProps = {}) {
  const [ownedRuntime] = useState<OwnedGameStoreRuntime | null>(() => {
    if (providedStore) {
      return null;
    }

    return createOwnedGameStoreRuntime();
  });

  const store = providedStore ?? ownedRuntime?.store;

  if (!store) {
    throw new Error('The game store could not be initialized.');
  }

  const {
    aiDifficulty,
    aiSide,
    clearSelection,
    completePendingPromotion,
    cancelPendingPromotion,
    currentFen,
    gameStatus,
    gameStatusLabel,
    humanSide,
    isEngineThinking,
    latestError,
    legalDestinationSquares,
    moveHistory,
    pendingPromotion,
    requestAiMove,
    selectSquare,
    selectedSquare,
    setAiDifficulty,
    sideToMove,
    sideToMoveLabel,
    startNewGame,
    attemptHumanMove,
  } = useStore(store, (state) => state);

  const piecePlacements = getPiecePlacementsFromFen(currentFen);
  const moveHistoryLabels = moveHistory.map((move, index) =>
    `${index + 1}. ${move.player} ${move.uci}`,
  );

  useEffect(() => {
    if (providedStore || !ownedRuntime) {
      return;
    }

    return () => {
      void ownedRuntime.engine.dispose();
    };
  }, [ownedRuntime, providedStore]);

  useEffect(() => {
    if (!autoRequestAiMoves) {
      return;
    }

    if (
      latestError ||
      isEngineThinking ||
      sideToMove !== aiSide ||
      !canAiMove(gameStatus)
    ) {
      return;
    }

    void requestAiMove();
  }, [
    aiSide,
    autoRequestAiMoves,
    gameStatus,
    isEngineThinking,
    latestError,
    requestAiMove,
    sideToMove,
  ]);

  function handleSquareSelect(square: ChessSquare) {
    if (selectedSquare === square) {
      clearSelection();
      return;
    }

    if (selectedSquare && legalDestinationSquares.includes(square)) {
      attemptHumanMove(square);
      return;
    }

    selectSquare(square);
  }

  function handleDifficultyChange(nextDifficulty: string) {
    void setAiDifficulty(nextDifficulty as AiDifficulty);
  }

  return (
    <div className="app-shell" data-testid="app-shell">
      <div className="app-backdrop" />

      <header className="hero-bar">
        <p className="eyebrow">Local foundation</p>
        <h1 data-testid="app-shell-title">3D Chess</h1>
        <p className="hero-copy">
          A local-first shell that wires the board scene, game controls, and
          store state into one responsive workspace.
        </p>
      </header>

      <main className="workspace-grid">
        <section
          aria-label="Board region"
          className="workspace-card board-region"
          role="region"
        >
          <div className="card-chrome">
            <span>Board</span>
            <span>{sideToMoveLabel}</span>
          </div>
          <BoardScene
            CanvasBoundary={boardSceneCanvasBoundary}
            className="board-scene"
            legalDestinationSquares={legalDestinationSquares}
            onSquareSelect={handleSquareSelect}
            piecePlacements={piecePlacements}
            selectedSquare={selectedSquare}
          />
        </section>

        <section
          aria-label="Panel region"
          className="workspace-card panel-region"
          role="region"
        >
          <div className="card-chrome">
            <span>Controls</span>
            <span>{gameStatusLabel}</span>
          </div>
          <div className="panel-scroll">
            {pendingPromotion ? (
              <PromotionDialog
                choices={pendingPromotion.choices}
                onCancel={cancelPendingPromotion}
                onChoose={completePendingPromotion}
              />
            ) : null}
            <GamePanel
              aiSide={capitalizeLabel(aiSide)}
              difficultyOptions={difficultyOptions}
              humanSide={capitalizeLabel(humanSide)}
              isEngineThinking={isEngineThinking}
              latestError={latestError}
              moveHistory={moveHistoryLabels}
              onDifficultyChange={handleDifficultyChange}
              onNewGame={startNewGame}
              selectedDifficulty={aiDifficulty}
              sideToMove={sideToMoveLabel}
              status={gameStatusLabel}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function canAiMove(gameStatus: ChessGameStatus): boolean {
  return gameStatus.kind === 'ongoing' || gameStatus.kind === 'check';
}

function capitalizeLabel(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
