import type { ChangeEvent } from 'react';

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
  selectedDifficulty: AiDifficulty;
  sideToMove: string;
  status: string;
}

export function GamePanel({
  aiSide,
  difficultyOptions,
  humanSide,
  isEngineThinking = false,
  latestError = null,
  moveHistory = [],
  onCancelAiMove,
  onDifficultyChange,
  onNewGame,
  onRetryAiMove,
  selectedDifficulty,
  sideToMove,
  status,
}: GamePanelProps) {
  function handleDifficultyChange(event: ChangeEvent<HTMLSelectElement>) {
    onDifficultyChange(event.target.value as AiDifficulty);
  }

  return (
    <section
      aria-labelledby="game-panel-title"
      className="game-panel"
      data-testid="game-panel"
    >
      <header className="game-panel__header">
        <div>
          <p className="game-panel__eyebrow">Match operations</p>
          <h2 id="game-panel-title">Command deck</h2>
        </div>
        <p className="game-panel__summary">
          Local-only telemetry, move tracking, and engine controls.
        </p>
      </header>

      <div className="game-panel__top-stack" data-testid="game-panel-details">
        <section
          aria-label="Current game details"
          className="game-panel__section game-panel__section--status"
          data-testid="game-panel-status"
        >
          <div className="game-panel__section-heading">
            <h3>Match status</h3>
            <span className="game-panel__section-chip">{status}</span>
          </div>
          <div className="game-panel__details">
            <p className="game-panel__detail-line">Status: {status}</p>
            <p className="game-panel__detail-line">Side to move: {sideToMove}</p>
            <p className="game-panel__detail-line">Human side: {humanSide}</p>
          </div>
        </section>

        <section
          aria-label="Stockfish state"
          className="game-panel__section game-panel__section--engine"
          data-testid="game-panel-engine"
        >
          <div className="game-panel__section-heading">
            <h3>Stockfish</h3>
            <span className="game-panel__section-chip game-panel__section-chip--accent">
              {isEngineThinking ? 'Thinking' : 'Idle'}
            </span>
          </div>
          <div aria-label="Current game details" className="game-panel__details">
            <p className="game-panel__detail-line">AI side: {aiSide}</p>
            <p aria-live="polite" className="game-panel__detail-line">
              {isEngineThinking ? 'Engine thinking' : 'Engine idle'}
            </p>
            {latestError ? (
              <p
                aria-atomic="true"
                aria-label="Engine error"
                aria-live="assertive"
                className="game-panel__detail-line game-panel__detail-line--error"
                role="alert"
              >
                Latest error: {latestError}
              </p>
            ) : (
              <p className="game-panel__detail-line">Latest error: None</p>
            )}
          </div>
        </section>
      </div>

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
          className="game-panel__history-scroll"
          data-testid="move-history-scroll"
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
            <button onClick={onNewGame} type="button">
              New game
            </button>

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
      </section>
    </section>
  );
}
