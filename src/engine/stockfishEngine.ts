import type {
  AiDifficulty,
  AsyncEngineAdapter,
  BestMoveRequest,
  BestMoveResponse,
  EngineCancellationReason,
  EngineLifecycleState,
} from './engineTypes';
import {
  isReadyOkLine,
  isUciOkLine,
  parseBestMoveLine,
  parseInfoLine,
  type ParsedInfo,
} from './stockfishProtocol';

const GO_COMMAND_BY_DIFFICULTY: Record<AiDifficulty, string> = {
  easy: 'go depth 6',
  medium: 'go depth 10',
  hard: 'go depth 14',
};

type LineListener = (line: string) => void;

export interface UciTransport {
  send(command: string): void | Promise<void>;
  onLine(listener: LineListener): () => void;
  terminate(): void | Promise<void>;
}

export interface StockfishWorkerLike {
  addEventListener?: (
    type: 'message',
    listener: (event: unknown) => void,
  ) => void;
  onmessage?: ((event: unknown) => void) | null;
  postMessage(message: string): void;
  removeEventListener?: (
    type: 'message',
    listener: (event: unknown) => void,
  ) => void;
  terminate(): void | Promise<void>;
}

export interface StockfishPackageEngineLike {
  addEventListener?: (
    type: 'message',
    listener: (event: unknown) => void,
  ) => void;
  onmessage?: ((event: unknown) => void) | null;
  postMessage?: (message: string) => void;
  quit?: () => void | Promise<void>;
  removeEventListener?: (
    type: 'message',
    listener: (event: unknown) => void,
  ) => void;
  sendCommand?: (command: string) => void;
  terminate?: () => void | Promise<void>;
}

export type StockfishTransportFactory = () =>
  | UciTransport
  | Promise<UciTransport>;

export type StockfishWorkerFactory = () =>
  | StockfishWorkerLike
  | Promise<StockfishWorkerLike>;

export type StockfishPackageFactory = () =>
  | StockfishPackageEngineLike
  | Promise<StockfishPackageEngineLike>;

export interface StockfishEngineOptions {
  difficulty?: AiDifficulty;
  packageFactory?: StockfishPackageFactory;
  transportFactory?: StockfishTransportFactory;
  workerFactory?: StockfishWorkerFactory;
}

interface LineWaiter {
  matches: (line: string) => boolean;
  reject: (error: unknown) => void;
  resolve: (line: string) => void;
}

interface PendingSearch {
  difficulty: AiDifficulty;
  info?: ParsedInfo;
  reject: (error: unknown) => void;
  request: BestMoveRequest;
  resolve: (response: BestMoveResponse) => void;
}

export class StockfishSearchCancelledError extends Error {
  readonly reason: EngineCancellationReason;

  constructor(reason: EngineCancellationReason) {
    super(
      reason === 'disposed'
        ? 'Stockfish search disposed.'
        : 'Stockfish search cancelled.',
    );
    this.name = 'StockfishSearchCancelledError';
    this.reason = reason;
  }
}

export class StockfishEngine implements AsyncEngineAdapter {
  private difficulty: AiDifficulty;
  private initialized = false;
  private lineWaiters: LineWaiter[] = [];
  private pendingSearch: PendingSearch | null = null;
  private stateValue: EngineLifecycleState = 'idle';
  private transportPromise: Promise<UciTransport> | null = null;
  private unsubscribeFromLines: (() => void) | null = null;

  constructor(private readonly options: StockfishEngineOptions = {}) {
    this.difficulty = options.difficulty ?? 'medium';
  }

  get state(): EngineLifecycleState {
    return this.stateValue;
  }

  async setDifficulty(difficulty: AiDifficulty): Promise<void> {
    this.assertUsable();
    this.difficulty = difficulty;
  }

  async requestBestMove(
    request: BestMoveRequest,
  ): Promise<BestMoveResponse> {
    this.assertUsable();

    if (this.pendingSearch) {
      throw new Error('A Stockfish search is already in progress.');
    }

    await this.ensureReady();
    const transport = await this.getTransport();

    this.stateValue = 'searching';

    return new Promise<BestMoveResponse>((resolve, reject) => {
      this.pendingSearch = {
        difficulty: this.difficulty,
        reject,
        request,
        resolve,
      };

      void this.sendBestMoveCommands(transport, request);
    });
  }

  async cancelSearch(
    reason: EngineCancellationReason = 'cancelled',
  ): Promise<void> {
    const pendingSearch = this.pendingSearch;

    if (!pendingSearch) {
      return;
    }

    this.pendingSearch = null;

    const transport = await this.getTransport().catch(() => null);

    if (transport) {
      await Promise.resolve(transport.send('stop')).catch(() => undefined);
    }

    pendingSearch.reject(new StockfishSearchCancelledError(reason));

    if (!this.isDisposed()) {
      this.stateValue = this.initialized ? 'ready' : 'idle';
    }
  }

  async dispose(): Promise<void> {
    if (this.stateValue === 'disposed') {
      return;
    }

    this.stateValue = 'disposed';
    this.rejectLineWaiters(new StockfishSearchCancelledError('disposed'));

    const pendingSearch = this.pendingSearch;
    this.pendingSearch = null;

    const transport = await this.transportPromise?.catch(() => null);

    if (transport && pendingSearch) {
      await Promise.resolve(transport.send('stop')).catch(() => undefined);
    }

    pendingSearch?.reject(new StockfishSearchCancelledError('disposed'));
    this.unsubscribeFromLines?.();
    this.unsubscribeFromLines = null;

    if (transport) {
      await Promise.resolve(transport.terminate()).catch(() => undefined);
    }
  }

  private assertUsable(): void {
    if (this.stateValue === 'disposed') {
      throw new Error('The Stockfish engine has been disposed.');
    }
  }

  private async ensureReady(): Promise<void> {
    this.assertUsable();

    const transport = await this.getTransport();
    this.stateValue = 'initializing';

    if (!this.initialized) {
      const uciOk = this.waitForLine(isUciOkLine);

      await Promise.resolve(transport.send('uci'));
      await uciOk;

      this.initialized = true;
    }

    const readyOk = this.waitForLine(isReadyOkLine);

    await Promise.resolve(transport.send('isready'));
    await readyOk;

    if (!this.isDisposed() && !this.pendingSearch) {
      this.stateValue = 'ready';
    }
  }

  private async sendBestMoveCommands(
    transport: UciTransport,
    request: BestMoveRequest,
  ): Promise<void> {
    try {
      await Promise.resolve(transport.send(`position fen ${request.fen}`));
      await Promise.resolve(
        transport.send(getGoCommandForDifficulty(this.difficulty)),
      );
    } catch (error) {
      this.finishSearchWithError(error);
    }
  }

  private finishSearchWithError(error: unknown): void {
    const pendingSearch = this.pendingSearch;

    this.pendingSearch = null;

    if (!this.isDisposed()) {
      this.stateValue = this.initialized ? 'ready' : 'idle';
    }

    pendingSearch?.reject(error);
  }

  private async getTransport(): Promise<UciTransport> {
    if (!this.transportPromise) {
      this.transportPromise = Promise.resolve(
        resolveTransportFactory(this.options)(),
      ).then((transport) => {
        this.unsubscribeFromLines = transport.onLine((line) => {
          this.handleLine(line);
        });

        return transport;
      });
    }

    return this.transportPromise;
  }

  private handleLine(line: string): void {
    for (const waiter of [...this.lineWaiters]) {
      if (!waiter.matches(line)) {
        continue;
      }

      this.lineWaiters = this.lineWaiters.filter((item) => item !== waiter);
      waiter.resolve(line);
      break;
    }

    if (!this.pendingSearch) {
      return;
    }

    const parsedInfo = parseInfoLine(line);

    if (parsedInfo) {
      this.pendingSearch.info = mergeParsedInfo(
        this.pendingSearch.info,
        parsedInfo,
      );
    }

    const parsedBestMove = parseBestMoveLine(line);

    if (!parsedBestMove) {
      return;
    }

    const pendingSearch = this.pendingSearch;

    this.pendingSearch = null;

    if (!this.isDisposed()) {
      this.stateValue = 'ready';
    }

    pendingSearch.resolve({
      ...parsedBestMove,
      difficulty: pendingSearch.difficulty,
      fen: pendingSearch.request.fen,
      ...(pendingSearch.info ? { info: pendingSearch.info } : {}),
    });
  }

  private rejectLineWaiters(error: unknown): void {
    const lineWaiters = this.lineWaiters;

    this.lineWaiters = [];

    for (const waiter of lineWaiters) {
      waiter.reject(error);
    }
  }

  private waitForLine(matches: (line: string) => boolean): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.lineWaiters.push({
        matches,
        reject,
        resolve,
      });
    });
  }

  private isDisposed(): boolean {
    return this.stateValue === 'disposed';
  }
}

export function createStockfishEngine(
  options: StockfishEngineOptions = {},
): AsyncEngineAdapter {
  return new StockfishEngine(options);
}

export function createStockfishTransportFromWorker(
  worker: StockfishWorkerLike,
): UciTransport {
  return createTransport({
    attachListener: (listener) => attachMessageListener(worker, listener),
    send: (command) => {
      worker.postMessage(command);
    },
    terminate: () => worker.terminate(),
  });
}

export async function createStockfishTransportFromPackage(
  factory: StockfishPackageFactory,
): Promise<UciTransport> {
  const engine = await Promise.resolve(factory());
  const send = engine.sendCommand ?? engine.postMessage;

  if (!send) {
    throw new Error('The Stockfish package engine must expose a send method.');
  }

  return createTransport({
    attachListener: (listener) => attachMessageListener(engine, listener),
    send: (command) => {
      send.call(engine, command);
    },
    terminate: () => {
      if (engine.terminate) {
        return engine.terminate();
      }

      return engine.quit?.();
    },
  });
}

export function getGoCommandForDifficulty(difficulty: AiDifficulty): string {
  return GO_COMMAND_BY_DIFFICULTY[difficulty];
}

function attachMessageListener(
  target: {
    addEventListener?: (
      type: 'message',
      listener: (event: unknown) => void,
    ) => void;
    onmessage?: ((event: unknown) => void) | null;
    removeEventListener?: (
      type: 'message',
      listener: (event: unknown) => void,
    ) => void;
  },
  listener: LineListener,
): () => void {
  const handler = (event: unknown) => {
    for (const line of normalizeLines(event)) {
      listener(line);
    }
  };

  if (target.addEventListener && target.removeEventListener) {
    target.addEventListener('message', handler);

    return () => {
      target.removeEventListener?.('message', handler);
    };
  }

  const previousHandler = target.onmessage ?? null;
  const assignedHandler = (event: unknown) => {
    previousHandler?.(event);
    handler(event);
  };

  target.onmessage = assignedHandler;

  return () => {
    if (target.onmessage === assignedHandler) {
      target.onmessage = previousHandler;
    }
  };
}

function createTransport(options: {
  attachListener: (listener: LineListener) => () => void;
  send: (command: string) => void | Promise<void>;
  terminate: () => void | Promise<void>;
}): UciTransport {
  return {
    onLine: options.attachListener,
    send: options.send,
    terminate: options.terminate,
  };
}

function mergeParsedInfo(
  existingInfo: ParsedInfo | undefined,
  nextInfo: ParsedInfo,
): ParsedInfo {
  return {
    ...existingInfo,
    ...nextInfo,
  };
}

function normalizeLines(event: unknown): string[] {
  const rawValue = extractMessageData(event);

  if (typeof rawValue !== 'string') {
    return [];
  }

  return rawValue
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function extractMessageData(event: unknown): unknown {
  if (
    typeof event === 'object' &&
    event !== null &&
    'data' in event &&
    typeof event.data !== 'undefined'
  ) {
    return event.data;
  }

  return event;
}

function resolveTransportFactory(
  options: StockfishEngineOptions,
): StockfishTransportFactory {
  if (options.transportFactory) {
    return options.transportFactory;
  }

  if (options.packageFactory) {
    const { packageFactory } = options;

    return () => createStockfishTransportFromPackage(packageFactory);
  }

  if (options.workerFactory) {
    const { workerFactory } = options;

    return async () =>
      createStockfishTransportFromWorker(
        await Promise.resolve(workerFactory()),
      );
  }

  return () => {
    throw new Error(
      'Configure a Stockfish transport, worker factory, or package factory.',
    );
  };
}
