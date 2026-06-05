import {
  createBrowserStockfishEngine,
  createStockfishEngine,
  getGoCommandForDifficulty,
} from './stockfishEngine';
import type { StockfishWorkerLike, UciTransport } from './stockfishEngine';

class FakeUciTransport implements UciTransport {
  readonly commands: string[] = [];
  terminated = false;

  private listener: ((line: string) => void) | null = null;

  send(command: string): void {
    this.commands.push(command);
  }

  onLine(listener: (line: string) => void): () => void {
    this.listener = listener;

    return () => {
      if (this.listener === listener) {
        this.listener = null;
      }
    };
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(...lines: string[]): void {
    for (const line of lines) {
      this.listener?.(line);
    }
  }
}

class FakeStockfishPackageEngine {
  readonly commands: string[] = [];
  listener: ((line: string) => void) | null = null;
  quitCalled = false;

  sendCommand(command: string): void {
    this.commands.push(command);
  }

  quit(): void {
    this.quitCalled = true;
  }

  emit(...lines: string[]): void {
    for (const line of lines) {
      this.listener?.(line);
    }
  }
}

class FakeStockfishWorker implements StockfishWorkerLike {
  readonly commands: string[] = [];
  terminated = false;

  private listeners = new Set<(event: unknown) => void>();

  addEventListener(
    type: 'message',
    listener: (event: unknown) => void,
  ): void {
    if (type === 'message') {
      this.listeners.add(listener);
    }
  }

  postMessage(message: string): void {
    this.commands.push(message);
  }

  removeEventListener(
    type: 'message',
    listener: (event: unknown) => void,
  ): void {
    if (type === 'message') {
      this.listeners.delete(listener);
    }
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(...lines: string[]): void {
    const event = {
      data: lines.join('\n'),
    };

    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

describe('stockfishEngine', () => {
  it('maps each supported difficulty to a deterministic go command', () => {
    expect(getGoCommandForDifficulty('easy')).toBe('go depth 6');
    expect(getGoCommandForDifficulty('medium')).toBe('go depth 10');
    expect(getGoCommandForDifficulty('hard')).toBe('go depth 14');
    expect(
      new Set([
        getGoCommandForDifficulty('easy'),
        getGoCommandForDifficulty('medium'),
        getGoCommandForDifficulty('hard'),
      ]).size,
    ).toBe(3);
  });

  it('sends the expected UCI sequence and resolves a best move', async () => {
    const transport = new FakeUciTransport();
    const engine = createStockfishEngine({
      transportFactory: () => transport,
    });
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    await engine.setDifficulty('medium');

    const bestMovePromise = engine.requestBestMove({ fen });

    await waitFor(() => transport.commands.length === 1);
    expect(transport.commands).toEqual(['uci']);

    transport.emit('id name Fakefish 18', 'uciok');
    await waitFor(() => transport.commands.length === 2);
    expect(transport.commands).toEqual(['uci', 'isready']);

    transport.emit('info string booted', 'readyok');
    await waitFor(() => transport.commands.length === 4);
    expect(transport.commands).toEqual([
      'uci',
      'isready',
      `position fen ${fen}`,
      'go depth 10',
    ]);

    transport.emit('info depth 10 score cp 34 nodes 12345', 'bestmove e2e4');

    await expect(bestMovePromise).resolves.toEqual({
      difficulty: 'medium',
      fen,
      info: {
        depth: 10,
        score: {
          kind: 'cp',
          value: 34,
        },
      },
      move: 'e2e4',
    });
  });

  it('uses the most recently selected difficulty for a later engine request', async () => {
    const transport = new FakeUciTransport();
    const engine = createStockfishEngine({
      transportFactory: () => transport,
    });
    const firstFen = '8/8/8/8/8/8/8/4K2k w - - 0 1';
    const secondFen = '8/8/8/8/8/8/8/4K1k1 w - - 0 1';

    await engine.setDifficulty('easy');

    const firstBestMovePromise = engine.requestBestMove({ fen: firstFen });

    await waitFor(() => transport.commands.length === 1);
    transport.emit('uciok');
    await waitFor(() => transport.commands.length === 2);
    transport.emit('readyok');
    await waitFor(() => transport.commands.length === 4);

    expect(transport.commands.slice(-2)).toEqual([
      `position fen ${firstFen}`,
      'go depth 6',
    ]);

    transport.emit('bestmove e1e2');

    await expect(firstBestMovePromise).resolves.toMatchObject({
      difficulty: 'easy',
      fen: firstFen,
      move: 'e1e2',
    });

    await engine.setDifficulty('hard');

    const secondBestMovePromise = engine.requestBestMove({ fen: secondFen });

    await waitFor(() => transport.commands.length === 5);
    transport.emit('readyok');
    await waitFor(() => transport.commands.length === 7);

    expect(transport.commands.slice(-3)).toEqual([
      'isready',
      `position fen ${secondFen}`,
      'go depth 14',
    ]);

    transport.emit('bestmove e1f2');

    await expect(secondBestMovePromise).resolves.toMatchObject({
      difficulty: 'hard',
      fen: secondFen,
      move: 'e1f2',
    });
  });

  it('cancels a request before readiness completes without starting a search', async () => {
    const transport = new FakeUciTransport();
    const engine = createStockfishEngine({
      transportFactory: () => transport,
    });
    const fen = '8/8/8/8/8/8/8/8 w - - 0 1';

    const bestMovePromise = engine.requestBestMove({ fen });
    void bestMovePromise.catch(() => undefined);

    await waitFor(() => transport.commands.length === 1);
    expect(transport.commands).toEqual(['uci']);

    await expect(engine.cancelSearch()).resolves.toBeUndefined();

    await flushAsyncWork();

    expect(transport.commands).toContain('stop');
    expect(transport.commands).not.toContain(`position fen ${fen}`);
    expect(transport.commands).not.toContain('go depth 10');
    await expect(
      rejectsWithin(bestMovePromise, 100),
    ).resolves.toMatchObject({
      name: 'StockfishSearchCancelledError',
      reason: 'cancelled',
    });
  });

  it('exposes cancellation and disposal without throwing', async () => {
    const transport = new FakeUciTransport();
    const engine = createStockfishEngine({
      transportFactory: () => transport,
    });

    const bestMovePromise = engine.requestBestMove({
      fen: '8/8/8/8/8/8/8/8 w - - 0 1',
    });
    void bestMovePromise.catch(() => undefined);

    await waitFor(() => transport.commands.length === 1);
    transport.emit('uciok');
    await waitFor(() => transport.commands.length === 2);
    transport.emit('readyok');
    await waitFor(() => transport.commands.length === 4);

    await expect(engine.cancelSearch()).resolves.toBeUndefined();
    expect(transport.commands).toContain('stop');
    await expect(bestMovePromise).rejects.toMatchObject({
      name: 'StockfishSearchCancelledError',
      reason: 'cancelled',
    });

    await expect(engine.dispose()).resolves.toBeUndefined();
    expect(transport.terminated).toBe(true);
  });

  it('ignores a bestmove that arrives after cancellation', async () => {
    const transport = new FakeUciTransport();
    const engine = createStockfishEngine({
      transportFactory: () => transport,
    });
    const fen = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

    const bestMovePromise = engine.requestBestMove({ fen });
    void bestMovePromise.catch(() => undefined);

    await waitFor(() => transport.commands.length === 1);
    transport.emit('uciok');
    await waitFor(() => transport.commands.length === 2);
    transport.emit('readyok');
    await waitFor(() => transport.commands.length === 4);

    await expect(engine.cancelSearch()).resolves.toBeUndefined();
    expect(transport.commands).toContain('stop');
    await expect(bestMovePromise).rejects.toMatchObject({
      name: 'StockfishSearchCancelledError',
      reason: 'cancelled',
    });

    transport.emit('info depth 10 score cp 16', 'bestmove e2e4');
    await flushAsyncWork();

    expect(engine.state).toBe('ready');
  });

  it('rejects a malformed bestmove response instead of hanging the search', async () => {
    const transport = new FakeUciTransport();
    const engine = createStockfishEngine({
      transportFactory: () => transport,
    });
    const fen = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

    const bestMovePromise = engine.requestBestMove({ fen });

    await waitFor(() => transport.commands.length === 1);
    transport.emit('uciok');
    await waitFor(() => transport.commands.length === 2);
    transport.emit('readyok');
    await waitFor(() => transport.commands.length === 4);

    transport.emit('info depth 10 score cp 16', 'bestmove nope');

    await expect(bestMovePromise).rejects.toThrow(
      'Stockfish returned an invalid bestmove response.',
    );
    expect(engine.state).toBe('ready');
  });

  it('surfaces an engine boot failure with a stable error message', async () => {
    const transport: UciTransport = {
      send() {
        throw new Error('worker crashed');
      },
      onLine() {
        return () => {};
      },
      terminate() {},
    };
    const engine = createStockfishEngine({
      transportFactory: () => transport,
    });

    await expect(
      engine.requestBestMove({
        fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
      }),
    ).rejects.toThrow('Stockfish failed to initialize: worker crashed');
    expect(engine.state).toBe('idle');
  });

  it('times out if Stockfish never finishes the initial UCI handshake', async () => {
    const transport = new FakeUciTransport();
    const engine = createStockfishEngine({
      transportFactory: () => transport,
      timeoutMs: 25,
    });

    const bestMovePromise = engine.requestBestMove({
      fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
    });
    void bestMovePromise.catch(() => undefined);

    await waitFor(() => transport.commands.length === 1);
    expect(transport.commands).toEqual(['uci']);

    await expect(bestMovePromise).rejects.toThrow(
      'Stockfish failed to initialize: Timed out waiting for uciok.',
    );
    expect(engine.state).toBe('idle');
  });

  it('times out if Stockfish never returns a bestmove after search starts', async () => {
    const transport = new FakeUciTransport();
    const engine = createStockfishEngine({
      transportFactory: () => transport,
      timeoutMs: 25,
    });
    const fen = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

    const bestMovePromise = engine.requestBestMove({ fen });
    void bestMovePromise.catch(() => undefined);

    await waitFor(() => transport.commands.length === 1);
    transport.emit('uciok');
    await waitFor(() => transport.commands.length === 2);
    transport.emit('readyok');
    await waitFor(() => transport.commands.length === 4);

    expect(transport.commands.slice(-2)).toEqual([
      `position fen ${fen}`,
      'go depth 10',
    ]);

    await expect(bestMovePromise).rejects.toThrow(
      'Stockfish move request failed: Timed out waiting for bestmove.',
    );
    expect(engine.state).toBe('ready');
  });

  it('supports package engines that expose sendCommand and listener', async () => {
    const packageEngine = new FakeStockfishPackageEngine();
    const engine = createStockfishEngine({
      packageFactory: () => packageEngine,
    });
    const fen = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

    await engine.setDifficulty('hard');

    const bestMovePromise = engine.requestBestMove({ fen });

    await waitFor(() => packageEngine.commands.length === 1);
    expect(packageEngine.commands).toEqual(['uci']);

    packageEngine.emit('uciok');
    await waitFor(() => packageEngine.commands.length === 2);
    expect(packageEngine.commands).toEqual(['uci', 'isready']);

    packageEngine.emit('readyok');
    await waitFor(() => packageEngine.commands.length === 4);
    expect(packageEngine.commands).toEqual([
      'uci',
      'isready',
      `position fen ${fen}`,
      'go depth 14',
    ]);

    packageEngine.emit('info depth 14 score cp 52', 'bestmove e2e4');

    await expect(bestMovePromise).resolves.toEqual({
      difficulty: 'hard',
      fen,
      info: {
        depth: 14,
        score: {
          kind: 'cp',
          value: 52,
        },
      },
      move: 'e2e4',
    });

    await expect(engine.dispose()).resolves.toBeUndefined();
    expect(packageEngine.quitCalled).toBe(true);
  });

  it('creates a browser Stockfish engine through the worker-based production factory', async () => {
    const worker = new FakeStockfishWorker();
    const engine = createBrowserStockfishEngine({
      workerFactory: () => worker,
    });
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';

    const bestMovePromise = engine.requestBestMove({ fen });

    await waitFor(() => worker.commands.length === 1);
    expect(worker.commands).toEqual(['uci']);

    worker.emit('uciok');
    await waitFor(() => worker.commands.length === 2);
    expect(worker.commands).toEqual(['uci', 'isready']);

    worker.emit('readyok');
    await waitFor(() => worker.commands.length === 4);
    expect(worker.commands).toEqual([
      'uci',
      'isready',
      `position fen ${fen}`,
      'go depth 10',
    ]);

    worker.emit('info depth 10 score cp 16', 'bestmove f1b5');

    await expect(bestMovePromise).resolves.toEqual({
      difficulty: 'medium',
      fen,
      info: {
        depth: 10,
        score: {
          kind: 'cp',
          value: 16,
        },
      },
      move: 'f1b5',
    });

    await expect(engine.dispose()).resolves.toBeUndefined();
    expect(worker.terminated).toBe(true);
  });
});

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 100,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for async engine work to settle.');
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

async function rejectsWithin<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<unknown> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise.then(
        () => Promise.reject(new Error('Expected promise to reject.')),
        (error) => error,
      ),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error('Timed out waiting for promise rejection.'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
