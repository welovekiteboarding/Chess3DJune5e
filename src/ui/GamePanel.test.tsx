import { fireEvent, render, screen } from '@testing-library/react';

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
        sideToMove="White"
        status="Check"
      />,
    );

    expect(screen.getByText('Status: Check')).toBeInTheDocument();
    expect(screen.getByText('Side to move: White')).toBeInTheDocument();
    expect(screen.getByText('Human side: White')).toBeInTheDocument();
    expect(screen.getByText('AI side: Black')).toBeInTheDocument();
    expect(screen.getByText('1. e4 e5')).toBeInTheDocument();
    expect(screen.getByText('2. Nf3 Nc6')).toBeInTheDocument();
    expect(
      screen.getByText('Latest error: Engine lost connection.'),
    ).toBeInTheDocument();
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
        sideToMove="White"
        status="In progress"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'New game' }));

    expect(handleNewGame).toHaveBeenCalledTimes(1);
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
        sideToMove="Black"
        status="In progress"
      />,
    );

    const difficultyControl = screen.getByLabelText('AI difficulty');
    const difficultyValues = screen
      .getAllByRole('option')
      .map((option) => option.textContent);

    expect(difficultyControl).toHaveValue('medium');
    expect(difficultyValues).toEqual(['Easy', 'Medium', 'Hard']);
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
        sideToMove="White"
        status="In progress"
      />,
    );

    expect(screen.getByText('Engine: Thinking')).toBeInTheDocument();
  });
});
