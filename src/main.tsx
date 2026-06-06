import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import type { AsyncEngineAdapter, EngineFactory } from './engine/engineTypes';
import { createBrowserStockfishEngine } from './engine/stockfishEngine';
import { createGameStore, type GameStore } from './game/gameStore';

interface OwnedGameStoreRuntime {
  engine: AsyncEngineAdapter;
  store: GameStore;
}

const createProductionEngine: EngineFactory = () => createBrowserStockfishEngine();

function createOwnedGameStoreRuntime(): OwnedGameStoreRuntime {
  const engine = createProductionEngine();

  return {
    engine,
    store: createGameStore({ engine }),
  };
}

export function RootApp() {
  const [ownedRuntime] = useState(createOwnedGameStoreRuntime);

  useEffect(() => {
    return () => {
      void ownedRuntime.engine.dispose();
    };
  }, [ownedRuntime]);

  return <App store={ownedRuntime.store} />;
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root was not found.');
}

createRoot(rootElement).render(<RootApp />);
