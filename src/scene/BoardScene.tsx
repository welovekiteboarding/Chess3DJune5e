import { OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { type Camera, Matrix4, MOUSE, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type PropsWithChildren,
} from 'react';

import type { ChessPiecePlacement, ChessSquare } from '../chess/chessTypes';

type BoardCameraViewMode = 'custom' | 'default' | 'overhead';

interface BoardCameraView {
  azimuth: number;
  distance: number;
  polar: number;
  viewMode: BoardCameraViewMode;
}

export interface BoardSceneCanvasProps extends PropsWithChildren {
  cameraView?: BoardCameraView;
  className?: string;
  onSquareScreenPositionsChange?: (
    squareScreenPositions: BoardSquareScreenPositions,
  ) => void;
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

interface BoardSquareScreenPosition {
  visible: boolean;
  x: number;
  y: number;
}

type BoardSquareScreenPositions = Partial<
  Record<ChessSquare, BoardSquareScreenPosition>
>;

const boardSquares = createBoardSquares();
const squareSize = 1;
const boardHalfSpan = 3.5;
const boardRotationRadians = -0.72;
const boardSquareSurfaceY = 0.11;
const minCameraDistance = 6.6;
const maxCameraDistance = 12.5;
const minCameraPolar = 0.18;
const maxCameraPolar = 1.24;
const cameraRotateStep = Math.PI / 10;
const cameraTiltStep = 0.14;
const cameraZoomStep = 0.8;
const defaultCameraView: BoardCameraView = {
  azimuth: 0,
  distance: 9.92,
  polar: 0.71,
  viewMode: 'default',
};
const overheadCameraView: BoardCameraView = {
  azimuth: 0,
  distance: 8.4,
  polar: 0.24,
  viewMode: 'overhead',
};
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
const interactionHitTargetOverlayStyle = {
  position: 'absolute',
  inset: 0,
  zIndex: 2,
  pointerEvents: 'none',
} as const;
const interactionHitTargetStyle = {
  position: 'absolute',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'auto',
  background: 'rgba(255, 255, 255, 0.001)',
  border: 0,
  borderRadius: '999px',
  cursor: 'pointer',
  padding: 0,
  margin: 0,
} as const;
const boardRotationMatrix = new Matrix4().makeRotationX(boardRotationRadians);

function DefaultBoardSceneCanvas({
  cameraView = defaultCameraView,
  children,
  className,
  onSquareScreenPositionsChange,
}: BoardSceneCanvasProps) {
  const [cameraX, cameraY, cameraZ] = getCameraPosition(cameraView);

  return (
    <Canvas
      camera={{ position: [cameraX, cameraY, cameraZ], fov: 42 }}
      className={className}
      shadows
    >
      <BoardSceneCameraRig
        cameraView={cameraView}
        onSquareScreenPositionsChange={onSquareScreenPositionsChange}
      />
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
  const [cameraView, setCameraView] = useState(defaultCameraView);
  const [squareScreenPositions, setSquareScreenPositions] =
    useState<BoardSquareScreenPositions>({});

  function handleCameraAction(action: BoardCameraAction) {
    setCameraView((currentCameraView) =>
      getNextCameraView(currentCameraView, action),
    );
  }

  return (
    <section
      aria-label="3D chess board scene"
      className={className}
      data-testid="board-scene"
    >
      <div
        className="board-scene-canvas-shell"
        data-testid="board-scene-canvas-shell"
      >
        <CanvasBoundary
          cameraView={cameraView}
          className="board-scene-canvas"
          onSquareScreenPositionsChange={setSquareScreenPositions}
        >
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
                  onClick={(event) =>
                    handleSceneSquareClick(event, boardSquare.square, onSquareSelect)
                  }
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
                    onClick={(event) =>
                      handleSceneSquareClick(
                        event,
                        piecePlacement.square,
                        onSquareSelect,
                      )
                    }
                    position={position}
                  >
                    <cylinderGeometry args={[0.22, 0.3, 0.45, 24]} />
                    <meshStandardMaterial
                      color={
                        piecePlacement.color === 'white' ? '#f8f4e8' : '#1d2430'
                      }
                    />
                  </mesh>
                  <mesh
                    castShadow
                    onClick={(event) =>
                      handleSceneSquareClick(
                        event,
                        piecePlacement.square,
                        onSquareSelect,
                      )
                    }
                    position={[position[0], position[1] + 0.3, position[2]]}
                  >
                    <sphereGeometry args={[0.16, 20, 20]} />
                    <meshStandardMaterial
                      color={
                        piecePlacement.color === 'white' ? '#ded3bc' : '#384152'
                      }
                    />
                  </mesh>
                </group>
              );
            })}
          </group>
        </CanvasBoundary>

        <div
          className="board-scene-hit-target-overlay"
          data-testid="board-scene-hit-target-overlay"
          style={interactionHitTargetOverlayStyle}
        >
          {boardSquares.map((boardSquare) => {
            const hitTargetStyle = getInteractionHitTargetStyle(
              boardSquare,
              squareScreenPositions,
            );

            if (!hitTargetStyle) {
              return null;
            }

            return (
              <div
                data-screen-x={squareScreenPositions[boardSquare.square]?.x}
                data-screen-y={squareScreenPositions[boardSquare.square]?.y}
                data-square={boardSquare.square}
                data-testid={`board-hit-target-${boardSquare.square}`}
                key={boardSquare.square}
                onClick={() => onSquareSelect?.(boardSquare.square)}
                style={hitTargetStyle}
              />
            );
          })}
        </div>

        <div className="board-scene-camera-ui">
          <div
            aria-label="Board camera controls"
            className="board-scene-camera-toolbar"
            role="toolbar"
          >
            <button
              className="board-scene-camera-button"
              onClick={() => handleCameraAction('rotate-left')}
              type="button"
            >
              Rotate left
            </button>
            <button
              className="board-scene-camera-button"
              onClick={() => handleCameraAction('rotate-right')}
              type="button"
            >
              Rotate right
            </button>
            <button
              className="board-scene-camera-button"
              onClick={() => handleCameraAction('tilt-up')}
              type="button"
            >
              Tilt up
            </button>
            <button
              className="board-scene-camera-button"
              onClick={() => handleCameraAction('tilt-down')}
              type="button"
            >
              Tilt down
            </button>
            <button
              className="board-scene-camera-button"
              onClick={() => handleCameraAction('zoom-in')}
              type="button"
            >
              Zoom in
            </button>
            <button
              className="board-scene-camera-button"
              onClick={() => handleCameraAction('zoom-out')}
              type="button"
            >
              Zoom out
            </button>
            <button
              className="board-scene-camera-button"
              onClick={() => handleCameraAction('overhead')}
              type="button"
            >
              Overhead view
            </button>
            <button
              className="board-scene-camera-button"
              onClick={() => handleCameraAction('reset')}
              type="button"
            >
              Reset view
            </button>
          </div>

          <p
            aria-live="polite"
            className="board-scene-camera-status"
            data-testid="board-camera-state"
            data-view-mode={cameraView.viewMode}
            role="status"
          >
            {getCameraViewLabel(cameraView.viewMode)}
          </p>
        </div>
      </div>

      <div
        className="board-scene-fallback"
        data-testid="board-scene-fallback"
        style={fallbackOnlyStyle}
      >
        <div
          aria-label="Chess board squares"
          data-testid="board-scene-square-controls"
          role="grid"
          style={fallbackOnlyStyle}
        >
          {boardSquares.map((boardSquare) => {
            const piecePlacement = piecePlacements.find(
              (entry) => entry.square === boardSquare.square,
            );
            const isSelected = boardSquare.square === selectedSquare;
            const isLegalDestination = legalDestinationSet.has(boardSquare.square);
            const pieceDescription = piecePlacement
              ? `${piecePlacement.color} ${piecePlacement.piece}`
              : 'empty';
            const squareScreenPosition =
              squareScreenPositions[boardSquare.square];

            return (
              <button
                aria-label={`${boardSquare.square} square`}
                aria-pressed={isSelected}
                data-legal-destination={String(isLegalDestination)}
                data-piece={pieceDescription}
                data-screen-visible={String(squareScreenPosition?.visible ?? false)}
                data-screen-x={squareScreenPosition?.x}
                data-screen-y={squareScreenPosition?.y}
                data-selected={String(isSelected)}
                data-square={boardSquare.square}
                data-testid={`board-square-${boardSquare.square}`}
                key={boardSquare.square}
                onClick={() => onSquareSelect?.(boardSquare.square)}
                type="button"
              />
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

type BoardCameraAction =
  | 'overhead'
  | 'reset'
  | 'rotate-left'
  | 'rotate-right'
  | 'tilt-down'
  | 'tilt-up'
  | 'zoom-in'
  | 'zoom-out';

function BoardSceneCameraRig({
  cameraView,
  onSquareScreenPositionsChange,
}: {
  cameraView: BoardCameraView;
  onSquareScreenPositionsChange?: (
    squareScreenPositions: BoardSquareScreenPositions,
  ) => void;
}) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const lastSquareScreenPositionsRef = useRef('');

  useLayoutEffect(() => {
    const [cameraX, cameraY, cameraZ] = getCameraPosition(cameraView);

    setCameraPosition(camera, cameraX, cameraY, cameraZ);
    camera.lookAt(0, 0, 0);
    controlsRef.current?.target.set(0, 0, 0);
    controlsRef.current?.update();
    publishProjectedSquarePositions({
      camera,
      lastSquareScreenPositionsRef,
      onSquareScreenPositionsChange,
      size,
    });
  }, [camera, cameraView, onSquareScreenPositionsChange, size]);

  useFrame(() => {
    publishProjectedSquarePositions({
      camera,
      lastSquareScreenPositionsRef,
      onSquareScreenPositionsChange,
      size,
    });
  });

  return (
    <OrbitControls
      ref={controlsRef}
      dampingFactor={0.12}
      enableDamping
      enablePan={false}
      makeDefault
      maxDistance={maxCameraDistance}
      maxPolarAngle={maxCameraPolar}
      minDistance={minCameraDistance}
      minPolarAngle={minCameraPolar}
      mouseButtons={{
        LEFT: MOUSE.PAN,
        MIDDLE: MOUSE.DOLLY,
        RIGHT: MOUSE.ROTATE,
      }}
      rotateSpeed={0.85}
      target={[0, 0, 0]}
      zoomSpeed={0.9}
    />
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

function handleSceneSquareClick(
  event: ThreeEvent<MouseEvent>,
  square: ChessSquare,
  onSquareSelect?: (square: ChessSquare) => void,
) {
  event.stopPropagation();
  onSquareSelect?.(square);
}

function getNextCameraView(
  currentCameraView: BoardCameraView,
  action: BoardCameraAction,
): BoardCameraView {
  switch (action) {
    case 'reset':
      return defaultCameraView;
    case 'overhead':
      return overheadCameraView;
    case 'rotate-left':
      return createCustomCameraView(currentCameraView, {
        azimuth: currentCameraView.azimuth - cameraRotateStep,
      });
    case 'rotate-right':
      return createCustomCameraView(currentCameraView, {
        azimuth: currentCameraView.azimuth + cameraRotateStep,
      });
    case 'tilt-up':
      return createCustomCameraView(currentCameraView, {
        polar: clamp(
          currentCameraView.polar - cameraTiltStep,
          minCameraPolar,
          maxCameraPolar,
        ),
      });
    case 'tilt-down':
      return createCustomCameraView(currentCameraView, {
        polar: clamp(
          currentCameraView.polar + cameraTiltStep,
          minCameraPolar,
          maxCameraPolar,
        ),
      });
    case 'zoom-in':
      return createCustomCameraView(currentCameraView, {
        distance: clamp(
          currentCameraView.distance - cameraZoomStep,
          minCameraDistance,
          maxCameraDistance,
        ),
      });
    case 'zoom-out':
      return createCustomCameraView(currentCameraView, {
        distance: clamp(
          currentCameraView.distance + cameraZoomStep,
          minCameraDistance,
          maxCameraDistance,
        ),
      });
  }
}

function createCustomCameraView(
  currentCameraView: BoardCameraView,
  nextValues: Partial<BoardCameraView>,
): BoardCameraView {
  return {
    ...currentCameraView,
    ...nextValues,
    viewMode: 'custom',
  };
}

function getCameraPosition(cameraView: BoardCameraView): [number, number, number] {
  const horizontalDistance = Math.sin(cameraView.polar) * cameraView.distance;

  return [
    Math.sin(cameraView.azimuth) * horizontalDistance,
    Math.cos(cameraView.polar) * cameraView.distance,
    Math.cos(cameraView.azimuth) * horizontalDistance,
  ];
}

function getCameraViewLabel(viewMode: BoardCameraViewMode): string {
  switch (viewMode) {
    case 'default':
      return 'Default camera view';
    case 'overhead':
      return 'Overhead camera view';
    case 'custom':
      return 'Custom camera view';
  }
}

function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.min(Math.max(value, minValue), maxValue);
}

function setCameraPosition(
  camera: Camera,
  cameraX: number,
  cameraY: number,
  cameraZ: number,
) {
  camera.position.set(cameraX, cameraY, cameraZ);
}

function getInteractionHitTargetStyle(
  boardSquare: BoardSquareDefinition,
  squareScreenPositions: BoardSquareScreenPositions,
): CSSProperties | null {
  const squareScreenPosition = squareScreenPositions[boardSquare.square];

  if (!squareScreenPosition?.visible) {
    return null;
  }

  const closestNeighborDistance = boardSquares
    .filter(
      (candidateSquare) =>
        candidateSquare.square !== boardSquare.square &&
        Math.max(
          Math.abs(candidateSquare.fileIndex - boardSquare.fileIndex),
          Math.abs(candidateSquare.rankIndex - boardSquare.rankIndex),
        ) === 1,
    )
    .flatMap((candidateSquare) => {
      const candidateScreenPosition =
        squareScreenPositions[candidateSquare.square];

      if (!candidateScreenPosition?.visible) {
        return [];
      }

      return [
        Math.hypot(
          candidateScreenPosition.x - squareScreenPosition.x,
          candidateScreenPosition.y - squareScreenPosition.y,
        ),
      ];
    })
    .reduce<number | null>(
      (currentClosestDistance, candidateDistance) =>
        currentClosestDistance === null
          ? candidateDistance
          : Math.min(currentClosestDistance, candidateDistance),
      null,
    );
  const targetSize = roundToTwoDecimals(
    clamp((closestNeighborDistance ?? 42) * 0.72, 18, 72),
  );

  return {
    ...interactionHitTargetStyle,
    height: `${targetSize}px`,
    left: `${squareScreenPosition.x}px`,
    top: `${squareScreenPosition.y}px`,
    width: `${targetSize}px`,
  };
}

function publishProjectedSquarePositions({
  camera,
  lastSquareScreenPositionsRef,
  onSquareScreenPositionsChange,
  size,
}: {
  camera: Camera;
  lastSquareScreenPositionsRef: { current: string };
  onSquareScreenPositionsChange?: (
    squareScreenPositions: BoardSquareScreenPositions,
  ) => void;
  size: { height: number; width: number };
}) {
  if (!onSquareScreenPositionsChange) {
    return;
  }

  const {
    projectedSquarePositions,
    projectedSquarePositionsSnapshot,
  } = getProjectedSquarePositions(camera, size);

  if (projectedSquarePositionsSnapshot === lastSquareScreenPositionsRef.current) {
    return;
  }

  lastSquareScreenPositionsRef.current = projectedSquarePositionsSnapshot;
  onSquareScreenPositionsChange(projectedSquarePositions);
}

function getProjectedSquarePositions(
  camera: Camera,
  size: { height: number; width: number },
) {
  const projectedSquarePositions: BoardSquareScreenPositions = {};
  const projectedSquarePositionsSnapshot = boardSquares
    .map((boardSquare) => {
      const [x, z] = getSquarePosition(boardSquare);
      const projectedSquarePosition = projectBoardPositionToScreen({
        camera,
        size,
        x,
        y: boardSquareSurfaceY,
        z,
      });

      projectedSquarePositions[boardSquare.square] = projectedSquarePosition;

      return `${boardSquare.square}:${projectedSquarePosition.x},${projectedSquarePosition.y},${Number(projectedSquarePosition.visible)}`;
    })
    .join('|');

  return {
    projectedSquarePositions,
    projectedSquarePositionsSnapshot,
  };
}

function projectBoardPositionToScreen({
  camera,
  size,
  x,
  y,
  z,
}: {
  camera: Camera;
  size: { height: number; width: number };
  x: number;
  y: number;
  z: number;
}): BoardSquareScreenPosition {
  const projectedVector = new Vector3(x, y, z)
    .applyMatrix4(boardRotationMatrix)
    .project(camera);
  const screenX = roundToTwoDecimals(
    (projectedVector.x * 0.5 + 0.5) * size.width,
  );
  const screenY = roundToTwoDecimals(
    (-projectedVector.y * 0.5 + 0.5) * size.height,
  );

  return {
    visible:
      projectedVector.z >= -1 &&
      projectedVector.z <= 1 &&
      screenX >= 0 &&
      screenX <= size.width &&
      screenY >= 0 &&
      screenY <= size.height,
    x: screenX,
    y: screenY,
  };
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
