import type {
  AiDifficulty,
  AsyncEngineAdapter,
  BestMoveRequest,
  BestMoveResponse,
  EngineCancellationReason,
  EngineLifecycleState,
  StockfishSearchSettings,
} from './engineTypes';
import { STOCKFISH_SEARCH_SETTINGS_BY_DIFFICULTY } from './engineTypes';
import {
  isBestMoveLine,
  isReadyOkLine,
  isUciOkLine,
  parseBestMoveLine,
  parseInfoLine,
  type ParsedInfo,
} from './stockfishProtocol';
import stockfishWorkerUrl from 'stockfish/bin/stockfish-18-asm.js?url';

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
  listener?: ((line: string) => void) | null;
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
  timeoutMs?: number;
  transportFactory?: StockfishTransportFactory;
  workerFactory?: StockfishWorkerFactory;
}

export type BrowserStockfishEngineOptions = Omit<
  StockfishEngineOptions,
  'packageFactory' | 'transportFactory'
>;

interface LineWaiter {
  matches: (line: string) => boolean;
  reject: (error: unknown) => void;
  resolve: (line: string) => void;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
}

interface PendingSearch {
  difficulty: AiDifficulty;
  info?: ParsedInfo;
  reject: (error: unknown) => void;
  request: BestMoveRequest;
  resolve: (response: BestMoveResponse) => void;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
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

const STOCKFISH_BOOT_ERROR_PREFIX = 'Stockfish failed to initialize';
const STOCKFISH_REQUEST_ERROR_PREFIX = 'Stockfish move request failed';
const STOCKFISH_INVALID_BESTMOVE_ERROR =
  'Stockfish returned an invalid bestmove response.';
const DEFAULT_ENGINE_TIMEOUT_MS = 5_000;

export class StockfishEngine implements AsyncEngineAdapter {
  private difficulty: AiDifficulty;
  private initialized = false;
  private lineWaiters: LineWaiter[] = [];
  private pendingSearch: PendingSearch | null = null;
  private stateValue: EngineLifecycleState = 'idle';
  private readonly timeoutMs: number;
  private transportPromise: Promise<UciTransport> | null = null;
  private unsubscribeFromLines: (() => void) | null = null;

  constructor(private readonly options: StockfishEngineOptions = {}) {
    this.difficulty = options.difficulty ?? 'medium';
    this.timeoutMs = normalizeTimeoutMs(options.timeoutMs);
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

    return new Promise<BestMoveResponse>((resolve, reject) => {
      const pendingSearch: PendingSearch = {
        difficulty: this.difficulty,
        reject,
        request,
        resolve,
        timeoutHandle: null,
      };

      this.pendingSearch = pendingSearch;
      void this.runBestMoveRequest(pendingSearch);
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
    this.clearPendingSearchTimeout(pendingSearch);
    this.rejectLineWaiters(new StockfishSearchCancelledError(reason));
    pendingSearch.reject(new StockfishSearchCancelledError(reason));

    if (!this.isDisposed()) {
      this.stateValue = this.initialized ? 'ready' : 'idle';
    }

    const transport = await this.getTransport().catch(() => null);

    if (transport) {
      await Promise.resolve(transport.send('stop')).catch(() => undefined);
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
    this.clearPendingSearchTimeout(pendingSearch);
    pendingSearch?.reject(new StockfishSearchCancelledError('disposed'));

    const transport = await this.transportPromise?.catch(() => null);

    if (transport && pendingSearch) {
      await Promise.resolve(transport.send('stop')).catch(() => undefined);
    }
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
      const uciOk = this.waitForLine(isUciOkLine, 'uciok');

      await Promise.resolve(transport.send('uci'));
      await uciOk;
      this.assertUsable();

      this.initialized = true;
    }

    const readyOk = this.waitForLine(isReadyOkLine, 'readyok');

    await Promise.resolve(transport.send('isready'));
    await readyOk;
    this.assertUsable();

    if (!this.isDisposed() && !this.pendingSearch) {
      this.stateValue = 'ready';
    }
  }

  private async runBestMoveRequest(
    pendingSearch: PendingSearch,
  ): Promise<void> {
    try {
      await this.ensureReady().catch((error) => {
        throw toStockfishFailure(error, STOCKFISH_BOOT_ERROR_PREFIX);
      });

      const transport = await this.getTransport().catch((error) => {
        throw toStockfishFailure(error, STOCKFISH_BOOT_ERROR_PREFIX);
      });

      this.assertSearchIsActive(pendingSearch);
      this.stateValue = 'searching';

      await this.sendCommandForActiveSearch(
        pendingSearch,
        transport,
        `position fen ${pendingSearch.request.fen}`,
      ).catch((error) => {
        throw toStockfishFailure(error, STOCKFISH_REQUEST_ERROR_PREFIX);
      });
      await this.sendCommandForActiveSearch(
        pendingSearch,
        transport,
        getGoCommandForDifficulty(pendingSearch.difficulty),
      ).catch((error) => {
        throw toStockfishFailure(error, STOCKFISH_REQUEST_ERROR_PREFIX);
      });
      this.startBestMoveTimeout(pendingSearch, transport);
    } catch (error) {
      this.finishSearchWithError(pendingSearch, error);
    }
  }

  private async sendCommandForActiveSearch(
    pendingSearch: PendingSearch,
    transport: UciTransport,
    command: string,
  ): Promise<void> {
    this.assertSearchIsActive(pendingSearch);
    await Promise.resolve(transport.send(command));
    this.assertSearchIsActive(pendingSearch);
  }

  private finishSearchWithError(
    pendingSearch: PendingSearch,
    error: unknown,
  ): void {
    if (this.pendingSearch !== pendingSearch) {
      return;
    }

    this.pendingSearch = null;
    this.clearPendingSearchTimeout(pendingSearch);

    if (!this.isDisposed()) {
      this.stateValue = this.initialized ? 'ready' : 'idle';
    }

    pendingSearch.reject(error);
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

    if (!isBestMoveLine(line)) {
      return;
    }

    const pendingSearch = this.pendingSearch;
    const parsedBestMove = parseBestMoveLine(line);

    if (!parsedBestMove) {
      this.finishSearchWithError(
        pendingSearch,
        new Error(STOCKFISH_INVALID_BESTMOVE_ERROR),
      );
      return;
    }

    this.pendingSearch = null;
    this.clearPendingSearchTimeout(pendingSearch);

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

  private waitForLine(
    matches: (line: string) => boolean,
    label: string,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const waiter: LineWaiter = {
        matches,
        reject: (error) => {
          this.removeLineWaiter(waiter);
          reject(error);
        },
        resolve: (line) => {
          this.removeLineWaiter(waiter);
          resolve(line);
        },
        timeoutHandle: null,
      };

      waiter.timeoutHandle = setTimeout(() => {
        waiter.reject(new Error(`Timed out waiting for ${label}.`));
      }, this.timeoutMs);

      this.lineWaiters.push(waiter);
    });
  }

  private removeLineWaiter(waiter: LineWaiter): void {
    this.lineWaiters = this.lineWaiters.filter((item) => item !== waiter);

    if (waiter.timeoutHandle !== null) {
      clearTimeout(waiter.timeoutHandle);
      waiter.timeoutHandle = null;
    }
  }

  private startBestMoveTimeout(
    pendingSearch: PendingSearch,
    transport: UciTransport,
  ): void {
    this.clearPendingSearchTimeout(pendingSearch);

    pendingSearch.timeoutHandle = setTimeout(() => {
      if (this.pendingSearch !== pendingSearch) {
        return;
      }

      void Promise.resolve(transport.send('stop')).catch(() => undefined);
      this.finishSearchWithError(
        pendingSearch,
        toStockfishFailure(
          new Error('Timed out waiting for bestmove.'),
          STOCKFISH_REQUEST_ERROR_PREFIX,
        ),
      );
    }, this.timeoutMs);
  }

  private clearPendingSearchTimeout(
    pendingSearch: PendingSearch | null,
  ): void {
    if (!pendingSearch || pendingSearch.timeoutHandle === null) {
      return;
    }

    clearTimeout(pendingSearch.timeoutHandle);
    pendingSearch.timeoutHandle = null;
  }

  private isDisposed(): boolean {
    return this.stateValue === 'disposed';
  }

  private assertSearchIsActive(pendingSearch: PendingSearch): void {
    if (this.pendingSearch !== pendingSearch) {
      throw new StockfishSearchCancelledError(
        this.isDisposed() ? 'disposed' : 'cancelled',
      );
    }

    this.assertUsable();
  }
}

export function createStockfishEngine(
  options: StockfishEngineOptions = {},
): AsyncEngineAdapter {
  return new StockfishEngine(options);
}

export function createBrowserStockfishEngine(
  options: BrowserStockfishEngineOptions = {},
): AsyncEngineAdapter {
  return createStockfishEngine({
    ...options,
    workerFactory: options.workerFactory ?? createBrowserStockfishWorker,
  });
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
  const attachListener =
    typeof engine.sendCommand === 'function' || 'listener' in engine
      ? (listener: LineListener) => attachLineListenerProperty(engine, listener)
      : (listener: LineListener) => attachMessageListener(engine, listener);

  if (!send) {
    throw new Error('The Stockfish package engine must expose a send method.');
  }

  return createTransport({
    attachListener,
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
  const settings = getSearchSettingsForDifficulty(difficulty);
  return `go depth ${settings.depth}`;
}

export function getSearchSettingsForDifficulty(
  difficulty: AiDifficulty,
): StockfishSearchSettings {
  return STOCKFISH_SEARCH_SETTINGS_BY_DIFFICULTY[difficulty];
}

function createBrowserStockfishWorker(): StockfishWorkerLike {
  return new Worker(stockfishWorkerUrl, {
    name: 'stockfish-engine',
    type: 'classic',
  }) as StockfishWorkerLike;
}

function normalizeTimeoutMs(timeoutMs: number | undefined): number {
  if (
    typeof timeoutMs === 'number' &&
    Number.isFinite(timeoutMs) &&
    timeoutMs > 0
  ) {
    return timeoutMs;
  }

  return DEFAULT_ENGINE_TIMEOUT_MS;
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

function toStockfishFailure(error: unknown, prefix: string): unknown {
  if (error instanceof StockfishSearchCancelledError) {
    return error;
  }

  const detail = error instanceof Error ? error.message : null;

  return new Error(detail ? `${prefix}: ${detail}` : prefix);
}

function attachLineListenerProperty(
  target: {
    listener?: ((line: string) => void) | null;
  },
  listener: LineListener,
): () => void {
  const previousListener = target.listener ?? null;
  const assignedListener = (line: string) => {
    previousListener?.(line);

    for (const normalizedLine of normalizeLines(line)) {
      listener(normalizedLine);
    }
  };

  target.listener = assignedListener;

  return () => {
    if (target.listener === assignedListener) {
      target.listener = previousListener;
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
