import { OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber';
import type { Camera } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useEffect, useRef, useState, type ComponentType, type PropsWithChildren } from 'react';

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
const interactionOverlayStyle = {
  position: 'absolute',
  inset: '38% 0 34% 0',
  display: 'grid',
  gridTemplateColumns: 'repeat(8, 1fr)',
  gridTemplateRows: 'repeat(8, 1fr)',
  zIndex: 2,
} as const;
const interactionSquareStyle = {
  appearance: 'none',
  background: 'transparent',
  border: 0,
  cursor: 'pointer',
  display: 'block',
  height: '100%',
  margin: 0,
  padding: 0,
  width: '100%',
} as const;

function DefaultBoardSceneCanvas({
  cameraView = defaultCameraView,
  children,
  className,
}: BoardSceneCanvasProps) {
  const [cameraX, cameraY, cameraZ] = getCameraPosition(cameraView);

  return (
    <Canvas
      camera={{ position: [cameraX, cameraY, cameraZ], fov: 42 }}
      className={className}
      shadows
    >
      <BoardSceneCameraRig cameraView={cameraView} />
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
        aria-label="Chess board squares"
        className="board-scene-interaction-overlay"
        data-testid="board-scene-interaction-overlay"
        role="grid"
        style={interactionOverlayStyle}
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
              style={interactionSquareStyle}
              type="button"
            />
          );
        })}
      </div>

      <div
        className="board-scene-fallback"
        data-testid="board-scene-fallback"
        style={fallbackOnlyStyle}
      >
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
}: {
  cameraView: BoardCameraView;
}) {
  const camera = useThree((state) => state.camera);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    const [cameraX, cameraY, cameraZ] = getCameraPosition(cameraView);

    setCameraPosition(camera, cameraX, cameraY, cameraZ);
    camera.lookAt(0, 0, 0);
    controlsRef.current?.target.set(0, 0, 0);
    controlsRef.current?.update();
  }, [camera, cameraView]);

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
