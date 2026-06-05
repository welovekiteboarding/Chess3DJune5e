import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import { useStore } from 'zustand';

import '../styles/globals.css';
import type { ChessGameStatus, ChessSquare } from '../chess/chessTypes';
import type { AiDifficulty } from '../engine/engineTypes';
import { createStockfishEngine } from '../engine/stockfishEngine';
import { createGameStore, type GameStore } from '../game/gameStore';
import {
  BoardScene,
  type BoardSceneCanvasProps,
  type BoardScenePiecePlacement,
} from '../scene/BoardScene';
import { GamePanel } from '../ui/GamePanel';

const difficultyOptions = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
] as const;

interface OwnedGameStoreRuntime {
  engine: ReturnType<typeof createStockfishEngine>;
  store: GameStore;
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

    const engine = createStockfishEngine();

    return {
      engine,
      store: createGameStore({ engine }),
    };
  });

  const store = providedStore ?? ownedRuntime?.store;

  if (!store) {
    throw new Error('The game store could not be initialized.');
  }

  const {
    aiDifficulty,
    aiSide,
    clearSelection,
    currentFen,
    gameStatus,
    humanSide,
    isEngineThinking,
    latestError,
    legalDestinationSquares,
    moveHistory,
    requestAiMove,
    selectSquare,
    selectedSquare,
    setAiDifficulty,
    startNewGame,
    attemptHumanMove,
  } = useStore(store, (state) => state);

  const sideToMove = getSideToMove(currentFen);
  const piecePlacements = getPiecePlacements(currentFen);
  const statusLabel = formatGameStatus(gameStatus);
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

    if (isEngineThinking || sideToMove !== aiSide || !canAiMove(gameStatus)) {
      return;
    }

    void requestAiMove();
  }, [
    aiSide,
    autoRequestAiMoves,
    gameStatus,
    isEngineThinking,
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
    <div className="app-shell">
      <div className="app-backdrop" />

      <header className="hero-bar">
        <p className="eyebrow">Local foundation</p>
        <h1>3D Chess</h1>
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
            <span>{capitalizeLabel(sideToMove)} to move</span>
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
            <span>{statusLabel}</span>
          </div>
          <div className="panel-scroll">
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
              sideToMove={capitalizeLabel(sideToMove)}
              status={statusLabel}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function formatGameStatus(gameStatus: ChessGameStatus): string {
  switch (gameStatus.kind) {
    case 'ongoing':
      return 'In progress';
    case 'check':
      return 'Check';
    case 'checkmate':
      return 'Checkmate';
    case 'stalemate':
      return 'Stalemate';
    case 'draw':
      return gameStatus.reason === 'insufficient-material'
        ? 'Draw by insufficient material'
        : 'Draw';
    default:
      return 'In progress';
  }
}

function canAiMove(gameStatus: ChessGameStatus): boolean {
  return gameStatus.kind === 'ongoing' || gameStatus.kind === 'check';
}

function getSideToMove(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

function getPiecePlacements(fen: string): BoardScenePiecePlacement[] {
  const [boardState] = fen.split(' ');

  if (!boardState) {
    return [];
  }

  const ranks = boardState.split('/');
  const piecePlacements: BoardScenePiecePlacement[] = [];

  for (let rankIndex = 0; rankIndex < ranks.length; rankIndex += 1) {
    const rank = ranks[rankIndex];

    if (!rank) {
      continue;
    }

    let fileIndex = 0;

    for (const symbol of rank) {
      const emptySquares = Number(symbol);

      if (Number.isInteger(emptySquares) && emptySquares > 0) {
        fileIndex += emptySquares;
        continue;
      }

      const piecePlacement = createPiecePlacement(symbol, fileIndex, rankIndex);

      if (piecePlacement) {
        piecePlacements.push(piecePlacement);
      }

      fileIndex += 1;
    }
  }

  return piecePlacements;
}

function createPiecePlacement(
  symbol: string,
  fileIndex: number,
  rankIndex: number,
): BoardScenePiecePlacement | null {
  const pieceMap: Record<string, BoardScenePiecePlacement['piece']> = {
    p: 'pawn',
    n: 'knight',
    b: 'bishop',
    r: 'rook',
    q: 'queen',
    k: 'king',
  };
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
  const rank = 8 - rankIndex;
  const file = files[fileIndex];
  const normalizedSymbol = symbol.toLowerCase();
  const piece = pieceMap[normalizedSymbol];

  if (!piece || !file || rank < 1 || rank > 8) {
    return null;
  }

  return {
    square: `${file}${rank}` as ChessSquare,
    piece,
    color: symbol === normalizedSymbol ? 'black' : 'white',
  };
}

function capitalizeLabel(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
