import type { ComponentType } from 'react';
import { useEffect } from 'react';
import { useStore } from 'zustand';

import '../styles/globals.css';
import type { ChessGameStatus, ChessSquare } from '../chess/chessTypes';
import { getPiecePlacementsFromFen } from '../chess/chessRules';
import { AI_DIFFICULTY_LEVELS, type AiDifficulty } from '../engine/engineTypes';
import type { GameStore, GameStoreState } from '../game/gameStore';
import { BoardScene, type BoardSceneCanvasProps } from '../scene/BoardScene';
import { GamePanel, type GamePanelDifficultyOption } from '../ui/GamePanel';
import { PromotionDialog } from '../ui/PromotionDialog';

const difficultyOptions: readonly GamePanelDifficultyOption[] =
  AI_DIFFICULTY_LEVELS.map((value) => ({
    value,
    label: capitalizeLabel(value),
  }));

export interface AppProps {
  autoRequestAiMoves?: boolean;
  boardSceneCanvasBoundary?: ComponentType<BoardSceneCanvasProps>;
  store: GameStore;
}

export function App({
  autoRequestAiMoves = true,
  boardSceneCanvasBoundary,
  store,
}: AppProps) {
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
    if (!autoRequestAiMoves) {
      return;
    }

    if (
      !shouldAutoRequestAiMove({
        aiSide,
        gameStatus,
        isEngineThinking,
        latestError,
        pendingPromotion,
        sideToMove,
      })
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
    pendingPromotion,
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

  function handleDifficultyChange(nextDifficulty: AiDifficulty) {
    void setAiDifficulty(nextDifficulty);
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

function shouldAutoRequestAiMove({
  aiSide,
  gameStatus,
  isEngineThinking,
  latestError,
  pendingPromotion,
  sideToMove,
}: {
  aiSide: GameStoreState['aiSide'];
  gameStatus: ChessGameStatus;
  isEngineThinking: boolean;
  latestError: string | null;
  pendingPromotion: GameStoreState['pendingPromotion'];
  sideToMove: GameStoreState['sideToMove'];
}): boolean {
  return (
    latestError === null &&
    pendingPromotion === null &&
    !isEngineThinking &&
    sideToMove === aiSide &&
    canAiMove(gameStatus)
  );
}

function capitalizeLabel(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
