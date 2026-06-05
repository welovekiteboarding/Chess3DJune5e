import {
  isBestMoveLine,
  isReadyOkLine,
  isUciOkLine,
  parseBestMoveLine,
  parseInfoLine,
} from './stockfishProtocol';

describe('stockfishProtocol', () => {
  it('detects uciok lines', () => {
    expect(isUciOkLine('uciok')).toBe(true);
    expect(isUciOkLine('  uciok  ')).toBe(true);
    expect(isUciOkLine('readyok')).toBe(false);
  });

  it('detects readyok lines', () => {
    expect(isReadyOkLine('readyok')).toBe(true);
    expect(isReadyOkLine('\treadyok')).toBe(true);
    expect(isReadyOkLine('uciok')).toBe(false);
  });

  it('extracts a standard bestmove', () => {
    expect(parseBestMoveLine('bestmove e2e4')).toEqual({
      move: 'e2e4',
    });
  });

  it('extracts a promotion bestmove', () => {
    expect(parseBestMoveLine('bestmove e7e8q')).toEqual({
      move: 'e7e8q',
    });
  });

  it('detects bestmove lines even when the move payload is malformed', () => {
    expect(isBestMoveLine('bestmove e2e4')).toBe(true);
    expect(isBestMoveLine('bestmove nope')).toBe(true);
    expect(isBestMoveLine('info depth 10')).toBe(false);
  });

  it('extracts an info depth and score when present', () => {
    expect(
      parseInfoLine('info depth 18 seldepth 25 score cp 34 nodes 12345'),
    ).toEqual({
      depth: 18,
      score: {
        kind: 'cp',
        value: 34,
      },
    });
  });

  it('handles malformed bestmove lines without throwing', () => {
    expect(() => parseBestMoveLine('bestmove')).not.toThrow();
    expect(parseBestMoveLine('bestmove')).toBeNull();
    expect(parseBestMoveLine('bestmove e2e9')).toBeNull();
  });

  it('ignores unrelated output safely', () => {
    expect(isUciOkLine('id name Stockfish 17')).toBe(false);
    expect(isReadyOkLine('id name Stockfish 17')).toBe(false);
    expect(parseBestMoveLine('id name Stockfish 17')).toBeNull();
    expect(parseInfoLine('id name Stockfish 17')).toBeNull();
  });
});
