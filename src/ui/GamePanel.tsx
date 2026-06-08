import { useState, type ChangeEvent } from 'react';

import type { AiDifficulty } from '../engine/engineTypes';

export interface GamePanelDifficultyOption {
  label: string;
  value: AiDifficulty;
}

export interface GamePanelProps {
  aiSide: string;
  difficultyOptions: readonly GamePanelDifficultyOption[];
  humanSide: string;
  isEngineThinking?: boolean;
  latestError?: string | null;
  moveHistory?: readonly string[];
  onCancelAiMove?: () => void;
  onDifficultyChange: (difficulty: AiDifficulty) => void;
  onNewGame: () => void;
  onRetryAiMove?: () => void;
  requiresNewGameConfirmation?: boolean;
  selectedDifficulty: AiDifficulty;
  sideToMove: string;
  status: string;
}

export function GamePanel({
  difficultyOptions,
  isEngineThinking = false,
  latestError = null,
  moveHistory = [],
  onCancelAiMove,
  onDifficultyChange,
  onNewGame,
  onRetryAiMove,
  requiresNewGameConfirmation = false,
  selectedDifficulty,
  status,
}: GamePanelProps) {
  const shouldShowChessAlert = isImportantChessStatus(status);
  const [isConfirmingNewGameRequested, setIsConfirmingNewGameRequested] =
    useState(false);
  const isConfirmingNewGame =
    requiresNewGameConfirmation && isConfirmingNewGameRequested;

  function handleDifficultyChange(event: ChangeEvent<HTMLSelectElement>) {
    onDifficultyChange(event.target.value as AiDifficulty);
  }

  function handleNewGameClick() {
    if (!requiresNewGameConfirmation) {
      onNewGame();
      return;
    }

    setIsConfirmingNewGameRequested(true);
  }

  function handleConfirmNewGame() {
    setIsConfirmingNewGameRequested(false);
    onNewGame();
  }

  return (
    <section aria-label="Game panel" className="game-panel" data-testid="game-panel">
      {shouldShowChessAlert ? (
        <section
          aria-label="Chess alert"
          aria-atomic="true"
          aria-live="polite"
          className="game-panel__section game-panel__section--alert"
          data-testid="game-panel-chess-alert"
          role="status"
        >
          <span className="game-panel__alert-label">Chess alert</span>
          <strong className="game-panel__alert-status">{status}</strong>
        </section>
      ) : null}

      <section
        aria-label="Move history"
        className="game-panel__section game-panel__history"
        data-testid="move-history-section"
      >
        <div className="game-panel__section-heading">
          <h3>Move history</h3>
          <span className="game-panel__section-chip">
            {moveHistory.length} recorded
          </span>
        </div>
        <div
          aria-label="Move history entries"
          className="game-panel__history-scroll"
          data-testid="move-history-scroll"
          role="region"
          tabIndex={0}
        >
          {moveHistory.length > 0 ? (
            <ol className="game-panel__history-list" data-testid="move-history-list">
              {moveHistory.map((move, index) => (
                <li
                  className="game-panel__history-item"
                  data-move-index={index}
                  data-move-value={move}
                  data-testid="move-history-item"
                  key={`${index}-${move}`}
                >
                  {move}
                </li>
              ))}
            </ol>
          ) : (
            <p className="game-panel__empty-state">No moves yet.</p>
          )}
        </div>
      </section>

      <section
        aria-label="Game controls"
        className="game-panel__section game-panel__controls"
        data-testid="game-panel-controls"
      >
        <div className="game-panel__section-heading">
          <h3>Game controls</h3>
          <span className="game-panel__section-chip">Local</span>
        </div>
        <div className="game-panel__control-grid">
          <label
            className="game-panel__field"
            htmlFor="game-panel-difficulty"
          >
            <span>AI difficulty</span>
            <select
              id="game-panel-difficulty"
              onChange={handleDifficultyChange}
              value={selectedDifficulty}
            >
              {difficultyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="game-panel__button-row">
            {isConfirmingNewGame ? (
              <>
                <p className="game-panel__reset-warning">
                  Start over? Current progress will be lost.
                </p>
                <button onClick={handleConfirmNewGame} type="button">
                  Confirm new game
                </button>
                <button
                  onClick={() => setIsConfirmingNewGameRequested(false)}
                  type="button"
                >
                  Keep playing
                </button>
              </>
            ) : (
              <button onClick={handleNewGameClick} type="button">
                New game
              </button>
            )}

            {isEngineThinking && onCancelAiMove ? (
              <button onClick={onCancelAiMove} type="button">
                Cancel AI move
              </button>
            ) : null}

            {!isEngineThinking && onRetryAiMove ? (
              <button onClick={onRetryAiMove} type="button">
                Retry AI move
              </button>
            ) : null}
          </div>
        </div>
        {latestError ? (
          <p
            aria-atomic="true"
            aria-label="Engine error"
            aria-live="assertive"
            className="game-panel__engine-error"
            role="alert"
          >
            Latest error: {latestError}
          </p>
        ) : null}
      </section>
    </section>
  );
}

function isImportantChessStatus(status: string) {
  return (
    status === 'Check' ||
    status === 'Checkmate' ||
    status === 'Stalemate' ||
    status === 'Draw'
  );
}
