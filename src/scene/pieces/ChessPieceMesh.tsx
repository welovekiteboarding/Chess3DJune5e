import type { ThreeEvent } from '@react-three/fiber';

import type {
  ChessPiece,
  ChessPiecePlacement,
  ChessSquare,
} from '../../chess/chessTypes';
import {
  getPieceAccessibleLabel,
  pieceBaseContactLocalY,
} from './pieceMetadata';

interface ChessPieceMeshProps {
  onSelect?: (square: ChessSquare) => void;
  piecePlacement: ChessPiecePlacement;
  position: readonly [number, number, number];
}

interface PiecePalette {
  accent: string;
  body: string;
  trim: string;
}

type PiecePosition = readonly [number, number, number];

const piecePaletteByColor = {
  white: {
    accent: '#7c5b34',
    body: '#f7f2e3',
    trim: '#d9c39a',
  },
  black: {
    accent: '#d4ab62',
    body: '#1e2633',
    trim: '#4b5873',
  },
} satisfies Record<ChessPiecePlacement['color'], PiecePalette>;

const rookBattlementPositions: readonly PiecePosition[] = [
  [-0.12, 0.79, -0.12],
  [0.12, 0.79, -0.12],
  [-0.12, 0.79, 0.12],
  [0.12, 0.79, 0.12],
];

const queenPearlPositions: readonly PiecePosition[] = [
  [0, 0.93, 0],
  [-0.16, 0.88, 0],
  [0.16, 0.88, 0],
  [0, 0.88, -0.16],
  [0, 0.88, 0.16],
];

export function ChessPieceMesh({
  onSelect,
  piecePlacement,
  position,
}: ChessPieceMeshProps) {
  const palette = piecePaletteByColor[piecePlacement.color];
  const accessibleLabel = getPieceAccessibleLabel(piecePlacement);

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    onSelect?.(piecePlacement.square);
  }

  return (
    <group
      name={`board-piece-${piecePlacement.renderId}`}
      onClick={handleClick}
      position={position}
      userData={{
        accessibleLabel,
        pieceColor: piecePlacement.color,
        pieceSquare: piecePlacement.square,
        pieceType: piecePlacement.piece,
        renderId: piecePlacement.renderId,
      }}
    >
      <PieceBase palette={palette} />
      {renderPieceTop(piecePlacement.piece, palette)}
    </group>
  );
}

function PieceBase({ palette }: { palette: PiecePalette }) {
  return (
    <>
      <mesh
        castShadow
        receiveShadow
        position={[0, pieceBaseContactLocalY + 0.08, 0]}
      >
        <cylinderGeometry args={[0.34, 0.28, 0.16, 28]} />
        <meshStandardMaterial color={palette.trim} roughness={0.45} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[0, pieceBaseContactLocalY + 0.18, 0]}
      >
        <cylinderGeometry args={[0.24, 0.3, 0.08, 28]} />
        <meshStandardMaterial color={palette.body} roughness={0.38} />
      </mesh>
    </>
  );
}

function renderPieceTop(piece: ChessPiece, palette: PiecePalette) {
  switch (piece) {
    case 'pawn':
      return <PawnTop palette={palette} />;
    case 'knight':
      return <KnightTop palette={palette} />;
    case 'bishop':
      return <BishopTop palette={palette} />;
    case 'rook':
      return <RookTop palette={palette} />;
    case 'queen':
      return <QueenTop palette={palette} />;
    case 'king':
      return <KingTop palette={palette} />;
  }
}

function PawnTop({ palette }: { palette: PiecePalette }) {
  return (
    <>
      <mesh castShadow receiveShadow position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.12, 0.18, 0.36, 20]} />
        <meshStandardMaterial color={palette.body} roughness={0.34} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.66, 0]}>
        <sphereGeometry args={[0.14, 22, 18]} />
        <meshStandardMaterial color={palette.accent} roughness={0.3} />
      </mesh>
    </>
  );
}

function KnightTop({ palette }: { palette: PiecePalette }) {
  return (
    <>
      <mesh castShadow receiveShadow position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.15, 0.22, 0.24, 20]} />
        <meshStandardMaterial color={palette.body} roughness={0.34} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.57, 0.02]}
        rotation={[0.22, 0, -0.08]}
      >
        <boxGeometry args={[0.18, 0.36, 0.22]} />
        <meshStandardMaterial color={palette.body} roughness={0.3} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[0.08, 0.78, 0.1]}
        rotation={[0.16, 0.78, -0.18]}
      >
        <coneGeometry args={[0.16, 0.28, 4]} />
        <meshStandardMaterial color={palette.accent} roughness={0.24} />
      </mesh>
      <mesh castShadow receiveShadow position={[-0.05, 0.79, 0.05]}>
        <boxGeometry args={[0.08, 0.12, 0.18]} />
        <meshStandardMaterial color={palette.trim} roughness={0.24} />
      </mesh>
      <mesh castShadow receiveShadow position={[-0.02, 0.92, 0.03]}>
        <coneGeometry args={[0.04, 0.1, 4]} />
        <meshStandardMaterial color={palette.trim} roughness={0.22} />
      </mesh>
    </>
  );
}

function BishopTop({ palette }: { palette: PiecePalette }) {
  return (
    <>
      <mesh castShadow receiveShadow position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.11, 0.2, 0.48, 24]} />
        <meshStandardMaterial color={palette.body} roughness={0.34} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.79, 0]}>
        <sphereGeometry args={[0.11, 20, 18]} />
        <meshStandardMaterial color={palette.accent} roughness={0.28} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.73, 0]}
        rotation={[0, 0, 0.68]}
      >
        <boxGeometry args={[0.06, 0.22, 0.07]} />
        <meshStandardMaterial color={palette.trim} roughness={0.2} />
      </mesh>
    </>
  );
}

function RookTop({ palette }: { palette: PiecePalette }) {
  return (
    <>
      <mesh castShadow receiveShadow position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.16, 0.23, 0.4, 20]} />
        <meshStandardMaterial color={palette.body} roughness={0.34} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.67, 0]}>
        <boxGeometry args={[0.38, 0.16, 0.38]} />
        <meshStandardMaterial color={palette.trim} roughness={0.25} />
      </mesh>
      {rookBattlementPositions.map((position, index) => (
        <mesh castShadow key={`rook-battlement-${index}`} position={position}>
          <boxGeometry args={[0.09, 0.14, 0.09]} />
          <meshStandardMaterial color={palette.accent} roughness={0.18} />
        </mesh>
      ))}
    </>
  );
}

function QueenTop({ palette }: { palette: PiecePalette }) {
  return (
    <>
      <mesh castShadow receiveShadow position={[0, 0.48, 0]}>
        <cylinderGeometry args={[0.12, 0.21, 0.54, 24]} />
        <meshStandardMaterial color={palette.body} roughness={0.33} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.18, 0.14, 0.08, 24]} />
        <meshStandardMaterial color={palette.trim} roughness={0.24} />
      </mesh>
      {queenPearlPositions.map((position, index) => (
        <mesh castShadow key={`queen-pearl-${index}`} position={position}>
          <sphereGeometry args={[0.05, 18, 14]} />
          <meshStandardMaterial color={palette.accent} roughness={0.18} />
        </mesh>
      ))}
    </>
  );
}

function KingTop({ palette }: { palette: PiecePalette }) {
  return (
    <>
      <mesh castShadow receiveShadow position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.12, 0.21, 0.58, 24]} />
        <meshStandardMaterial color={palette.body} roughness={0.33} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.83, 0]}>
        <cylinderGeometry args={[0.14, 0.16, 0.08, 24]} />
        <meshStandardMaterial color={palette.trim} roughness={0.22} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.98, 0]}>
        <boxGeometry args={[0.06, 0.24, 0.06]} />
        <meshStandardMaterial color={palette.accent} roughness={0.16} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 1.02, 0]}>
        <boxGeometry args={[0.22, 0.06, 0.06]} />
        <meshStandardMaterial color={palette.accent} roughness={0.16} />
      </mesh>
    </>
  );
}
