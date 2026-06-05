import { Canvas } from '@react-three/fiber';
import type { ComponentType, PropsWithChildren } from 'react';

import type { ChessPiecePlacement, ChessSquare } from '../chess/chessTypes';

export interface BoardSceneCanvasProps extends PropsWithChildren {
  className?: string;
}

export interface BoardSceneProps {
  selectedSquare: ChessSquare | null;
  legalDestinationSquares: readonly ChessSquare[];
  piecePlacements?: readonly ChessPiecePlacement[];
  onSquareSelect?: (square: ChessSquare) => void;
  CanvasBoundary?: ComponentType<BoardSceneCanvasProps>;
  className?: string;
}

interface BoardSquareDefinition {
  square: ChessSquare;
  fileIndex: number;
  rankIndex: number;
  isDark: boolean;
}

const boardSquares = createBoardSquares();
const squareSize = 1;
const boardHalfSpan = 3.5;
const fallbackOnlyStyle = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

function DefaultBoardSceneCanvas({
  children,
  className,
}: BoardSceneCanvasProps) {
  return (
    <Canvas
      camera={{ position: [0, 7.5, 6.5], fov: 42 }}
      className={className}
      shadows
    >
      {children}
    </Canvas>
  );
}

export function BoardScene({
  selectedSquare,
  legalDestinationSquares,
  piecePlacements = [],
  onSquareSelect,
  CanvasBoundary = DefaultBoardSceneCanvas,
  className,
}: BoardSceneProps) {
  const legalDestinationSet = new Set(legalDestinationSquares);
  const legalDestinationMarkers = Array.from(legalDestinationSet);

  return (
    <section aria-label="3D chess board scene" className={className}>
      <CanvasBoundary className={className}>
        <color args={['#e8ecf4']} attach="background" />
        <ambientLight intensity={0.8} />
        <directionalLight
          castShadow
          intensity={1.1}
          position={[6, 10, 8]}
          shadow-mapSize-height={1024}
          shadow-mapSize-width={1024}
        />
        <group rotation={[-0.72, 0, 0]}>
          <mesh position={[0, -0.12, 0]} receiveShadow>
            <boxGeometry args={[8.8, 0.2, 8.8]} />
            <meshStandardMaterial color="#3b2f2a" />
          </mesh>
          {boardSquares.map((boardSquare) => {
            const materialColor = getSquareColor({
              boardSquare,
              legalDestinationSet,
              selectedSquare,
            });
            const [x, z] = getSquarePosition(boardSquare);

            return (
              <mesh
                castShadow
                key={boardSquare.square}
                onClick={() => onSquareSelect?.(boardSquare.square)}
                position={[x, 0, z]}
                receiveShadow
              >
                <boxGeometry args={[squareSize, 0.18, squareSize]} />
                <meshStandardMaterial color={materialColor} />
              </mesh>
            );
          })}
          {piecePlacements.map((piecePlacement) => {
            const position = getPiecePosition(piecePlacement.square);

            return (
              <group key={piecePlacement.renderId}>
                <mesh
                  castShadow
                  onClick={() => onSquareSelect?.(piecePlacement.square)}
                  position={position}
                >
                  <cylinderGeometry args={[0.22, 0.3, 0.45, 24]} />
                  <meshStandardMaterial
                    color={piecePlacement.color === 'white' ? '#f8f4e8' : '#1d2430'}
                  />
                </mesh>
                <mesh castShadow position={[position[0], position[1] + 0.3, position[2]]}>
                  <sphereGeometry args={[0.16, 20, 20]} />
                  <meshStandardMaterial
                    color={piecePlacement.color === 'white' ? '#ded3bc' : '#384152'}
                  />
                </mesh>
              </group>
            );
          })}
        </group>
      </CanvasBoundary>

      <div style={fallbackOnlyStyle}>
        <div aria-label="Chess board squares" role="grid">
          {boardSquares.map((boardSquare) => {
            const piecePlacement = piecePlacements.find(
              (entry) => entry.square === boardSquare.square,
            );
            const isSelected = boardSquare.square === selectedSquare;
            const isLegalDestination = legalDestinationSet.has(boardSquare.square);
            const pieceDescription = piecePlacement
              ? `${piecePlacement.color} ${piecePlacement.piece}`
              : 'empty';

            return (
              <button
                aria-label={`${boardSquare.square} square`}
                aria-pressed={isSelected}
                data-legal-destination={String(isLegalDestination)}
                data-piece={pieceDescription}
                data-selected={String(isSelected)}
                data-square={boardSquare.square}
                data-testid={`board-square-${boardSquare.square}`}
                key={boardSquare.square}
                onClick={() => onSquareSelect?.(boardSquare.square)}
                type="button"
              >
                {boardSquare.square}
              </button>
            );
          })}
        </div>
        <ul aria-label="Legal destination squares">
          {legalDestinationMarkers.map((square) => (
            <li
              data-square={square}
              data-testid={`legal-destination-square-${square}`}
              key={square}
            >
              {square}
            </li>
          ))}
        </ul>
        <ul aria-label="Piece placements">
          {piecePlacements.map((piecePlacement) => (
            <li
              data-color={piecePlacement.color}
              data-piece={piecePlacement.piece}
              data-render-id={piecePlacement.renderId}
              data-square={piecePlacement.square}
              data-testid="board-piece"
              key={piecePlacement.renderId}
            >
              <span
                data-square={piecePlacement.square}
                data-testid={`board-piece-${piecePlacement.renderId}`}
              >
                {piecePlacement.color} {piecePlacement.piece} on {piecePlacement.square}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function createBoardSquares(): BoardSquareDefinition[] {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

  return ranks.flatMap((rank, rankIndex) =>
    files.map((file, fileIndex) => ({
      square: `${file}${rank}` as ChessSquare,
      fileIndex,
      rankIndex,
      isDark: (fileIndex + rankIndex) % 2 === 1,
    })),
  );
}

function getSquarePosition(boardSquare: BoardSquareDefinition): [number, number] {
  return [
    boardSquare.fileIndex - boardHalfSpan,
    boardSquare.rankIndex - boardHalfSpan,
  ];
}

function getPiecePosition(square: ChessSquare): [number, number, number] {
  const boardSquare = boardSquares.find((entry) => entry.square === square);

  if (!boardSquare) {
    return [0, 0.35, 0];
  }

  const [x, z] = getSquarePosition(boardSquare);
  return [x, 0.35, z];
}

function getSquareColor({
  boardSquare,
  legalDestinationSet,
  selectedSquare,
}: {
  boardSquare: BoardSquareDefinition;
  legalDestinationSet: ReadonlySet<ChessSquare>;
  selectedSquare: ChessSquare | null;
}) {
  if (boardSquare.square === selectedSquare) {
    return '#d7a83f';
  }

  if (legalDestinationSet.has(boardSquare.square)) {
    return '#79b46a';
  }

  return boardSquare.isDark ? '#7a5a46' : '#efe6d6';
}
