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
  onDifficultyChange: (difficulty: AiDifficulty) => void;
  onNewGame: () => void;
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
  onDifficultyChange,
  onNewGame,
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
      style={{
        display: 'grid',
        gap: '1rem',
      }}
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
        style={{
          display: 'grid',
          gap: '0.5rem',
        }}
      >
        <p style={{ margin: 0 }}>Status: {status}</p>
        <p style={{ margin: 0 }}>Side to move: {sideToMove}</p>
        <p style={{ margin: 0 }}>Human side: {humanSide}</p>
        <p style={{ margin: 0 }}>AI side: {aiSide}</p>
        <p aria-live="polite" style={{ margin: 0 }}>
          {isEngineThinking ? 'Engine thinking' : 'Engine idle'}
        </p>
        <p role={latestError ? 'alert' : undefined} style={{ margin: 0 }}>
          Latest error: {latestError ?? 'None'}
        </p>
      </div>

      <div
        aria-label="Game controls"
        style={{
          display: 'grid',
          gap: '0.75rem',
        }}
      >
        <label
          htmlFor="game-panel-difficulty"
          style={{
            display: 'grid',
            gap: '0.35rem',
          }}
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
      </div>

      <section aria-label="Move history">
        <h3
          style={{
            margin: '0 0 0.75rem',
            fontSize: '1rem',
          }}
        >
          Move history
        </h3>
        {moveHistory.length > 0 ? (
          <ol
            style={{
              margin: 0,
              paddingLeft: '1.25rem',
            }}
          >
            {moveHistory.map((move) => (
              <li key={move}>{move}</li>
            ))}
          </ol>
        ) : (
          <p style={{ margin: 0 }}>No moves yet.</p>
        )}
      </section>
    </section>
  );
}
