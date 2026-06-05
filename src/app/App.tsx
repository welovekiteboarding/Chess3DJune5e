export function App() {
  return (
    <div className="app-shell">
      <header className="hero-bar">
        <h1>3D Chess</h1>
        <p className="hero-copy">
          A focused foundation for human-vs-Stockfish play, ready for board
          rendering and game-state wiring in later tasks.
        </p>
      </header>

      <main className="workspace-grid">
        <section aria-label="Board region" className="panel panel-board">
          <div className="panel-chrome">
            <span>Board</span>
            <span>Viewport</span>
          </div>
          <div className="placeholder-surface">
            <strong>Board viewport placeholder</strong>
            <p>Reserved for the interactive 3D board scene.</p>
          </div>
        </section>

        <aside aria-label="Game panel region" className="panel panel-sidebar">
          <div className="panel-chrome">
            <span>Game panel</span>
            <span>Controls</span>
          </div>
          <div className="placeholder-stack">
            <div className="placeholder-card">
              <strong>Game panel placeholder</strong>
              <p>Reserved for move history, engine controls, and status.</p>
            </div>
            <div className="placeholder-card placeholder-card-muted">
              <span>Next up</span>
              <p>Chess state, engine integration, and 3D interaction.</p>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
