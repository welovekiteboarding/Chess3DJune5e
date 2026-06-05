import { render, screen } from '@testing-library/react';

import { App } from './App';

describe('App', () => {
  it('renders the 3D Chess shell with board and game panel placeholders', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: '3D Chess',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Local-first chess workstation'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Board viewport placeholder')).toBeInTheDocument();
    expect(screen.getByText('Game panel placeholder')).toBeInTheDocument();
  });
});
