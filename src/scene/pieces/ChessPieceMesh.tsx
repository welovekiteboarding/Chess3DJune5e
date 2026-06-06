import type { ThreeEvent } from '@react-three/fiber';
import { Shape, Vector2 } from 'three';

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
type PieceScale = readonly [number, number, number];
type LathePoint = readonly [number, number];

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
  [-0.16, 0.92, -0.16],
  [0.16, 0.92, -0.16],
  [-0.16, 0.92, 0.16],
  [0.16, 0.92, 0.16],
];

const queenCrownSpikes = [
  { position: [0, 1.04, -0.2] as PiecePosition, scale: 1.1 },
  { position: [0.19, 1.01, -0.06] as PiecePosition, scale: 0.9 },
  { position: [0.11, 1.03, 0.16] as PiecePosition, scale: 0.95 },
  { position: [-0.11, 1.03, 0.16] as PiecePosition, scale: 0.95 },
  { position: [-0.19, 1.01, -0.06] as PiecePosition, scale: 0.9 },
] as const;

const kingCrownStudPositions: readonly PiecePosition[] = [
  [0, 0.97, -0.16],
  [0.16, 0.97, 0],
  [0, 0.97, 0.16],
  [-0.16, 0.97, 0],
];

const bishopSlitRotation = [0, 0, 0.78] as const;
const collarRotation = [Math.PI / 2, 0, 0] as const;

const pedestalProfile = createLathePoints([
  [0.32, pieceBaseContactLocalY],
  [0.35, 0.03],
  [0.35, 0.08],
  [0.3, 0.14],
  [0.25, 0.19],
  [0.2, 0.23],
  [0.17, 0.26],
]);

const pawnBodyProfile = createLathePoints([
  [0.18, 0.24],
  [0.16, 0.31],
  [0.12, 0.42],
  [0.1, 0.52],
  [0.12, 0.59],
  [0.15, 0.62],
]);

const rookBodyProfile = createLathePoints([
  [0.23, 0.24],
  [0.24, 0.36],
  [0.2, 0.5],
  [0.18, 0.66],
  [0.2, 0.78],
  [0.22, 0.82],
]);

const bishopBodyProfile = createLathePoints([
  [0.18, 0.24],
  [0.17, 0.34],
  [0.13, 0.49],
  [0.11, 0.63],
  [0.13, 0.73],
  [0.16, 0.79],
]);

const queenBodyProfile = createLathePoints([
  [0.21, 0.24],
  [0.19, 0.36],
  [0.14, 0.5],
  [0.12, 0.68],
  [0.16, 0.82],
  [0.2, 0.88],
]);

const kingBodyProfile = createLathePoints([
  [0.21, 0.24],
  [0.2, 0.38],
  [0.15, 0.54],
  [0.13, 0.72],
  [0.16, 0.86],
  [0.19, 0.94],
]);

const knightBodyProfile = createLathePoints([
  [0.19, 0.24],
  [0.17, 0.34],
  [0.14, 0.46],
  [0.12, 0.56],
  [0.13, 0.63],
  [0.16, 0.68],
]);

const knightHeadExtrudeDepth = 0.18;
const knightHeadExtrudeSettings = {
  bevelEnabled: false,
  depth: knightHeadExtrudeDepth,
  steps: 1,
} as const;

const knightHeadShape = new Shape();
knightHeadShape.moveTo(-0.16, 0.02);
knightHeadShape.bezierCurveTo(-0.14, 0.26, -0.08, 0.47, 0.02, 0.54);
knightHeadShape.lineTo(0.06, 0.63);
knightHeadShape.lineTo(0.11, 0.53);
knightHeadShape.lineTo(0.15, 0.58);
knightHeadShape.lineTo(0.13, 0.43);
knightHeadShape.bezierCurveTo(0.18, 0.34, 0.2, 0.24, 0.17, 0.16);
knightHeadShape.lineTo(0.06, 0.12);
knightHeadShape.lineTo(0.01, 0.02);
knightHeadShape.lineTo(-0.05, -0.04);
knightHeadShape.lineTo(-0.14, -0.02);
knightHeadShape.closePath();

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
      <LathedSection color={palette.trim} profile={pedestalProfile} roughness={0.44} />
      <Collar color={palette.accent} positionY={0.09} radius={0.25} tube={0.032} />
      <mesh castShadow position={[0, 0.18, 0]} receiveShadow>
        <cylinderGeometry args={[0.2, 0.24, 0.08, 20]} />
        <meshStandardMaterial color={palette.body} roughness={0.34} />
      </mesh>
      <Collar color={palette.shadow} positionY={0.22} radius={0.17} tube={0.022} roughness={0.52} />
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
      <LathedSection color={palette.body} profile={pawnBodyProfile} roughness={0.3} />
      <Collar color={palette.trim} positionY={0.6} radius={0.09} tube={0.018} roughness={0.26} />
      <mesh castShadow position={[0, 0.74, 0]} receiveShadow>
        <sphereGeometry args={[0.13, 18, 14]} />
        <meshStandardMaterial color={palette.accent} roughness={0.22} />
      </mesh>
    </>
  );
}

function KnightTop({ palette }: { palette: PiecePalette }) {
  return (
    <>
      <LathedSection color={palette.body} profile={knightBodyProfile} roughness={0.3} />
      <Collar color={palette.trim} positionY={0.62} radius={0.11} tube={0.02} roughness={0.26} />
      <mesh
        castShadow
        position={[-0.02, 0.52, -knightHeadExtrudeDepth / 2 + 0.08]}
        receiveShadow
        rotation={[0.08, -0.28, -0.06]}
      >
        <extrudeGeometry args={[knightHeadShape, knightHeadExtrudeSettings]} />
        <meshStandardMaterial color={palette.body} roughness={0.28} />
      </mesh>
      <mesh
        castShadow
        position={[0.02, 0.8, 0.09]}
        receiveShadow
        rotation={[0.2, 0.12, -0.1]}
      >
        <boxGeometry args={[0.06, 0.26, 0.05]} />
        <meshStandardMaterial color={palette.trim} roughness={0.22} />
      </mesh>
      <mesh castShadow position={[0.12, 0.71, 0.13]} receiveShadow>
        <boxGeometry args={[0.12, 0.07, 0.08]} />
        <meshStandardMaterial color={palette.accent} roughness={0.22} />
      </mesh>
      <mesh castShadow position={[-0.03, 0.78, 0.12]} receiveShadow>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshStandardMaterial color={palette.accent} roughness={0.18} />
      </mesh>
    </>
  );
}

function BishopTop({ palette }: { palette: PiecePalette }) {
  return (
    <>
      <LathedSection color={palette.body} profile={bishopBodyProfile} roughness={0.3} />
      <Collar color={palette.trim} positionY={0.67} radius={0.08} tube={0.018} roughness={0.24} />
      <mesh castShadow position={[0, 0.87, 0]} receiveShadow scale={[0.82, 1.7, 0.82]}>
        <sphereGeometry args={[0.11, 16, 14]} />
        <meshStandardMaterial color={palette.accent} roughness={0.22} />
      </mesh>
      <mesh
        castShadow
        position={[0.01, 0.86, 0.01]}
        receiveShadow
        rotation={bishopSlitRotation}
      >
        <boxGeometry args={[0.045, 0.34, 0.09]} />
        <meshStandardMaterial color={palette.shadow} roughness={0.16} />
      </mesh>
      <mesh castShadow position={[0, 1.08, 0]} receiveShadow>
        <sphereGeometry args={[0.04, 10, 10]} />
        <meshStandardMaterial color={palette.trim} roughness={0.18} />
      </mesh>
    </>
  );
}

function RookTop({ palette }: { palette: PiecePalette }) {
  return (
    <>
      <LathedSection color={palette.body} profile={rookBodyProfile} roughness={0.3} />
      <Collar color={palette.trim} positionY={0.61} radius={0.14} tube={0.018} roughness={0.24} />
      <mesh castShadow position={[0, 0.82, 0]} receiveShadow>
        <cylinderGeometry args={[0.25, 0.23, 0.08, 6]} />
        <meshStandardMaterial color={palette.trim} roughness={0.22} />
      </mesh>
      <mesh castShadow position={[0, 0.86, 0]} receiveShadow>
        <cylinderGeometry args={[0.21, 0.22, 0.05, 6]} />
        <meshStandardMaterial color={palette.shadow} roughness={0.28} />
      </mesh>
      {rookBattlementPositions.map((battlementPosition, index) => (
        <mesh
          castShadow
          key={`rook-battlement-${index}`}
          position={battlementPosition}
          receiveShadow
        >
          <boxGeometry args={[0.11, 0.16, 0.11]} />
          <meshStandardMaterial color={palette.accent} roughness={0.18} />
        </mesh>
      ))}
    </>
  );
}

function QueenTop({ palette }: { palette: PiecePalette }) {
  return (
    <>
      <LathedSection color={palette.body} profile={queenBodyProfile} roughness={0.3} />
      <Collar color={palette.trim} positionY={0.76} radius={0.12} tube={0.02} roughness={0.22} />
      <mesh castShadow position={[0, 0.91, 0]} receiveShadow>
        <cylinderGeometry args={[0.18, 0.13, 0.12, 8]} />
        <meshStandardMaterial color={palette.body} roughness={0.2} />
      </mesh>
      {queenCrownSpikes.map((spike, index) => (
        <group key={`queen-spike-${index}`} position={spike.position}>
          <mesh castShadow receiveShadow>
            <coneGeometry args={[0.032 * spike.scale, 0.13 * spike.scale, 4]} />
            <meshStandardMaterial color={palette.trim} roughness={0.18} />
          </mesh>
          <mesh castShadow position={[0, 0.08 * spike.scale, 0]} receiveShadow>
            <sphereGeometry args={[0.03 * spike.scale, 10, 8]} />
            <meshStandardMaterial color={palette.accent} roughness={0.15} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function KingTop({ palette }: { palette: PiecePalette }) {
  return (
    <>
      <LathedSection color={palette.body} profile={kingBodyProfile} roughness={0.3} />
      <Collar color={palette.trim} positionY={0.84} radius={0.12} tube={0.02} roughness={0.22} />
      <mesh castShadow position={[0, 0.99, 0]} receiveShadow>
        <sphereGeometry args={[0.08, 12, 10]} />
        <meshStandardMaterial color={palette.body} roughness={0.2} />
      </mesh>
      {kingCrownStudPositions.map((studPosition, index) => (
        <mesh castShadow key={`king-stud-${index}`} position={studPosition} receiveShadow>
          <sphereGeometry args={[0.026, 8, 8]} />
          <meshStandardMaterial color={palette.accent} roughness={0.16} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.12, 0]} receiveShadow>
        <boxGeometry args={[0.06, 0.26, 0.06]} />
        <meshStandardMaterial color={palette.accent} roughness={0.16} />
      </mesh>
      <mesh castShadow position={[0, 1.16, 0]} receiveShadow>
        <boxGeometry args={[0.24, 0.06, 0.06]} />
        <meshStandardMaterial color={palette.accent} roughness={0.16} />
      </mesh>
    </>
  );
}

interface LathedSectionProps {
  color: string;
  position?: PiecePosition;
  profile: Vector2[];
  roughness: number;
  rotation?: PiecePosition;
  scale?: PieceScale;
}

function LathedSection({
  color,
  position = [0, 0, 0],
  profile,
  roughness,
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
}: LathedSectionProps) {
  return (
    <mesh castShadow position={position} receiveShadow rotation={rotation} scale={scale}>
      <latheGeometry args={[profile, 20]} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  );
}

interface CollarProps {
  color: string;
  positionY: number;
  radius: number;
  roughness?: number;
  tube: number;
}

function Collar({
  color,
  positionY,
  radius,
  roughness = 0.24,
  tube,
}: CollarProps) {
  return (
    <mesh castShadow position={[0, positionY, 0]} receiveShadow rotation={collarRotation}>
      <torusGeometry args={[radius, tube, 10, 24]} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  );
}

function createLathePoints(points: readonly LathePoint[]) {
  return points.map(([radius, y]) => new Vector2(radius, y));
}
