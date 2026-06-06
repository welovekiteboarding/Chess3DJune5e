import { OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { type Camera, Matrix4, MOUSE, TOUCH, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  startTransition,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PropsWithChildren,
  type WheelEvent as ReactWheelEvent,
} from 'react';

import type { ChessPiecePlacement, ChessSquare } from '../chess/chessTypes';
import { ChessPieceMesh } from './pieces';

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
  onCameraViewChange?: (cameraView: BoardCameraView) => void;
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
const minCameraDistance = 4.8;
const maxCameraDistance = 16.8;
const minCameraPolar = 0.1;
const maxCameraPolar = 1.36;
const cameraRotateStep = Math.PI / 8;
const cameraTiltStep = 0.12;
const cameraZoomStep = 1.1;
const cameraViewModeTolerance = {
  azimuth: 0.04,
  distance: 0.12,
  polar: 0.04,
} as const;
const defaultCameraView: BoardCameraView = {
  azimuth: 0,
  distance: 10.4,
  polar: 0.68,
  viewMode: 'default',
};
const overheadCameraView: BoardCameraView = {
  azimuth: 0,
  distance: 8.8,
  polar: 0.14,
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
const cameraTarget = new Vector3(0, 0, 0);

function DefaultBoardSceneCanvas({
  cameraView = defaultCameraView,
  children,
  className,
  onCameraViewChange,
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
        onCameraViewChange={onCameraViewChange}
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
  const canvasShellRef = useRef<HTMLDivElement | null>(null);
  const interactionHitTargetOverlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function restoreHitTargetPointerEvents() {
      setHitTargetPointerEvents(interactionHitTargetOverlayRef.current, 'auto');
    }

    window.addEventListener('pointerup', restoreHitTargetPointerEvents);
    window.addEventListener('pointercancel', restoreHitTargetPointerEvents);
    window.addEventListener('blur', restoreHitTargetPointerEvents);

    return () => {
      window.removeEventListener('pointerup', restoreHitTargetPointerEvents);
      window.removeEventListener('pointercancel', restoreHitTargetPointerEvents);
      window.removeEventListener('blur', restoreHitTargetPointerEvents);
    };
  }, []);

  function handleCameraViewChange(nextCameraView: BoardCameraView) {
    setCameraView((currentCameraView) =>
      areCameraViewsEqual(currentCameraView, nextCameraView)
        ? currentCameraView
        : nextCameraView,
    );
  }

  function handleCameraAction(action: BoardCameraAction) {
    setCameraView((currentCameraView) =>
      getNextCameraView(currentCameraView, action),
    );
  }

  function handleInteractionHitTargetOverlayMouseDownCapture(
    event: ReactMouseEvent<HTMLDivElement>,
  ) {
    if (event.button === 0) {
      return;
    }

    event.preventDefault();
    setHitTargetPointerEvents(interactionHitTargetOverlayRef.current, 'none');
    forwardSecondaryPointerDownToCanvas(canvasShellRef.current, event);
  }

  function handleInteractionHitTargetOverlayWheelCapture(
    event: ReactWheelEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    forwardWheelToCanvas(canvasShellRef.current, event);
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
        onContextMenu={(event) => event.preventDefault()}
        ref={canvasShellRef}
      >
        <CanvasBoundary
          cameraView={cameraView}
          className="board-scene-canvas"
          onCameraViewChange={handleCameraViewChange}
          onSquareScreenPositionsChange={(nextSquareScreenPositions) => {
            startTransition(() => {
              setSquareScreenPositions(nextSquareScreenPositions);
            });
          }}
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
                <ChessPieceMesh
                  key={piecePlacement.renderId}
                  onSelect={onSquareSelect}
                  piecePlacement={piecePlacement}
                  position={position}
                />
              );
            })}
          </group>
        </CanvasBoundary>

        <div
          className="board-scene-hit-target-overlay"
          data-testid="board-scene-hit-target-overlay"
          onMouseDownCapture={handleInteractionHitTargetOverlayMouseDownCapture}
          onWheelCapture={handleInteractionHitTargetOverlayWheelCapture}
          ref={interactionHitTargetOverlayRef}
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
  onCameraViewChange,
  onSquareScreenPositionsChange,
}: {
  cameraView: BoardCameraView;
  onCameraViewChange?: (cameraView: BoardCameraView) => void;
  onSquareScreenPositionsChange?: (
    squareScreenPositions: BoardSquareScreenPositions,
  ) => void;
}) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const lastSquareScreenPositionsRef = useRef('');
  const lastCameraViewSnapshotRef = useRef(getCameraViewSnapshot(cameraView));

  useLayoutEffect(() => {
    const controls = controlsRef.current;
    const nextCameraViewSnapshot = getCameraViewSnapshot(cameraView);

    if (controls) {
      const currentCameraViewSnapshot = getCameraViewSnapshot(
        getCameraViewFromPosition(camera, controls.target),
      );

      if (currentCameraViewSnapshot !== nextCameraViewSnapshot) {
        applyCameraViewToControls(controls, camera, cameraView);
      }
    } else {
      const [cameraX, cameraY, cameraZ] = getCameraPosition(cameraView);

      setCameraPosition(camera, cameraX, cameraY, cameraZ);
      camera.lookAt(cameraTarget);
    }

    lastCameraViewSnapshotRef.current = nextCameraViewSnapshot;
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

  function handleControlsChange() {
    const controls = controlsRef.current;

    if (!controls || !onCameraViewChange) {
      return;
    }

    const nextCameraView = getCameraViewFromPosition(camera, controls.target);
    const nextCameraViewSnapshot = getCameraViewSnapshot(nextCameraView);

    if (nextCameraViewSnapshot === lastCameraViewSnapshotRef.current) {
      return;
    }

    lastCameraViewSnapshotRef.current = nextCameraViewSnapshot;
    onCameraViewChange(nextCameraView);
  }

  return (
    <OrbitControls
      ref={controlsRef}
      dampingFactor={0.09}
      enableDamping
      enablePan={false}
      makeDefault
      maxDistance={maxCameraDistance}
      maxPolarAngle={maxCameraPolar}
      minDistance={minCameraDistance}
      minPolarAngle={minCameraPolar}
      mouseButtons={{
        LEFT: MOUSE.ROTATE,
        MIDDLE: MOUSE.DOLLY,
        RIGHT: MOUSE.ROTATE,
      }}
      onChange={handleControlsChange}
      rotateSpeed={0.72}
      target={[cameraTarget.x, cameraTarget.y, cameraTarget.z]}
      touches={{
        ONE: TOUCH.ROTATE,
        TWO: TOUCH.DOLLY_PAN,
      }}
      zoomSpeed={1.15}
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
        azimuth: normalizeAngle(currentCameraView.azimuth - cameraRotateStep),
      });
    case 'rotate-right':
      return createCustomCameraView(currentCameraView, {
        azimuth: normalizeAngle(currentCameraView.azimuth + cameraRotateStep),
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

function applyCameraViewToControls(
  controls: OrbitControlsImpl,
  camera: Camera,
  cameraView: BoardCameraView,
) {
  const [cameraX, cameraY, cameraZ] = getCameraPosition(cameraView);

  controls.target.copy(cameraTarget);
  setCameraPosition(camera, cameraX, cameraY, cameraZ);
  camera.lookAt(cameraTarget);
  controls.update();
}

function getCameraViewFromPosition(
  camera: Camera,
  target: Vector3 = cameraTarget,
): BoardCameraView {
  const offsetVector = camera.position.clone().sub(target);
  const distance = clamp(offsetVector.length(), minCameraDistance, maxCameraDistance);
  const horizontalDistance = Math.hypot(offsetVector.x, offsetVector.z);
  const normalizedCameraView = {
    azimuth: normalizeAngle(Math.atan2(offsetVector.x, offsetVector.z)),
    distance: roundToTwoDecimals(distance),
    polar: roundToTwoDecimals(
      clamp(Math.atan2(horizontalDistance, offsetVector.y), minCameraPolar, maxCameraPolar),
    ),
    viewMode: 'custom' as const,
  };

  return {
    ...normalizedCameraView,
    viewMode: resolveCameraViewMode(normalizedCameraView),
  };
}

function resolveCameraViewMode(cameraView: Omit<BoardCameraView, 'viewMode'>): BoardCameraViewMode {
  if (isWithinCameraViewTolerance(cameraView, defaultCameraView)) {
    return 'default';
  }

  if (isWithinCameraViewTolerance(cameraView, overheadCameraView)) {
    return 'overhead';
  }

  return 'custom';
}

function isWithinCameraViewTolerance(
  cameraView: Omit<BoardCameraView, 'viewMode'>,
  targetCameraView: BoardCameraView,
): boolean {
  return (
    Math.abs(normalizeAngle(cameraView.azimuth - targetCameraView.azimuth)) <=
      cameraViewModeTolerance.azimuth &&
    Math.abs(cameraView.distance - targetCameraView.distance) <=
      cameraViewModeTolerance.distance &&
    Math.abs(cameraView.polar - targetCameraView.polar) <=
      cameraViewModeTolerance.polar
  );
}

function areCameraViewsEqual(
  currentCameraView: BoardCameraView,
  nextCameraView: BoardCameraView,
) {
  return getCameraViewSnapshot(currentCameraView) === getCameraViewSnapshot(nextCameraView);
}

function getCameraViewSnapshot(cameraView: BoardCameraView): string {
  return `${cameraView.viewMode}:${roundToTwoDecimals(normalizeAngle(cameraView.azimuth))}:${roundToTwoDecimals(cameraView.distance)}:${roundToTwoDecimals(cameraView.polar)}`;
}

function setHitTargetPointerEvents(
  interactionHitTargetOverlayElement: HTMLDivElement | null,
  pointerEvents: 'auto' | 'none',
) {
  interactionHitTargetOverlayElement
    ?.querySelectorAll<HTMLElement>('[data-testid^="board-hit-target-"]')
    .forEach((element) => {
      element.style.pointerEvents = pointerEvents;
    });
}

function forwardSecondaryPointerDownToCanvas(
  canvasShellElement: HTMLDivElement | null,
  event: ReactMouseEvent<HTMLDivElement>,
) {
  const canvasElement = canvasShellElement?.querySelector('canvas');

  if (!canvasElement) {
    return;
  }

  canvasElement.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      button: event.button,
      buttons: event.buttons,
      cancelable: true,
      clientX: event.clientX,
      clientY: event.clientY,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
    }),
  );
}

function forwardWheelToCanvas(
  canvasShellElement: HTMLDivElement | null,
  event: ReactWheelEvent<HTMLDivElement>,
) {
  const canvasElement = canvasShellElement?.querySelector('canvas');

  if (!canvasElement) {
    return;
  }

  canvasElement.dispatchEvent(
    new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: event.clientX,
      clientY: event.clientY,
      composed: true,
      deltaMode: event.deltaMode,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaZ: event.deltaZ,
    }),
  );
}

function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.min(Math.max(value, minValue), maxValue);
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
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
