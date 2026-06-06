import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';

import { GamePanel } from './GamePanel';

describe('GamePanel', () => {
  const difficultyOptions = [
    { value: 'easy', label: 'Easy' },
    { value: 'medium', label: 'Medium' },
    { value: 'hard', label: 'Hard' },
  ] as const;

  it('renders current status details and move history', () => {
    render(
      <GamePanel
        aiSide="Black"
        difficultyOptions={difficultyOptions}
        humanSide="White"
        latestError="Engine lost connection."
        moveHistory={['1. e4 e5', '2. Nf3 Nc6']}
        onDifficultyChange={() => {}}
        onNewGame={() => {}}
        selectedDifficulty="medium"
        sideToMove="White to move"
        status="Check"
      />,
    );

    expect(screen.getByText('Status: Check')).toBeInTheDocument();
    expect(screen.getByText('Side to move: White to move')).toBeInTheDocument();
    expect(screen.getByText('Human side: White')).toBeInTheDocument();
    expect(screen.getByText('AI side: Black')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Command deck' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Match status' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Stockfish' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Game controls' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Move history' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('game-panel-details')).toBeInTheDocument();
    expect(screen.getByTestId('game-panel-controls')).toBeInTheDocument();
    expect(screen.getByText('1. e4 e5')).toBeInTheDocument();
    expect(screen.getByText('2. Nf3 Nc6')).toBeInTheDocument();
    expect(
      screen.getByText('Latest error: Engine lost connection.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('move-history-scroll')).toBeInTheDocument();
    expect(screen.getAllByTestId('move-history-item')).toHaveLength(2);
    expect(screen.getAllByTestId('move-history-item')[0]).toHaveAttribute(
      'data-move-index',
      '0',
    );
    expect(screen.getAllByTestId('move-history-item')[1]).toHaveAttribute(
      'data-move-value',
      '2. Nf3 Nc6',
    );
  });

  it('surfaces quick cockpit telemetry for turn, seats, and engine state', () => {
    render(
      <GamePanel
        aiSide="Black"
        difficultyOptions={difficultyOptions}
        humanSide="White"
        isEngineThinking
        moveHistory={[]}
        onDifficultyChange={() => {}}
        onNewGame={() => {}}
        selectedDifficulty="medium"
        sideToMove="White to move"
        status="Ongoing"
      />,
    );

    expect(screen.getByTestId('game-panel-telemetry-grid')).toBeInTheDocument();
    const telemetryItems = screen.getAllByTestId('game-panel-telemetry-item');

    expect(telemetryItems).toHaveLength(4);
    expect(screen.getByText('Turn')).toBeInTheDocument();
    expect(screen.getByText('White to move')).toBeInTheDocument();
    expect(screen.getByText('Human')).toBeInTheDocument();
    expect(screen.getByText('White')).toBeInTheDocument();
    expect(screen.getByText('AI seat')).toBeInTheDocument();
    expect(screen.getByText('Black')).toBeInTheDocument();
    expect(within(telemetryItems[3]).getByText('Engine')).toBeInTheDocument();
    expect(within(telemetryItems[3]).getByText('Thinking')).toBeInTheDocument();
  });

  it('announces the latest engine error through an accessible alert region', () => {
    render(
      <GamePanel
        aiSide="Black"
        difficultyOptions={difficultyOptions}
        humanSide="White"
        latestError="Engine lost connection."
        moveHistory={[]}
        onDifficultyChange={() => {}}
        onNewGame={() => {}}
        selectedDifficulty="medium"
        sideToMove="White to move"
        status="Check"
      />,
    );

    const alert = screen.getByRole('alert', { name: 'Engine error' });

    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveTextContent('Latest error: Engine lost connection.');
  });

  it('invokes the new game callback when the control is activated', () => {
    const handleNewGame = vi.fn();

    render(
      <GamePanel
        aiSide="Black"
        difficultyOptions={difficultyOptions}
        humanSide="White"
        moveHistory={[]}
        onDifficultyChange={() => {}}
        onNewGame={handleNewGame}
        selectedDifficulty="medium"
        sideToMove="White to move"
        status="Ongoing"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'New game' }));

    expect(handleNewGame).toHaveBeenCalledTimes(1);
  });

  it('shows a cancel control while the engine is thinking and invokes its callback', () => {
    const handleCancelAiMove = vi.fn();

    render(
      <GamePanel
        aiSide="White"
        difficultyOptions={difficultyOptions}
        humanSide="Black"
        isEngineThinking
        moveHistory={[]}
        onCancelAiMove={handleCancelAiMove}
        onDifficultyChange={() => {}}
        onNewGame={() => {}}
        selectedDifficulty="hard"
        sideToMove="White to move"
        status="Ongoing"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel AI move' }));

    expect(handleCancelAiMove).toHaveBeenCalledTimes(1);
  });

  it('does not show a cancel control when the engine is not thinking', () => {
    render(
      <GamePanel
        aiSide="Black"
        difficultyOptions={difficultyOptions}
        humanSide="White"
        moveHistory={[]}
        onCancelAiMove={() => {}}
        onDifficultyChange={() => {}}
        onNewGame={() => {}}
        selectedDifficulty="medium"
        sideToMove="White to move"
        status="Ongoing"
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Cancel AI move' }),
    ).not.toBeInTheDocument();
  });

  it('shows a retry control for a recoverable engine error and invokes its callback', () => {
    const handleRetryAiMove = vi.fn();

    render(
      <GamePanel
        aiSide="Black"
        difficultyOptions={difficultyOptions}
        humanSide="White"
        latestError="AI move was cancelled. Retry AI move to continue."
        moveHistory={[]}
        onDifficultyChange={() => {}}
        onNewGame={() => {}}
        onRetryAiMove={handleRetryAiMove}
        selectedDifficulty="medium"
        sideToMove="Black to move"
        status="Ongoing"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry AI move' }));

    expect(handleRetryAiMove).toHaveBeenCalledTimes(1);
  });

  it('exposes multiple AI difficulty levels', () => {
    render(
      <GamePanel
        aiSide="Black"
        difficultyOptions={difficultyOptions}
        humanSide="White"
        moveHistory={[]}
        onDifficultyChange={() => {}}
        onNewGame={() => {}}
        selectedDifficulty="medium"
        sideToMove="Black to move"
        status="Ongoing"
      />,
    );

    const difficultyControl = screen.getByLabelText('AI difficulty');
    const difficultyValues = screen
      .getAllByRole('option')
      .map((option) => option.textContent);

    expect(difficultyControl).toHaveValue('medium');
    expect(difficultyValues).toEqual(['Easy', 'Medium', 'Hard']);
  });

  it('invokes the difficulty callback when the selection changes', () => {
    const handleDifficultyChange = vi.fn();

    render(
      <GamePanel
        aiSide="Black"
        difficultyOptions={difficultyOptions}
        humanSide="White"
        moveHistory={[]}
        onDifficultyChange={handleDifficultyChange}
        onNewGame={() => {}}
        selectedDifficulty="medium"
        sideToMove="Black to move"
        status="Ongoing"
      />,
    );

    fireEvent.change(screen.getByLabelText('AI difficulty'), {
      target: { value: 'hard' },
    });

    expect(handleDifficultyChange).toHaveBeenCalledWith('hard');
  });

  it('displays the engine thinking state when active', () => {
    render(
      <GamePanel
        aiSide="White"
        difficultyOptions={difficultyOptions}
        humanSide="Black"
        isEngineThinking
        moveHistory={[]}
        onDifficultyChange={() => {}}
        onNewGame={() => {}}
        selectedDifficulty="hard"
        sideToMove="White to move"
        status="Ongoing"
      />,
    );

    expect(screen.getByText('Engine thinking')).toBeInTheDocument();
  });

  it('shows an idle engine status when the engine is not thinking', () => {
    render(
      <GamePanel
        aiSide="Black"
        difficultyOptions={difficultyOptions}
        humanSide="White"
        moveHistory={[]}
        onDifficultyChange={() => {}}
        onNewGame={() => {}}
        selectedDifficulty="medium"
        sideToMove="White to move"
        status="Ongoing"
      />,
    );

    expect(screen.getByText('Engine idle')).toBeInTheDocument();
  });

  it('keeps long move history inside a dedicated scroll region so controls remain separate', () => {
    render(
      <GamePanel
        aiSide="Black"
        difficultyOptions={difficultyOptions}
        humanSide="White"
        moveHistory={Array.from({ length: 80 }, (_, index) => `${index + 1}. human e2e4`)}
        onDifficultyChange={() => {}}
        onNewGame={() => {}}
        selectedDifficulty="medium"
        sideToMove="White to move"
        status="Ongoing"
      />,
    );

    const historySection = screen.getByTestId('move-history-section');
    const historyScroll = screen.getByTestId('move-history-scroll');
    const moveHistoryList = screen.getByTestId('move-history-list');

    expect(screen.getByTestId('game-panel-status')).toBeInTheDocument();
    expect(screen.getByTestId('game-panel-engine')).toBeInTheDocument();
    expect(historySection).toHaveClass('game-panel__history');
    expect(historyScroll).toHaveClass('game-panel__history-scroll');
    expect(moveHistoryList).toHaveClass('game-panel__history-list');
    expect(screen.getAllByRole('listitem')).toHaveLength(80);
    expect(screen.getByRole('button', { name: 'New game' })).toBeVisible();
    expect(screen.getByLabelText('AI difficulty')).toBeVisible();
  });
});
