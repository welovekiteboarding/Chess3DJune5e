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
import { getProceduralPieceProfile } from './proceduralPieceDesign';

interface ChessPieceMeshProps {
  onSelect?: (square: ChessSquare) => void;
  piecePlacement: ChessPiecePlacement;
  position: readonly [number, number, number];
}

interface PiecePalette {
  accent: string;
  body: string;
  shadow: string;
  trim: string;
}

type PiecePosition = readonly [number, number, number];

const piecePaletteByColor = {
  white: {
    accent: '#8f6840',
    body: '#f6efdf',
    shadow: '#c9b08a',
    trim: '#e0cb9f',
  },
  black: {
    accent: '#d7b06c',
    body: '#1f2735',
    shadow: '#111722',
    trim: '#52617b',
  },
} satisfies Record<ChessPiecePlacement['color'], PiecePalette>;

const rookBattlementPositions: readonly PiecePosition[] = [
  [-0.12, 0.79, -0.12],
  [0.12, 0.79, -0.12],
  [-0.12, 0.79, 0.12],
  [0.12, 0.79, 0.12],
];

const queenPearlPositions: readonly PiecePosition[] = [
  [0, 0.96, -0.18],
  [0.17, 0.95, -0.06],
  [0.1, 0.96, 0.15],
  [-0.1, 0.96, 0.15],
  [-0.17, 0.95, -0.06],
];

const knightEarPositions: readonly PiecePosition[] = [
  [-0.06, 0.95, 0.01],
  [0.02, 0.97, 0.06],
];

export function ChessPieceMesh({
  onSelect,
  piecePlacement,
  position,
}: ChessPieceMeshProps) {
  const palette = piecePaletteByColor[piecePlacement.color];
  const accessibleLabel = getPieceAccessibleLabel(piecePlacement);
  const profile = getProceduralPieceProfile(piecePlacement.piece);

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
        pieceProfile: profile.silhouetteId,
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
        position={[0, pieceBaseContactLocalY + 0.07, 0]}
      >
        <cylinderGeometry args={[0.35, 0.29, 0.14, 32]} />
        <meshStandardMaterial color={palette.trim} roughness={0.4} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, pieceBaseContactLocalY + 0.14, 0]}>
        <torusGeometry args={[0.24, 0.03, 12, 32]} />
        <meshStandardMaterial color={palette.accent} roughness={0.3} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[0, pieceBaseContactLocalY + 0.2, 0]}
      >
        <cylinderGeometry args={[0.27, 0.32, 0.08, 32]} />
        <meshStandardMaterial color={palette.body} roughness={0.34} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[0, pieceBaseContactLocalY + 0.24, 0]}
      >
        <cylinderGeometry args={[0.19, 0.25, 0.04, 28]} />
        <meshStandardMaterial color={palette.shadow} roughness={0.52} />
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
      <mesh castShadow receiveShadow position={[0, 0.39, 0]}>
        <cylinderGeometry args={[0.12, 0.18, 0.26, 24]} />
        <meshStandardMaterial color={palette.body} roughness={0.3} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.51, 0]}>
        <torusGeometry args={[0.1, 0.022, 12, 28]} />
        <meshStandardMaterial color={palette.trim} roughness={0.28} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.68, 0]}>
        <sphereGeometry args={[0.15, 24, 20]} />
        <meshStandardMaterial color={palette.accent} roughness={0.24} />
      </mesh>
    </>
  );
}

function KnightTop({ palette }: { palette: PiecePalette }) {
  return (
    <>
      <mesh castShadow receiveShadow position={[0, 0.37, 0]}>
        <cylinderGeometry args={[0.13, 0.21, 0.24, 22]} />
        <meshStandardMaterial color={palette.body} roughness={0.32} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.53, 0]}>
        <torusGeometry args={[0.12, 0.022, 12, 24]} />
        <meshStandardMaterial color={palette.trim} roughness={0.26} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[-0.01, 0.68, 0.02]}
        rotation={[0.08, 0, -0.32]}
      >
        <boxGeometry args={[0.23, 0.42, 0.24]} />
        <meshStandardMaterial color={palette.body} roughness={0.28} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[0.13, 0.83, 0.08]}
        rotation={[0.12, 0.18, -0.1]}
      >
        <boxGeometry args={[0.19, 0.16, 0.18]} />
        <meshStandardMaterial color={palette.accent} roughness={0.22} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[-0.05, 0.83, -0.02]}
        rotation={[0.1, 0, -0.18]}
      >
        <boxGeometry args={[0.06, 0.18, 0.2]} />
        <meshStandardMaterial color={palette.trim} roughness={0.24} />
      </mesh>
      {knightEarPositions.map((earPosition, index) => (
        <mesh
          castShadow
          key={`knight-ear-${index}`}
          position={earPosition}
          rotation={[0.18, index === 0 ? -0.2 : 0.2, -0.08]}
        >
          <coneGeometry args={[0.04, 0.12, 4]} />
          <meshStandardMaterial color={palette.trim} roughness={0.2} />
        </mesh>
      ))}
    </>
  );
}

function BishopTop({ palette }: { palette: PiecePalette }) {
  return (
    <>
      <mesh castShadow receiveShadow position={[0, 0.41, 0]}>
        <cylinderGeometry args={[0.11, 0.19, 0.3, 24]} />
        <meshStandardMaterial color={palette.body} roughness={0.3} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.56, 0]}>
        <torusGeometry args={[0.11, 0.022, 12, 28]} />
        <meshStandardMaterial color={palette.trim} roughness={0.26} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.79, 0]} scale={[0.82, 1.35, 0.82]}>
        <sphereGeometry args={[0.12, 22, 20]} />
        <meshStandardMaterial color={palette.accent} roughness={0.23} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.78, 0.01]}
        rotation={[0, 0, 0.74]}
      >
        <boxGeometry args={[0.05, 0.27, 0.08]} />
        <meshStandardMaterial color={palette.shadow} roughness={0.18} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.95, 0]}>
        <sphereGeometry args={[0.045, 16, 14]} />
        <meshStandardMaterial color={palette.trim} roughness={0.2} />
      </mesh>
    </>
  );
}

function RookTop({ palette }: { palette: PiecePalette }) {
  return (
    <>
      <mesh castShadow receiveShadow position={[0, 0.41, 0]}>
        <cylinderGeometry args={[0.17, 0.23, 0.3, 24]} />
        <meshStandardMaterial color={palette.body} roughness={0.3} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.57, 0]}>
        <torusGeometry args={[0.15, 0.024, 12, 28]} />
        <meshStandardMaterial color={palette.trim} roughness={0.24} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.69, 0]}>
        <boxGeometry args={[0.4, 0.12, 0.4]} />
        <meshStandardMaterial color={palette.trim} roughness={0.22} />
      </mesh>
      {rookBattlementPositions.map((battlementPosition, index) => (
        <mesh
          castShadow
          key={`rook-battlement-${index}`}
          position={battlementPosition}
        >
          <boxGeometry args={[0.09, 0.17, 0.09]} />
          <meshStandardMaterial color={palette.accent} roughness={0.18} />
        </mesh>
      ))}
    </>
  );
}

function QueenTop({ palette }: { palette: PiecePalette }) {
  return (
    <>
      <mesh castShadow receiveShadow position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.11, 0.2, 0.38, 24]} />
        <meshStandardMaterial color={palette.body} roughness={0.3} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.65, 0]}>
        <torusGeometry args={[0.13, 0.022, 12, 28]} />
        <meshStandardMaterial color={palette.trim} roughness={0.23} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.83, 0]}>
        <cylinderGeometry args={[0.19, 0.1, 0.16, 10]} />
        <meshStandardMaterial color={palette.body} roughness={0.22} />
      </mesh>
      {queenPearlPositions.map((pearlPosition, index) => (
        <mesh castShadow key={`queen-pearl-${index}`} position={pearlPosition}>
          <sphereGeometry args={[0.05, 18, 16]} />
          <meshStandardMaterial color={palette.accent} roughness={0.16} />
        </mesh>
      ))}
    </>
  );
}

function KingTop({ palette }: { palette: PiecePalette }) {
  return (
    <>
      <mesh castShadow receiveShadow position={[0, 0.46, 0]}>
        <cylinderGeometry args={[0.11, 0.2, 0.42, 24]} />
        <meshStandardMaterial color={palette.body} roughness={0.3} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.67, 0]}>
        <torusGeometry args={[0.13, 0.022, 12, 28]} />
        <meshStandardMaterial color={palette.trim} roughness={0.23} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.82, 0]}>
        <cylinderGeometry args={[0.16, 0.12, 0.14, 24]} />
        <meshStandardMaterial color={palette.body} roughness={0.22} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.98, 0]}>
        <boxGeometry args={[0.06, 0.24, 0.06]} />
        <meshStandardMaterial color={palette.accent} roughness={0.16} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 1.02, 0]}>
        <boxGeometry args={[0.24, 0.06, 0.06]} />
        <meshStandardMaterial color={palette.accent} roughness={0.16} />
      </mesh>
    </>
  );
}
