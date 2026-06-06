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
      <header>
        <h2
          id="game-panel-title"
          style={{
            margin: 0,
            fontSize: '1.25rem',
          }}
        >
          Game control panel
        </h2>
      </header>

      <div
        aria-label="Current game details"
        className="game-panel__details"
      >
        <p style={{ margin: 0 }}>Status: {status}</p>
        <p style={{ margin: 0 }}>Side to move: {sideToMove}</p>
        <p style={{ margin: 0 }}>Human side: {humanSide}</p>
        <p style={{ margin: 0 }}>AI side: {aiSide}</p>
        <p aria-live="polite" style={{ margin: 0 }}>
          {isEngineThinking ? 'Engine thinking' : 'Engine idle'}
        </p>
        {latestError ? (
          <p
            aria-atomic="true"
            aria-label="Engine error"
            aria-live="assertive"
            role="alert"
            style={{ margin: 0 }}
          >
            Latest error: {latestError}
          </p>
        ) : (
          <p style={{ margin: 0 }}>Latest error: None</p>
        )}
      </div>

      <div
        aria-label="Game controls"
        className="game-panel__controls"
      >
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

      <section
        aria-label="Move history"
        className="game-panel__history"
        data-testid="move-history-section"
      >
        <h3
          style={{
            margin: '0 0 0.75rem',
            fontSize: '1rem',
          }}
        >
          Move history
        </h3>
        <div
          className="game-panel__history-scroll"
          data-testid="move-history-scroll"
        >
          {moveHistory.length > 0 ? (
            <ol className="game-panel__history-list" data-testid="move-history-list">
              {moveHistory.map((move) => (
                <li key={move}>{move}</li>
              ))}
            </ol>
          ) : (
            <p style={{ margin: 0 }}>No moves yet.</p>
          )}
        </div>
      </section>
    </section>
  );
}
