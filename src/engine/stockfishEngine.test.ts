import { createStockfishEngine } from './stockfishEngine';
import type { UciTransport } from './stockfishEngine';

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

describe('stockfishEngine', () => {
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

    transport.emit('uciok');
    await waitFor(() => transport.commands.includes('isready'));
    transport.emit('readyok');
    await flushAsyncWork();

    expect(transport.commands).toContain('isready');
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
