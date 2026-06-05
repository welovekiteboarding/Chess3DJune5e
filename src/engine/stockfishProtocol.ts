export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

type FileChar = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';
type RankChar = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';

export type Square = `${FileChar}${RankChar}`;
export type UciMove = `${Square}${Square}` | `${Square}${Square}${PromotionPiece}`;

export interface ParsedBestMove {
  move: UciMove;
  ponder?: UciMove;
}

export type ParsedScore =
  | {
      kind: 'cp';
      value: number;
    }
  | {
      kind: 'mate';
      value: number;
    };

export interface ParsedInfo {
  depth?: number;
  score?: ParsedScore;
}

const UCI_MOVE_PATTERN = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

export function isUciOkLine(line: string): boolean {
  return line.trim() === 'uciok';
}

export function isReadyOkLine(line: string): boolean {
  return line.trim() === 'readyok';
}

export function parseBestMoveLine(line: string): ParsedBestMove | null {
  const tokens = tokenize(line);

  if (tokens[0] !== 'bestmove') {
    return null;
  }

  const move = parseUciMove(tokens[1]);

  if (!move) {
    return null;
  }

  const ponder =
    tokens[2] === 'ponder' ? parseUciMove(tokens[3]) : undefined;

  return ponder ? { move, ponder } : { move };
}

export function parseInfoLine(line: string): ParsedInfo | null {
  const tokens = tokenize(line);

  if (tokens[0] !== 'info') {
    return null;
  }

  const parsedInfo: ParsedInfo = {};
  const depthIndex = tokens.indexOf('depth');

  if (depthIndex >= 0) {
    const depth = parseInteger(tokens[depthIndex + 1]);

    if (depth !== null) {
      parsedInfo.depth = depth;
    }
  }

  const scoreIndex = tokens.indexOf('score');

  if (scoreIndex >= 0) {
    const scoreKind = tokens[scoreIndex + 1];
    const scoreValue = parseInteger(tokens[scoreIndex + 2]);

    if (
      (scoreKind === 'cp' || scoreKind === 'mate') &&
      scoreValue !== null
    ) {
      parsedInfo.score = {
        kind: scoreKind,
        value: scoreValue,
      };
    }
  }

  return hasParsedInfo(parsedInfo) ? parsedInfo : null;
}

function tokenize(line: string): string[] {
  const trimmed = line.trim();

  return trimmed === '' ? [] : trimmed.split(/\s+/);
}

function parseUciMove(value: string | undefined): UciMove | null {
  if (!value) {
    return null;
  }

  return UCI_MOVE_PATTERN.test(value) ? (value as UciMove) : null;
}

function parseInteger(value: string | undefined): number | null {
  if (!value || !/^-?\d+$/.test(value)) {
    return null;
  }

  return Number.parseInt(value, 10);
}

function hasParsedInfo(parsedInfo: ParsedInfo): boolean {
  return parsedInfo.depth !== undefined || parsedInfo.score !== undefined;
}
