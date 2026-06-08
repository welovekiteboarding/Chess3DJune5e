import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
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
const browserFixtureSearchParam = 'e2e-fixture';

declare global {
  interface Window {
    __CHESS3D_E2E__?: {
      setMoveHistoryFixture: (moves: readonly string[]) => void;
    };
  }
}

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
  const isBrowserFixtureEnabled = hasBrowserFixtureFlag();
  const {
    aiDifficulty,
    aiSide,
    cancelAiMove,
    completePendingPromotion,
    cancelPendingPromotion,
    currentFen,
    gameStatus,
    gameStatusLabel,
    humanSide,
    isEngineThinking,
    latestError,
    latestErrorKind,
    legalDestinationSquares,
    moveHistory,
    pendingPromotion,
    requestAiMove,
    selectedSquare,
    setAiDifficulty,
    sideToMove,
    sideToMoveLabel,
    startNewGame,
  } = useStore(store, (state) => state);
  const [moveHistoryFixture, setMoveHistoryFixture] = useState<
    readonly string[] | null
  >(null);

  const piecePlacements = getPiecePlacementsFromFen(currentFen);
  const moveHistoryLabels = moveHistory.map((move, index) =>
    `${index + 1}. ${move.player} ${move.uci}`,
  );
  const renderedMoveHistory = moveHistoryFixture ?? moveHistoryLabels;

  useEffect(() => {
    if (!autoRequestAiMoves) {
      return;
    }

    if (
      !shouldAutoRequestAiMove({
        aiSide,
        gameStatus,
        isEngineThinking,
        latestErrorKind,
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
    latestErrorKind,
    pendingPromotion,
    requestAiMove,
    sideToMove,
  ]);

  useEffect(() => {
    if (!isBrowserFixtureEnabled) {
      return;
    }

    window.__CHESS3D_E2E__ = {
      setMoveHistoryFixture(moves) {
        setMoveHistoryFixture([...moves]);
      },
    };

    return () => {
      delete window.__CHESS3D_E2E__;
    };
  }, [isBrowserFixtureEnabled]);

  function handleSquareSelect(square: ChessSquare) {
    handleBoardSquareSelect(store, square);
  }

  function handleDifficultyChange(nextDifficulty: AiDifficulty) {
    void setAiDifficulty(nextDifficulty);
  }

  function handleRetryAiMove() {
    void requestAiMove();
  }

  const canRetryAiMove =
    latestError !== null &&
    latestErrorKind === 'engine' &&
    pendingPromotion === null &&
    !isEngineThinking &&
    sideToMove === aiSide &&
    canAiMove(gameStatus);

  return (
    <div className="app-shell" data-testid="app-shell">
      <div className="app-backdrop" />
      <div className="app-shell__frame">
        <header className="hero-bar">
          <div className="hero-bar__title-group">
            <p className="eyebrow">Local Stockfish cockpit</p>
            <h1 data-testid="app-shell-title">3D Chess</h1>
            <p className="hero-copy">
              A contained desktop command surface with the board as the hero and
              move history and controls docked to the right.
            </p>
          </div>

          <div
            aria-label="Live game overview"
            className="hero-bar__status-grid"
          >
            <div className="hero-bar__status-chip">
              <span className="hero-bar__status-label">Status</span>
              <strong>{gameStatusLabel}</strong>
            </div>
            <div className="hero-bar__status-chip">
              <span className="hero-bar__status-label">Turn</span>
              <strong>{sideToMoveLabel}</strong>
            </div>
            <div className="hero-bar__status-chip">
              <span className="hero-bar__status-label">Engine</span>
              <strong>{isEngineThinking ? 'Thinking' : 'Idle'}</strong>
            </div>
          </div>
        </header>

        <main className="workspace-grid" data-testid="workspace-grid">
          <section
            aria-label="Board region"
            className="workspace-card board-region"
            data-testid="board-region"
            role="region"
          >
            <div className="card-chrome card-chrome--board">
              <div className="card-chrome__cluster">
                <span>Primary board</span>
                <strong>Hero viewport</strong>
              </div>
              <span>{sideToMoveLabel}</span>
            </div>
            <div className="board-region__intro">
              <div className="board-region__intro-copy">
                <p className="board-region__eyebrow">Command surface</p>
                <p className="board-region__title">Human vs Stockfish</p>
              </div>
              <p className="board-region__badge">
                {isEngineThinking ? 'Engine active' : 'Engine ready'}
              </p>
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
            data-testid="panel-region"
            role="region"
          >
            <div className="panel-scroll" data-testid="panel-scroll">
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
                moveHistory={renderedMoveHistory}
                onCancelAiMove={cancelAiMove}
                onDifficultyChange={handleDifficultyChange}
                onNewGame={startNewGame}
                onRetryAiMove={canRetryAiMove ? handleRetryAiMove : undefined}
                selectedDifficulty={aiDifficulty}
                sideToMove={sideToMoveLabel}
                status={gameStatusLabel}
              />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function handleBoardSquareSelect(store: GameStore, square: ChessSquare) {
  const state = store.getState();

  if (state.selectedSquare === square) {
    state.clearSelection();
    return;
  }

  if (
    state.selectedSquare !== null &&
    state.legalDestinationSquares.includes(square)
  ) {
    state.attemptHumanMove(square);
    return;
  }

  state.selectSquare(square);
}

function canAiMove(gameStatus: ChessGameStatus): boolean {
  return gameStatus.kind === 'ongoing' || gameStatus.kind === 'check';
}

function shouldAutoRequestAiMove({
  aiSide,
  gameStatus,
  isEngineThinking,
  latestErrorKind,
  pendingPromotion,
  sideToMove,
}: {
  aiSide: GameStoreState['aiSide'];
  gameStatus: ChessGameStatus;
  isEngineThinking: boolean;
  latestErrorKind: GameStoreState['latestErrorKind'];
  pendingPromotion: GameStoreState['pendingPromotion'];
  sideToMove: GameStoreState['sideToMove'];
}): boolean {
  return (
    latestErrorKind !== 'engine' &&
    pendingPromotion === null &&
    !isEngineThinking &&
    sideToMove === aiSide &&
    canAiMove(gameStatus)
  );
}

function capitalizeLabel(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function hasBrowserFixtureFlag() {
  if (typeof window === 'undefined') {
    return false;
  }

  return new URLSearchParams(window.location.search).has(
    browserFixtureSearchParam,
  );
}
