import { OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { type Camera, MOUSE, type Object3D, Raycaster, TOUCH, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
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
import {
  ChessPieceMesh,
  getPieceAccessibleLabel,
  pieceBaseContactLocalY,
  pieceGroundingConvention,
  pieceMarkerByType,
} from './pieces';
import {
  boardFramePalette,
  boardGeometry,
  boardVisualContract,
  type BoardSquareFinish,
  getBoardFrameCornerFinish,
  getBoardFrameSegmentFinish,
  getBoardSquareFinish,
} from './materials';
import { SceneLighting, sceneLightingContract } from './lighting';

type BoardCameraViewMode = 'custom' | 'default' | 'overhead';
type BoardSceneCameraRayDiagnosticsMode = 'disabled' | 'representative';

interface BoardCameraView {
  azimuth: number;
  distance: number;
  polar: number;
  viewMode: BoardCameraViewMode;
}

export interface BoardSceneCanvasProps extends PropsWithChildren {
  cameraRayDiagnosticsSquares?: readonly ChessSquare[];
  cameraView?: BoardCameraView;
  className?: string;
  onCameraTelemetryChange?: (
    cameraTelemetry: BoardSceneCameraTelemetry,
  ) => void;
  onSquareCameraRayStatesChange?: (
    squareCameraRayStates: BoardSquareCameraRayStates,
  ) => void;
  onCameraViewChange?: (cameraView: BoardCameraView) => void;
  onSquareScreenPositionsChange?: (
    squareScreenPositions: BoardSquareScreenPositions,
  ) => void;
}

export interface BoardSceneProps {
  cameraRayDiagnosticsMode?: BoardSceneCameraRayDiagnosticsMode;
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

interface BoardSquareCameraRayState {
  clear: boolean;
  hit: string;
}

interface BoardSceneCameraTelemetry {
  maxDistance: number;
  minDistance: number;
  screenUpAngle: number;
}

type PieceAnimationState = 'idle' | 'running';
type PiecePosition3D = readonly [number, number, number];

interface ActivePieceAnimation {
  durationMs: number;
  fromPosition: PiecePosition3D;
  fromSquare: ChessSquare;
  startedAtMs: number;
  toPosition: PiecePosition3D;
  toSquare: ChessSquare;
}

interface PieceAnimationMetadata {
  durationMs: number;
  fromSquare: ChessSquare;
  state: PieceAnimationState;
  toSquare: ChessSquare;
}

type LegalDestinationMarkerVariant = 'dot';

type BoardSquareScreenPositions = Partial<
  Record<ChessSquare, BoardSquareScreenPosition>
>;
type BoardSquareCameraRayStates = Partial<
  Record<ChessSquare, BoardSquareCameraRayState>
>;

const boardSquares = createBoardSquares();
const boardSquaresBySquare = new Map(
  boardSquares.map((boardSquare) => [boardSquare.square, boardSquare] as const),
);
const emptyPiecePlacements: readonly ChessPiecePlacement[] = [];
const emptySquareCameraRayStates: BoardSquareCameraRayStates = {};
const squareSize = boardGeometry.squareSize;
const boardSquareHeight = boardGeometry.squareHeight;
const boardHalfSpan = boardGeometry.boardHalfSpan;
const boardSquareSurfaceY = boardGeometry.squareSurfaceY;
const pieceMoveAnimationDurationMs = 260;
const minCameraDistance = 3.6;
const maxCameraDistance = 24;
const minCameraPolar = 0.1;
const maxCameraPolar = 1.36;
const cameraRotateStep = Math.PI / 8;
const cameraTiltStep = 0.12;
const cameraZoomStep = 1.1;
const wheelZoomSensitivity = 0.0018;
const cameraViewModeTolerance = {
  azimuth: 0.04,
  distance: 0.12,
  polar: 0.04,
} as const;
const moveHighlightVisualContract = {
  legalMarkerOccupiedStyle: 'dot',
  legalMarkerPalette: 'green',
  legalMarkerStyle: 'dot',
  legalMarkerTreatment: 'dot',
  selectedHighlightContrast: 'single-surface',
  selectedHighlightPalette: 'green',
  selectedHighlightShape: 'full-square',
  selectedHighlightTreatment: 'overlay',
} as const;
const moveHighlightPalette = {
  legalDotColor: '#5d9d63',
  legalDotGlow: '#9ed9a4',
  selectedOverlayColor: '#4c9f58',
  selectedOverlayGlow: '#8fd79a',
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
const boardSceneCameraRayDiagnosticsSearchParam = 'camera-ray-diagnostics';
const disabledCameraRayDiagnosticsSquares: readonly ChessSquare[] = [];
const representativeCameraRayDiagnosticsSquares = [
  'd4',
  'e4',
  'd5',
  'e5',
] as const satisfies readonly ChessSquare[];
const interactionHitTargetMinSizePx = 18;
const interactionHitTargetMaxSizePx = 72;
const interactionHitTargetViewportMarginPx = interactionHitTargetMaxSizePx / 2;
const cameraTarget = new Vector3(0, 0, 0);
const squareCameraRayTargetLift = 0.005;
const squareCameraRayDistanceTolerance = 0.01;
const squareCameraRaycaster = new Raycaster();
const squareCameraRayOrigin = new Vector3();
const squareCameraRayDirection = new Vector3();

function DefaultBoardSceneCanvas({
  cameraRayDiagnosticsSquares = disabledCameraRayDiagnosticsSquares,
  cameraView = defaultCameraView,
  children,
  className,
  onCameraTelemetryChange,
  onSquareCameraRayStatesChange,
  onCameraViewChange,
  onSquareScreenPositionsChange,
}: BoardSceneCanvasProps) {
  const [cameraX, cameraY, cameraZ] = getCameraPosition(cameraView);

  return (
    <Canvas
      camera={{ position: [cameraX, cameraY, cameraZ], fov: 42 }}
      className={className}
      gl={{ alpha: false }}
      shadows
    >
      <BoardSceneCameraRig
        cameraRayDiagnosticsSquares={cameraRayDiagnosticsSquares}
        cameraView={cameraView}
        onCameraTelemetryChange={onCameraTelemetryChange}
        onSquareCameraRayStatesChange={onSquareCameraRayStatesChange}
        onCameraViewChange={onCameraViewChange}
        onSquareScreenPositionsChange={onSquareScreenPositionsChange}
      />
      {children}
    </Canvas>
  );
}

export function BoardScene({
  cameraRayDiagnosticsMode,
  selectedSquare,
  legalDestinationSquares,
  piecePlacements = emptyPiecePlacements,
  onSquareSelect,
  CanvasBoundary = DefaultBoardSceneCanvas,
  className,
}: BoardSceneProps) {
  const resolvedCameraRayDiagnosticsMode =
    getResolvedBoardSceneCameraRayDiagnosticsMode(cameraRayDiagnosticsMode);
  const cameraRayDiagnosticsSquares = getBoardSceneCameraRayDiagnosticsSquares(
    resolvedCameraRayDiagnosticsMode,
  );
  const isCameraRayDiagnosticsEnabled = cameraRayDiagnosticsSquares.length > 0;
  const legalDestinationSet = new Set(legalDestinationSquares);
  const occupiedSquares = new Set(piecePlacements.map(({ square }) => square));
  const legalDestinationMarkers = Array.from(legalDestinationSet).map((square) => ({
    occupied: occupiedSquares.has(square),
    square,
    treatment: getLegalDestinationMarkerTreatment(),
    variant: getLegalDestinationMarkerVariant(),
  }));
  const [cameraView, setCameraView] = useState(defaultCameraView);
  const [cameraTelemetry, setCameraTelemetry] = useState<BoardSceneCameraTelemetry>(
    () => ({
      maxDistance: maxCameraDistance,
      minDistance: minCameraDistance,
      screenUpAngle: 0,
    }),
  );
  const [squareCameraRayStates, setSquareCameraRayStates] =
    useState<BoardSquareCameraRayStates>({});
  const renderedSquareCameraRayStates = isCameraRayDiagnosticsEnabled
    ? squareCameraRayStates
    : emptySquareCameraRayStates;
  const [squareScreenPositions, setSquareScreenPositions] =
    useState<BoardSquareScreenPositions>({});
  const prefersReducedMotion = usePrefersReducedMotion();
  const [activePieceAnimationCount, setActivePieceAnimationCount] = useState(0);
  const [pieceAnimationMetadataByRenderId, setPieceAnimationMetadataByRenderId] =
    useState<Record<string, PieceAnimationMetadata>>({});
  const [pieceAnimationPositionsByRenderId, setPieceAnimationPositionsByRenderId] =
    useState<Record<string, PiecePosition3D>>({});
  const canvasShellRef = useRef<HTMLDivElement | null>(null);
  const interactionHitTargetOverlayRef = useRef<HTMLDivElement | null>(null);
  const isMountedRef = useRef(true);
  const activePieceAnimationsRef = useRef<Record<string, ActivePieceAnimation>>({});
  const animationFrameRef = useRef<number | null>(null);
  const previousPiecePlacementsRef = useRef(piecePlacements);
  const renderedActivePieceAnimationCount = prefersReducedMotion
    ? 0
    : activePieceAnimationCount;
  const renderedPieceAnimationMetadataByRenderId = prefersReducedMotion
    ? {}
    : pieceAnimationMetadataByRenderId;
  const renderedPieceAnimationPositionsByRenderId = prefersReducedMotion
    ? {}
    : pieceAnimationPositionsByRenderId;

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

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      activePieceAnimationsRef.current = {};
      cancelScheduledAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const previousPiecePlacements = previousPiecePlacementsRef.current;
    previousPiecePlacementsRef.current = piecePlacements;

    const activeRenderIds = new Set(piecePlacements.map(({ renderId }) => renderId));
    activePieceAnimationsRef.current = Object.fromEntries(
      Object.entries(activePieceAnimationsRef.current).filter(([renderId]) =>
        activeRenderIds.has(renderId),
      ),
    );

    if (prefersReducedMotion) {
      activePieceAnimationsRef.current = {};
      cancelScheduledAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      return;
    }

    const movedPieceAnimations = getNormalMovePieceAnimations(
      previousPiecePlacements,
      piecePlacements,
    );

    if (movedPieceAnimations.length === 0) {
      syncPieceAnimationFrame({
        activePieceAnimationsRef,
        isMountedRef,
        nowMs: getAnimationTimestamp(),
        setActivePieceAnimationCount,
        setPieceAnimationMetadataByRenderId,
        setPieceAnimationPositionsByRenderId,
      });
      return;
    }

    const animationStartTimeMs = getAnimationTimestamp();

    movedPieceAnimations.forEach((movedPieceAnimation) => {
      activePieceAnimationsRef.current[movedPieceAnimation.to.renderId] = {
        durationMs: pieceMoveAnimationDurationMs,
        fromPosition: getPiecePosition(movedPieceAnimation.from.square),
        fromSquare: movedPieceAnimation.from.square,
        startedAtMs: animationStartTimeMs,
        toPosition: getPiecePosition(movedPieceAnimation.to.square),
        toSquare: movedPieceAnimation.to.square,
      };
    });

    syncPieceAnimationFrame({
      activePieceAnimationsRef,
      isMountedRef,
      nowMs: getAnimationTimestamp(),
      setActivePieceAnimationCount,
      setPieceAnimationMetadataByRenderId,
      setPieceAnimationPositionsByRenderId,
    });
    schedulePieceAnimationFrame({
      activePieceAnimationsRef,
      animationFrameRef,
      isMountedRef,
      setActivePieceAnimationCount,
      setPieceAnimationMetadataByRenderId,
      setPieceAnimationPositionsByRenderId,
    });
  }, [piecePlacements, prefersReducedMotion]);

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

  function getRenderedPieceAnimationMetadata(piecePlacement: ChessPiecePlacement) {
    return (
      renderedPieceAnimationMetadataByRenderId[piecePlacement.renderId] ?? {
        durationMs: prefersReducedMotion ? 0 : pieceMoveAnimationDurationMs,
        fromSquare: piecePlacement.square,
        state: 'idle',
        toSquare: piecePlacement.square,
      }
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

  function handleCanvasShellWheelCapture(
    event: ReactWheelEvent<HTMLDivElement>,
  ) {
    event.preventDefault();

    setCameraView((currentCameraView) =>
      getNextCameraViewFromWheelDelta(currentCameraView, {
        deltaMode: event.deltaMode,
        deltaY: event.deltaY,
      }),
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
        onContextMenu={(event) => event.preventDefault()}
        onWheelCapture={handleCanvasShellWheelCapture}
        ref={canvasShellRef}
      >
        <CanvasBoundary
          cameraRayDiagnosticsSquares={cameraRayDiagnosticsSquares}
          cameraView={cameraView}
          className="board-scene-canvas"
          onCameraTelemetryChange={(nextCameraTelemetry) => {
            setCameraTelemetry((currentCameraTelemetry) =>
              areCameraTelemetryEqual(
                currentCameraTelemetry,
                nextCameraTelemetry,
              )
                ? currentCameraTelemetry
                : nextCameraTelemetry,
            );
          }}
          onSquareCameraRayStatesChange={
            isCameraRayDiagnosticsEnabled
              ? (nextSquareCameraRayStates) => {
                  setSquareCameraRayStates((currentSquareCameraRayStates) =>
                    areSquareCameraRayStatesEqual(
                      currentSquareCameraRayStates,
                      nextSquareCameraRayStates,
                    )
                      ? currentSquareCameraRayStates
                      : nextSquareCameraRayStates,
                  );
                }
              : undefined
          }
          onCameraViewChange={handleCameraViewChange}
          onSquareScreenPositionsChange={(nextSquareScreenPositions) => {
            setSquareScreenPositions(nextSquareScreenPositions);
          }}
        >
          <SceneLighting />
          <group>
            <SceneBackdrop />
            <BoardFrame />
            {boardSquares.map((boardSquare) => {
              const squareFinish = getBoardSquareFinish(boardSquare);
              const [x, z] = getSquarePosition(boardSquare);
              const isSelected = boardSquare.square === selectedSquare;
              const isLegalDestination = legalDestinationSet.has(boardSquare.square);

              return (
                <group
                  key={boardSquare.square}
                  onClick={(event) =>
                    handleSceneSquareClick(event, boardSquare.square, onSquareSelect)
                  }
                  position={[x, 0, z]}
                >
                  <BoardSquareTile finish={squareFinish} />
                  {isSelected ? <SelectedSquareHighlight /> : null}
                  {isLegalDestination ? <LegalDestinationMarker /> : null}
                </group>
              );
            })}
            {piecePlacements.map((piecePlacement) => {
              const position =
                renderedPieceAnimationPositionsByRenderId[piecePlacement.renderId] ??
                getPiecePosition(piecePlacement.square);

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
          data-azimuth={cameraView.azimuth}
          data-distance={cameraView.distance}
          data-max-distance={cameraTelemetry.maxDistance}
          data-min-distance={cameraTelemetry.minDistance}
          data-polar={cameraView.polar}
          data-screen-up-angle={cameraTelemetry.screenUpAngle}
          data-testid="board-camera-state"
          data-view-mode={cameraView.viewMode}
          role="status"
        >
          {getCameraViewLabel(cameraView.viewMode)}
        </p>
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
                data-camera-ray-clear={String(
                  renderedSquareCameraRayStates[boardSquare.square]?.clear ?? false,
                )}
                data-camera-ray-hit={
                  renderedSquareCameraRayStates[boardSquare.square]?.hit ?? 'none'
                }
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
          {legalDestinationMarkers.map(({ square }) => (
            <li
              data-square={square}
              data-testid={`legal-destination-square-${square}`}
              key={square}
            >
              {square}
            </li>
          ))}
        </ul>
        <ul aria-label="Move highlight markers">
          {selectedSquare ? (
            <li
              data-highlight-contrast={
                moveHighlightVisualContract.selectedHighlightContrast
              }
              data-highlight-palette={
                moveHighlightVisualContract.selectedHighlightPalette
              }
              data-highlight-shape={
                moveHighlightVisualContract.selectedHighlightShape
              }
              data-highlight-treatment={
                moveHighlightVisualContract.selectedHighlightTreatment
              }
              data-square={selectedSquare}
              data-testid={`selected-square-highlight-${selectedSquare}`}
            >
              {selectedSquare}
            </li>
          ) : null}
          {legalDestinationMarkers.map(({ occupied, square, treatment, variant }) => (
            <li
              data-marker-palette={moveHighlightVisualContract.legalMarkerPalette}
              data-marker-treatment={treatment}
              data-marker-variant={variant}
              data-occupied={String(occupied)}
              data-square={square}
              data-testid={`legal-destination-marker-${square}`}
              key={`marker-${square}`}
            >
              {square}
            </li>
          ))}
        </ul>
        <ul aria-label="Piece placements">
          {piecePlacements.map((piecePlacement) => {
            const pieceAnimationMetadata =
              getRenderedPieceAnimationMetadata(piecePlacement);

            return (
              <li
                data-animation-duration-ms={pieceAnimationMetadata.durationMs}
                data-animation-from-square={pieceAnimationMetadata.fromSquare}
                data-animation-state={pieceAnimationMetadata.state}
                data-animation-to-square={pieceAnimationMetadata.toSquare}
                data-board-surface-y={formatGroundingValue(boardSquareSurfaceY)}
                data-color={piecePlacement.color}
                data-grounding-convention={pieceGroundingConvention}
                data-local-base-y={formatGroundingValue(pieceBaseContactLocalY)}
                data-placement-y={formatGroundingValue(
                  getGroundedPiecePlacementY(),
                )}
                data-piece-marker={pieceMarkerByType[piecePlacement.piece]}
                data-piece={piecePlacement.piece}
                data-render-id={piecePlacement.renderId}
                data-square={piecePlacement.square}
                data-testid="board-piece"
                key={piecePlacement.renderId}
              >
                <span
                  aria-label={getPieceAccessibleLabel(piecePlacement)}
                  data-animation-duration-ms={pieceAnimationMetadata.durationMs}
                  data-animation-from-square={pieceAnimationMetadata.fromSquare}
                  data-animation-state={pieceAnimationMetadata.state}
                  data-animation-to-square={pieceAnimationMetadata.toSquare}
                  data-board-surface-y={formatGroundingValue(boardSquareSurfaceY)}
                  data-piece-color={piecePlacement.color}
                  data-piece-marker={pieceMarkerByType[piecePlacement.piece]}
                  data-piece-type={piecePlacement.piece}
                  data-placement-y={formatGroundingValue(
                    getGroundedPiecePlacementY(),
                  )}
                  data-square={piecePlacement.square}
                  data-testid={`board-piece-${piecePlacement.renderId}`}
                >
                  {piecePlacement.color} {piecePlacement.piece} on {piecePlacement.square}
                </span>
              </li>
            );
          })}
        </ul>
        <div
          data-active-piece-animations={renderedActivePieceAnimationCount}
          data-animation-duration-ms={prefersReducedMotion ? 0 : pieceMoveAnimationDurationMs}
          data-prefers-reduced-motion={String(prefersReducedMotion)}
          data-testid="board-piece-animation-state"
        />
        <div
          data-corner-decoration-treatment={
            boardVisualContract.cornerDecorationTreatment
          }
          data-corner-join-style={boardVisualContract.cornerJoinStyle}
          data-corner-surface-treatment={
            boardVisualContract.cornerSurfaceTreatment
          }
          data-corner-cap-height={formatContractGeometryValue(
            boardGeometry.frameCornerCapHeight,
          )}
          data-corner-cap-lift={formatContractGeometryValue(
            boardGeometry.frameCornerCapLift,
          )}
          data-corner-cap-size={formatContractGeometryValue(
            boardGeometry.frameCornerCapSize,
          )}
          data-dark-square-material={boardVisualContract.darkSquareMaterialId}
          data-frame-rail-span={formatGroundingValue(boardGeometry.frameRailSpan)}
          data-frame-style={boardVisualContract.frameStyleId}
          data-legal-marker-occupied-style={
            moveHighlightVisualContract.legalMarkerOccupiedStyle
          }
          data-legal-marker-palette={moveHighlightVisualContract.legalMarkerPalette}
          data-legal-marker-style={boardVisualContract.legalMarkerStyleId}
          data-legal-marker-treatment={
            moveHighlightVisualContract.legalMarkerTreatment
          }
          data-light-square-material={boardVisualContract.lightSquareMaterialId}
          data-square-decoration-inset={boardGeometry.squareTopInset}
          data-square-decoration-treatment={
            boardVisualContract.squareDecorationTreatment
          }
          data-square-surface-treatment={
            boardVisualContract.squareSurfaceTreatment
          }
          data-selected-highlight-contrast={
            moveHighlightVisualContract.selectedHighlightContrast
          }
          data-selected-highlight-palette={
            moveHighlightVisualContract.selectedHighlightPalette
          }
          data-selected-highlight-shape={
            moveHighlightVisualContract.selectedHighlightShape
          }
          data-selected-highlight-treatment={
            moveHighlightVisualContract.selectedHighlightTreatment
          }
          data-selected-marker-style={boardVisualContract.selectedMarkerStyleId}
          data-testid="board-visual-contract"
        />
        <div
          data-ambient-fill-intensity={sceneLightingContract.ambientFill.intensity}
          data-backdrop-treatment={sceneLightingContract.backdrop.treatment}
          data-board-occluder-policy={
            sceneLightingContract.backdrop.boardOccluderPolicy
          }
          data-fill-light={sceneLightingContract.fillLight.id}
          data-key-light={sceneLightingContract.keyLight.id}
          data-key-shadow-map-size={sceneLightingContract.keyLight.shadow.mapSize}
          data-lighting-rig={sceneLightingContract.rigId}
          data-playability={sceneLightingContract.playability}
          data-rim-light={sceneLightingContract.rimLight.id}
          data-shadow-style={sceneLightingContract.shadowStyle}
          data-testid="board-lighting-contract"
        />
      </div>
    </section>
  );
}

function SceneBackdrop() {
  const { backdrop } = sceneLightingContract;

  return (
    <>
      <mesh
        position={[0, -0.34, 0]}
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        userData={{ boardSceneOcclusionRole: 'backdrop-floor' }}
      >
        <circleGeometry args={[11.5, 64]} />
        <meshStandardMaterial
          color={backdrop.floorColor}
          emissive={backdrop.floorEmissive}
          emissiveIntensity={0.28}
          roughness={0.96}
        />
      </mesh>
    </>
  );
}

function BoardSquareTile({ finish }: { finish: BoardSquareFinish }) {
  const edgeThickness = (squareSize - boardGeometry.squareFieldScale) / 2;
  const edgeOffset = squareSize / 2 - edgeThickness / 2;
  const edgeY = (boardGeometry.squareBaseHeight - boardSquareHeight) / 2;
  const edgeRuns = [
    {
      args: [squareSize, boardGeometry.squareBaseHeight, edgeThickness],
      position: [0, edgeY, edgeOffset],
    },
    {
      args: [squareSize, boardGeometry.squareBaseHeight, edgeThickness],
      position: [0, edgeY, -edgeOffset],
    },
    {
      args: [edgeThickness, boardGeometry.squareBaseHeight, boardGeometry.squareFieldScale],
      position: [edgeOffset, edgeY, 0],
    },
    {
      args: [edgeThickness, boardGeometry.squareBaseHeight, boardGeometry.squareFieldScale],
      position: [-edgeOffset, edgeY, 0],
    },
  ] as const;

  return (
    <>
      {edgeRuns.map(({ args, position }, edgeIndex) => (
        <mesh castShadow key={edgeIndex} position={position} receiveShadow>
          <boxGeometry args={args} />
          <meshStandardMaterial
            color={finish.edgeColor}
            metalness={0.02}
            roughness={finish.edgeRoughness}
          />
        </mesh>
      ))}
      <mesh
        castShadow
        position={[0, boardSquareSurfaceY - boardGeometry.squareTopHeight / 2, 0]}
        receiveShadow
        userData={{ boardSceneOcclusionRole: 'board-square-top' }}
      >
        <boxGeometry
          args={[
            boardGeometry.squareFieldScale,
            boardGeometry.squareTopHeight,
            boardGeometry.squareFieldScale,
          ]}
        />
        <meshStandardMaterial
          color={finish.surfaceColor}
          metalness={finish.surfaceMetalness}
          roughness={finish.surfaceRoughness}
        />
      </mesh>
    </>
  );
}

function BoardFrame() {
  const playableHalfExtent = boardHalfSpan + squareSize / 2;
  const frameOuterSpan = boardGeometry.boardSpan + boardGeometry.frameOverhang * 2;
  const frameCornerOffset =
    playableHalfExtent + boardGeometry.frameRailThickness / 2;
  const sideRailLength = boardGeometry.frameRailSpan;
  const frameRailY = (boardGeometry.frameRailHeight - boardSquareHeight) / 2;
  const plinthY = -boardGeometry.plinthHeight / 2 - 0.08;
  const innerTrimY = boardSquareSurfaceY - boardGeometry.innerTrimHeight / 2;
  const frameSegments = [
    {
      args: [
        boardGeometry.frameRailSpan,
        boardGeometry.frameRailHeight,
        boardGeometry.frameRailThickness,
      ] as [number, number, number],
      position: [0, frameRailY, frameCornerOffset] as [number, number, number],
    },
    {
      args: [
        boardGeometry.frameRailSpan,
        boardGeometry.frameRailHeight,
        boardGeometry.frameRailThickness,
      ] as [number, number, number],
      position: [0, frameRailY, -frameCornerOffset] as [number, number, number],
    },
    {
      args: [
        boardGeometry.frameRailThickness,
        boardGeometry.frameRailHeight,
        sideRailLength,
      ] as [number, number, number],
      position: [frameCornerOffset, frameRailY, 0] as [number, number, number],
    },
    {
      args: [
        boardGeometry.frameRailThickness,
        boardGeometry.frameRailHeight,
        sideRailLength,
      ] as [number, number, number],
      position: [-frameCornerOffset, frameRailY, 0] as [number, number, number],
    },
  ];
  const frameCorners = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const;

  return (
    <>
      <mesh position={[0, plinthY, 0]} receiveShadow>
        <boxGeometry
          args={[
            frameOuterSpan + 0.36,
            boardGeometry.plinthHeight,
            frameOuterSpan + 0.36,
          ]}
        />
        <meshStandardMaterial
          color={boardFramePalette.plinthColor}
          metalness={0.12}
          roughness={0.86}
        />
      </mesh>
      <mesh position={[0, plinthY + 0.02, 0]} receiveShadow>
        <boxGeometry
          args={[
            frameOuterSpan + 0.1,
            boardGeometry.plinthHeight * 0.42,
            frameOuterSpan + 0.1,
          ]}
        />
        <meshStandardMaterial
          color={boardFramePalette.plinthEdgeColor}
          metalness={0.1}
          roughness={0.74}
        />
      </mesh>
      {frameSegments.map((segment, segmentIndex) => {
        const frameFinish = getBoardFrameSegmentFinish(segmentIndex);

        return (
          <group key={`frame-segment-${segmentIndex}`} position={segment.position}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={segment.args} />
              <meshStandardMaterial
                color={frameFinish.color}
                metalness={frameFinish.metalness}
                roughness={frameFinish.roughness}
              />
            </mesh>
            <mesh
              position={[0, boardGeometry.frameRailHeight * 0.16, 0]}
              receiveShadow
            >
              <boxGeometry
                args={[
                  segment.args[0] * (segmentIndex < 2 ? 0.92 : 0.78),
                  boardGeometry.frameRailHeight * 0.22,
                  segment.args[2] * (segmentIndex < 2 ? 0.34 : 0.78),
                ]}
              />
              <meshStandardMaterial
                color={frameFinish.highlightColor}
                metalness={0.18}
                roughness={0.42}
              />
            </mesh>
          </group>
        );
      })}
      {frameCorners.map(([xDirection, zDirection], cornerIndex) => {
        const cornerFinish = getBoardFrameCornerFinish(cornerIndex);
        const cornerCapY =
          boardGeometry.frameRailHeight / 2 +
          boardGeometry.frameCornerCapLift +
          boardGeometry.frameCornerCapHeight / 2;

        return (
          <group
            key={`frame-corner-${cornerIndex}`}
            position={[
              xDirection * frameCornerOffset,
              frameRailY,
              zDirection * frameCornerOffset,
            ]}
          >
            <mesh castShadow receiveShadow>
              <boxGeometry
                args={[
                  boardGeometry.frameCornerSize,
                  boardGeometry.frameRailHeight,
                  boardGeometry.frameCornerSize,
                ]}
              />
              <meshStandardMaterial
                color={cornerFinish.baseColor}
                metalness={0.12}
                roughness={0.52}
              />
            </mesh>
            <mesh
              castShadow
              position={[0, cornerCapY, 0]}
              receiveShadow
              rotation={[0, Math.PI / 4, 0]}
            >
              <boxGeometry
                args={[
                  boardGeometry.frameCornerCapSize,
                  boardGeometry.frameCornerCapHeight,
                  boardGeometry.frameCornerCapSize,
                ]}
              />
              <meshStandardMaterial
                color={cornerFinish.capColor}
                metalness={0.18}
                roughness={0.36}
              />
            </mesh>
          </group>
        );
      })}
      <mesh position={[0, innerTrimY, playableHalfExtent + boardGeometry.innerTrimThickness / 2]}>
        <boxGeometry
          args={[
            boardGeometry.boardSpan,
            boardGeometry.innerTrimHeight,
            boardGeometry.innerTrimThickness,
          ]}
        />
        <meshStandardMaterial color={boardFramePalette.innerTrimColor} roughness={0.58} />
      </mesh>
      <mesh position={[0, innerTrimY, -(playableHalfExtent + boardGeometry.innerTrimThickness / 2)]}>
        <boxGeometry
          args={[
            boardGeometry.boardSpan,
            boardGeometry.innerTrimHeight,
            boardGeometry.innerTrimThickness,
          ]}
        />
        <meshStandardMaterial color={boardFramePalette.innerTrimColor} roughness={0.58} />
      </mesh>
      <mesh position={[playableHalfExtent + boardGeometry.innerTrimThickness / 2, innerTrimY, 0]}>
        <boxGeometry
          args={[
            boardGeometry.innerTrimThickness,
            boardGeometry.innerTrimHeight,
            boardGeometry.boardSpan,
          ]}
        />
        <meshStandardMaterial color={boardFramePalette.innerTrimColor} roughness={0.58} />
      </mesh>
      <mesh position={[-(playableHalfExtent + boardGeometry.innerTrimThickness / 2), innerTrimY, 0]}>
        <boxGeometry
          args={[
            boardGeometry.innerTrimThickness,
            boardGeometry.innerTrimHeight,
            boardGeometry.boardSpan,
          ]}
        />
        <meshStandardMaterial color={boardFramePalette.innerTrimColor} roughness={0.58} />
      </mesh>
    </>
  );
}

function SelectedSquareHighlight() {
  const markerY = boardSquareSurfaceY + boardGeometry.markerLift * 0.3;

  return (
    <mesh
      position={[0, markerY, 0]}
      renderOrder={10}
      rotation={[-Math.PI / 2, 0, 0]}
      userData={{
        boardSceneOcclusionBehavior: 'ignore',
        boardSceneOcclusionRole: 'selected-square-highlight',
      }}
    >
      <planeGeometry args={[squareSize * 0.98, squareSize * 0.98]} />
      <meshStandardMaterial
        color={moveHighlightPalette.selectedOverlayColor}
        depthWrite={false}
        emissive={moveHighlightPalette.selectedOverlayGlow}
        emissiveIntensity={0.14}
        metalness={0.04}
        opacity={0.34}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
        roughness={0.46}
        transparent
      />
    </mesh>
  );
}

function LegalDestinationMarker() {
  const markerY = boardSquareSurfaceY + boardGeometry.markerLift * 0.34;

  return (
    <mesh
      position={[0, markerY, 0]}
      renderOrder={11}
      rotation={[-Math.PI / 2, 0, 0]}
      userData={{
        boardSceneOcclusionBehavior: 'ignore',
        boardSceneOcclusionRole: 'legal-destination-marker',
      }}
    >
      <circleGeometry args={[boardGeometry.legalMarkerRadius * 0.82, 32]} />
      <meshStandardMaterial
        color={moveHighlightPalette.legalDotColor}
        depthWrite={false}
        emissive={moveHighlightPalette.legalDotGlow}
        emissiveIntensity={0.14}
        metalness={0.02}
        opacity={0.46}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
        roughness={0.42}
        transparent
      />
    </mesh>
  );
}

function getLegalDestinationMarkerVariant(): LegalDestinationMarkerVariant {
  return moveHighlightVisualContract.legalMarkerStyle;
}

function getLegalDestinationMarkerTreatment() {
  return moveHighlightVisualContract.legalMarkerTreatment;
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
  cameraRayDiagnosticsSquares,
  cameraView,
  onCameraTelemetryChange,
  onSquareCameraRayStatesChange,
  onCameraViewChange,
  onSquareScreenPositionsChange,
}: {
  cameraRayDiagnosticsSquares: readonly ChessSquare[];
  cameraView: BoardCameraView;
  onCameraTelemetryChange?: (
    cameraTelemetry: BoardSceneCameraTelemetry,
  ) => void;
  onSquareCameraRayStatesChange?: (
    squareCameraRayStates: BoardSquareCameraRayStates,
  ) => void;
  onCameraViewChange?: (cameraView: BoardCameraView) => void;
  onSquareScreenPositionsChange?: (
    squareScreenPositions: BoardSquareScreenPositions,
  ) => void;
}) {
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const size = useThree((state) => state.size);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const lastCameraTelemetrySnapshotRef = useRef('');
  const lastSquareCameraRayStatesSnapshotRef = useRef('');
  const lastSquareScreenPositionsRef = useRef('');
  const lastCameraViewSnapshotRef = useRef(getCameraViewSnapshot(cameraView));
  const lastPublishedCameraViewRef = useRef(cameraView);

  useLayoutEffect(() => {
    const controls = controlsRef.current;
    const nextCameraViewSnapshot = getCameraViewSnapshot(cameraView);
    lastCameraViewSnapshotRef.current = nextCameraViewSnapshot;
    lastPublishedCameraViewRef.current = cameraView;

    if (controls) {
      const currentCameraViewSnapshot = getCameraViewSnapshot(
        getCameraViewFromPosition(
          camera,
          controls.target,
          lastPublishedCameraViewRef.current.azimuth,
        ),
      );

      if (currentCameraViewSnapshot !== nextCameraViewSnapshot) {
        applyCameraViewToControls(controls, camera, cameraView);
      }
    } else {
      const [cameraX, cameraY, cameraZ] = getCameraPosition(cameraView);

      setCameraPosition(camera, cameraX, cameraY, cameraZ);
      camera.lookAt(cameraTarget);
    }
    publishProjectedSquarePositions({
      camera,
      lastSquareScreenPositionsRef,
      onSquareScreenPositionsChange,
      size,
    });
    publishSquareCameraRayStates({
      camera,
      lastSquareCameraRayStatesSnapshotRef,
      onSquareCameraRayStatesChange,
      probeSquares: cameraRayDiagnosticsSquares,
      scene,
      size,
    });
    publishCameraTelemetry({
      camera,
      lastCameraTelemetrySnapshotRef,
      onCameraTelemetryChange,
      size,
    });
  }, [
    camera,
    cameraRayDiagnosticsSquares,
    cameraView,
    onCameraTelemetryChange,
    onSquareCameraRayStatesChange,
    onSquareScreenPositionsChange,
    scene,
    size,
  ]);

  useFrame(() => {
    publishProjectedSquarePositions({
      camera,
      lastSquareScreenPositionsRef,
      onSquareScreenPositionsChange,
      size,
    });
    publishSquareCameraRayStates({
      camera,
      lastSquareCameraRayStatesSnapshotRef,
      onSquareCameraRayStatesChange,
      probeSquares: cameraRayDiagnosticsSquares,
      scene,
      size,
    });
    publishCameraTelemetry({
      camera,
      lastCameraTelemetrySnapshotRef,
      onCameraTelemetryChange,
      size,
    });
  });

  function handleControlsChange() {
    const controls = controlsRef.current;

    if (!controls || !onCameraViewChange) {
      return;
    }

    const nextCameraView = getCameraViewFromPosition(
      camera,
      controls.target,
      lastPublishedCameraViewRef.current.azimuth,
    );
    const nextCameraViewSnapshot = getCameraViewSnapshot(nextCameraView);

    if (nextCameraViewSnapshot === lastCameraViewSnapshotRef.current) {
      return;
    }

    lastPublishedCameraViewRef.current = nextCameraView;
    lastCameraViewSnapshotRef.current = nextCameraViewSnapshot;
    onCameraViewChange(nextCameraView);
  }

  return (
    <OrbitControls
      ref={controlsRef}
      dampingFactor={0.09}
      enableDamping
      enablePan={false}
      enableZoom={false}
      makeDefault
      maxDistance={maxCameraDistance}
      maxPolarAngle={maxCameraPolar}
      minDistance={minCameraDistance}
      minPolarAngle={minCameraPolar}
      mouseButtons={{
        LEFT: MOUSE.ROTATE,
        MIDDLE: MOUSE.ROTATE,
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

function getBoardSquare(square: ChessSquare): BoardSquareDefinition {
  const boardSquare = boardSquaresBySquare.get(square);

  if (!boardSquare) {
    throw new Error(`Unknown board square: ${square}`);
  }

  return boardSquare;
}

function getPiecePosition(square: ChessSquare): [number, number, number] {
  const [x, z] = getSquarePosition(getBoardSquare(square));
  return [x, getGroundedPiecePlacementY(), z];
}

function getGroundedPiecePlacementY() {
  return boardSquareSurfaceY - pieceBaseContactLocalY;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const reducedMotionMediaQuery = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    );
    const handleChange = () => {
      setPrefersReducedMotion(reducedMotionMediaQuery.matches);
    };

    handleChange();

    if (typeof reducedMotionMediaQuery.addEventListener === 'function') {
      reducedMotionMediaQuery.addEventListener('change', handleChange);
    } else {
      reducedMotionMediaQuery.addListener(handleChange);
    }

    return () => {
      if (typeof reducedMotionMediaQuery.removeEventListener === 'function') {
        reducedMotionMediaQuery.removeEventListener('change', handleChange);
      } else {
        reducedMotionMediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  return prefersReducedMotion;
}

function getNormalMovePieceAnimations(
  previousPiecePlacements: readonly ChessPiecePlacement[],
  nextPiecePlacements: readonly ChessPiecePlacement[],
) {
  const previousRenderIds = new Set(
    previousPiecePlacements.map(({ renderId }) => renderId),
  );
  const nextRenderIds = new Set(nextPiecePlacements.map(({ renderId }) => renderId));
  const removedPiecePlacements = previousPiecePlacements.filter(
    ({ renderId }) => !nextRenderIds.has(renderId),
  );
  const addedPiecePlacements = nextPiecePlacements.filter(
    ({ renderId }) => !previousRenderIds.has(renderId),
  );
  const unmatchedRemovedPiecePlacements = [...removedPiecePlacements];
  const movedPieceAnimations: Array<{
    from: ChessPiecePlacement;
    to: ChessPiecePlacement;
  }> = [];

  addedPiecePlacements.forEach((to) => {
    const fromPiecePlacement = getMatchingRemovedPiecePlacement({
      addedPiecePlacement: to,
      addedPiecePlacements,
      unmatchedRemovedPiecePlacements,
    });

    if (!fromPiecePlacement || fromPiecePlacement.square === to.square) {
      return;
    }

    movedPieceAnimations.push({
      from: fromPiecePlacement,
      to,
    });
  });

  return movedPieceAnimations;
}

function getMatchingRemovedPiecePlacement({
  addedPiecePlacement,
  addedPiecePlacements,
  unmatchedRemovedPiecePlacements,
}: {
  addedPiecePlacement: ChessPiecePlacement;
  addedPiecePlacements: readonly ChessPiecePlacement[];
  unmatchedRemovedPiecePlacements: ChessPiecePlacement[];
}) {
  const exactMatch = takeMatchingRemovedPiecePlacement(
    unmatchedRemovedPiecePlacements,
    (piecePlacement) =>
      piecePlacement.color === addedPiecePlacement.color &&
      piecePlacement.piece === addedPiecePlacement.piece,
  );

  if (exactMatch) {
    return exactMatch;
  }

  if (addedPiecePlacements.length !== 1) {
    return null;
  }

  return takeMatchingRemovedPiecePlacement(
    unmatchedRemovedPiecePlacements,
    (piecePlacement) => piecePlacement.color === addedPiecePlacement.color,
  );
}

function takeMatchingRemovedPiecePlacement(
  unmatchedRemovedPiecePlacements: ChessPiecePlacement[],
  matchesPiecePlacement: (piecePlacement: ChessPiecePlacement) => boolean,
) {
  const matchingRemovedPiecePlacementIndexes = unmatchedRemovedPiecePlacements
    .map((piecePlacement, index) =>
      matchesPiecePlacement(piecePlacement) ? index : -1,
    )
    .filter((index) => index >= 0);

  if (matchingRemovedPiecePlacementIndexes.length !== 1) {
    return null;
  }

  const [matchingRemovedPiecePlacementIndex] = matchingRemovedPiecePlacementIndexes;
  const [matchingRemovedPiecePlacement] = unmatchedRemovedPiecePlacements.splice(
    matchingRemovedPiecePlacementIndex,
    1,
  );

  return matchingRemovedPiecePlacement ?? null;
}

function getAnimationTimestamp() {
  return Date.now();
}

function cancelScheduledAnimationFrame(animationFrameId: number | null) {
  if (animationFrameId === null) {
    return;
  }

  cancelAnimationFrame(animationFrameId);
}

function schedulePieceAnimationFrame({
  activePieceAnimationsRef,
  animationFrameRef,
  isMountedRef,
  setActivePieceAnimationCount,
  setPieceAnimationMetadataByRenderId,
  setPieceAnimationPositionsByRenderId,
}: {
  activePieceAnimationsRef: { current: Record<string, ActivePieceAnimation> };
  animationFrameRef: { current: number | null };
  isMountedRef: { current: boolean };
  setActivePieceAnimationCount: (count: number) => void;
  setPieceAnimationMetadataByRenderId: (
    metadataByRenderId: Record<string, PieceAnimationMetadata>,
  ) => void;
  setPieceAnimationPositionsByRenderId: (
    positionsByRenderId: Record<string, PiecePosition3D>,
  ) => void;
}) {
  if (!isMountedRef.current || animationFrameRef.current !== null) {
    return;
  }

  const tick = () => {
    animationFrameRef.current = null;

    if (!isMountedRef.current) {
      activePieceAnimationsRef.current = {};
      return;
    }

    const activePieceAnimationCount = syncPieceAnimationFrame({
      activePieceAnimationsRef,
      isMountedRef,
      nowMs: getAnimationTimestamp(),
      setActivePieceAnimationCount,
      setPieceAnimationMetadataByRenderId,
      setPieceAnimationPositionsByRenderId,
    });

    if (activePieceAnimationCount > 0) {
      schedulePieceAnimationFrame({
        activePieceAnimationsRef,
        animationFrameRef,
        isMountedRef,
        setActivePieceAnimationCount,
        setPieceAnimationMetadataByRenderId,
        setPieceAnimationPositionsByRenderId,
      });
    }
  };

  animationFrameRef.current = requestAnimationFrame(tick);
}

function syncPieceAnimationFrame({
  activePieceAnimationsRef,
  isMountedRef,
  nowMs,
  setActivePieceAnimationCount,
  setPieceAnimationMetadataByRenderId,
  setPieceAnimationPositionsByRenderId,
}: {
  activePieceAnimationsRef: { current: Record<string, ActivePieceAnimation> };
  isMountedRef: { current: boolean };
  nowMs: number;
  setActivePieceAnimationCount: (count: number) => void;
  setPieceAnimationMetadataByRenderId: (
    metadataByRenderId: Record<string, PieceAnimationMetadata>,
  ) => void;
  setPieceAnimationPositionsByRenderId: (
    positionsByRenderId: Record<string, PiecePosition3D>,
  ) => void;
}) {
  const nextActivePieceAnimations: Record<string, ActivePieceAnimation> = {};
  const nextPieceAnimationMetadataByRenderId: Record<
    string,
    PieceAnimationMetadata
  > = {};
  const nextPieceAnimationPositionsByRenderId: Record<string, PiecePosition3D> = {};

  if (!isMountedRef.current) {
    activePieceAnimationsRef.current = {};
    return 0;
  }

  Object.entries(activePieceAnimationsRef.current).forEach(
    ([renderId, pieceAnimation]) => {
      const animationProgress =
        pieceAnimation.durationMs <= 0
          ? 1
          : clamp(
              (nowMs - pieceAnimation.startedAtMs) / pieceAnimation.durationMs,
              0,
              1,
            );

      if (animationProgress >= 1) {
        return;
      }

      nextActivePieceAnimations[renderId] = pieceAnimation;
      nextPieceAnimationMetadataByRenderId[renderId] = {
        durationMs: pieceAnimation.durationMs,
        fromSquare: pieceAnimation.fromSquare,
        state: 'running',
        toSquare: pieceAnimation.toSquare,
      };
      nextPieceAnimationPositionsByRenderId[renderId] = interpolatePiecePosition(
        pieceAnimation.fromPosition,
        pieceAnimation.toPosition,
        easePieceAnimationProgress(animationProgress),
      );
    },
  );

  activePieceAnimationsRef.current = nextActivePieceAnimations;
  setActivePieceAnimationCount(Object.keys(nextActivePieceAnimations).length);
  setPieceAnimationMetadataByRenderId(nextPieceAnimationMetadataByRenderId);
  setPieceAnimationPositionsByRenderId(nextPieceAnimationPositionsByRenderId);

  return Object.keys(nextActivePieceAnimations).length;
}

function easePieceAnimationProgress(progress: number) {
  if (progress < 0.5) {
    return 4 * progress * progress * progress;
  }

  return 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function interpolatePiecePosition(
  fromPosition: PiecePosition3D,
  toPosition: PiecePosition3D,
  progress: number,
): PiecePosition3D {
  return [
    roundToTwoDecimals(fromPosition[0] + (toPosition[0] - fromPosition[0]) * progress),
    roundToTwoDecimals(fromPosition[1] + (toPosition[1] - fromPosition[1]) * progress),
    roundToTwoDecimals(fromPosition[2] + (toPosition[2] - fromPosition[2]) * progress),
  ];
}

function formatGroundingValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatContractGeometryValue(value: number) {
  return `${Number(value.toFixed(3))}`;
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

function getNextCameraViewFromWheelDelta(
  currentCameraView: BoardCameraView,
  wheelDelta: {
    deltaMode: number;
    deltaY: number;
  },
): BoardCameraView {
  if (wheelDelta.deltaY === 0) {
    return currentCameraView;
  }

  const normalizedDelta = clamp(
    normalizeWheelDeltaToPixels(wheelDelta.deltaY, wheelDelta.deltaMode),
    -240,
    240,
  );
  const nextDistance = clamp(
    roundToTwoDecimals(
      currentCameraView.distance * Math.exp(normalizedDelta * wheelZoomSensitivity),
    ),
    minCameraDistance,
    maxCameraDistance,
  );

  if (nextDistance === currentCameraView.distance) {
    return currentCameraView;
  }

  return createCustomCameraView(currentCameraView, {
    distance: nextDistance,
  });
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
  previousAzimuth = 0,
): BoardCameraView {
  const offsetVector = camera.position.clone().sub(target);
  const distance = clamp(offsetVector.length(), minCameraDistance, maxCameraDistance);
  const horizontalDistance = Math.hypot(offsetVector.x, offsetVector.z);
  const wrappedAzimuth = Math.atan2(offsetVector.x, offsetVector.z);
  const normalizedCameraView = {
    azimuth: unwrapAzimuth(previousAzimuth, wrappedAzimuth),
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

function areCameraTelemetryEqual(
  currentCameraTelemetry: BoardSceneCameraTelemetry,
  nextCameraTelemetry: BoardSceneCameraTelemetry,
) {
  return (
    currentCameraTelemetry.maxDistance === nextCameraTelemetry.maxDistance &&
    currentCameraTelemetry.minDistance === nextCameraTelemetry.minDistance &&
      currentCameraTelemetry.screenUpAngle === nextCameraTelemetry.screenUpAngle
  );
}

function areSquareCameraRayStatesEqual(
  currentSquareCameraRayStates: BoardSquareCameraRayStates,
  nextSquareCameraRayStates: BoardSquareCameraRayStates,
) {
  return (
    getSquareCameraRayStatesSnapshot(currentSquareCameraRayStates) ===
    getSquareCameraRayStatesSnapshot(nextSquareCameraRayStates)
  );
}

function getCameraViewSnapshot(cameraView: BoardCameraView): string {
  return `${cameraView.viewMode}:${roundToTwoDecimals(cameraView.azimuth)}:${roundToTwoDecimals(cameraView.distance)}:${roundToTwoDecimals(cameraView.polar)}`;
}

function getSquareCameraRayStatesSnapshot(
  squareCameraRayStates: BoardSquareCameraRayStates,
) {
  return boardSquares
    .map((boardSquare) => {
      const squareCameraRayState = squareCameraRayStates[boardSquare.square];

      return `${boardSquare.square}:${Number(squareCameraRayState?.clear ?? false)}:${squareCameraRayState?.hit ?? 'none'}`;
    })
    .join('|');
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

function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.min(Math.max(value, minValue), maxValue);
}

function normalizeWheelDeltaToPixels(deltaY: number, deltaMode: number): number {
  switch (deltaMode) {
    case WheelEvent.DOM_DELTA_LINE:
      return deltaY * 16;
    case WheelEvent.DOM_DELTA_PAGE:
      return deltaY * 320;
    default:
      return deltaY;
  }
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function unwrapAzimuth(previousAzimuth: number, wrappedAzimuth: number): number {
  const previousWrappedAzimuth = normalizeAngle(previousAzimuth);
  const azimuthDelta = normalizeAngle(wrappedAzimuth - previousWrappedAzimuth);

  return roundToTwoDecimals(previousAzimuth + azimuthDelta);
}

function setCameraPosition(
  camera: Camera,
  cameraX: number,
  cameraY: number,
  cameraZ: number,
) {
  camera.up.set(0, 1, 0);
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
  const targetSize = roundToNearestPixel(
    clamp(
      (closestNeighborDistance ?? 42) * 0.72,
      interactionHitTargetMinSizePx,
      interactionHitTargetMaxSizePx,
    ),
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

function publishSquareCameraRayStates({
  camera,
  lastSquareCameraRayStatesSnapshotRef,
  onSquareCameraRayStatesChange,
  probeSquares,
  scene,
  size,
}: {
  camera: Camera;
  lastSquareCameraRayStatesSnapshotRef: { current: string };
  onSquareCameraRayStatesChange?: (
    squareCameraRayStates: BoardSquareCameraRayStates,
  ) => void;
  probeSquares: readonly ChessSquare[];
  scene: Object3D;
  size: { height: number; width: number };
}) {
  if (!onSquareCameraRayStatesChange) {
    return;
  }

  const {
    squareCameraRayStates,
    squareCameraRayStatesSnapshot,
  } = getSquareCameraRayStates(camera, scene, size, probeSquares);

  if (
    squareCameraRayStatesSnapshot ===
    lastSquareCameraRayStatesSnapshotRef.current
  ) {
    return;
  }

  lastSquareCameraRayStatesSnapshotRef.current = squareCameraRayStatesSnapshot;
  onSquareCameraRayStatesChange(squareCameraRayStates);
}

function publishCameraTelemetry({
  camera,
  lastCameraTelemetrySnapshotRef,
  onCameraTelemetryChange,
  size,
}: {
  camera: Camera;
  lastCameraTelemetrySnapshotRef: { current: string };
  onCameraTelemetryChange?: (
    cameraTelemetry: BoardSceneCameraTelemetry,
  ) => void;
  size: { height: number; width: number };
}) {
  if (!onCameraTelemetryChange) {
    return;
  }

  const cameraTelemetry = getCameraTelemetry(camera, size);
  const nextCameraTelemetrySnapshot = [
    cameraTelemetry.maxDistance,
    cameraTelemetry.minDistance,
    cameraTelemetry.screenUpAngle,
  ].join(':');

  if (nextCameraTelemetrySnapshot === lastCameraTelemetrySnapshotRef.current) {
    return;
  }

  lastCameraTelemetrySnapshotRef.current = nextCameraTelemetrySnapshot;
  onCameraTelemetryChange(cameraTelemetry);
}

function getCameraTelemetry(
  camera: Camera,
  size: { height: number; width: number },
): BoardSceneCameraTelemetry {
  const targetScreenPosition = projectBoardPositionToScreen({
    camera,
    size,
    x: cameraTarget.x,
    y: cameraTarget.y,
    z: cameraTarget.z,
  });
  const targetUpScreenPosition = projectBoardPositionToScreen({
    camera,
    size,
    x: cameraTarget.x,
    y: cameraTarget.y + 1,
    z: cameraTarget.z,
  });
  const screenUpDeltaX = targetUpScreenPosition.x - targetScreenPosition.x;
  const screenUpDeltaY = targetUpScreenPosition.y - targetScreenPosition.y;

  return {
    maxDistance: maxCameraDistance,
    minDistance: minCameraDistance,
    screenUpAngle: roundToTwoDecimals(
      (Math.atan2(screenUpDeltaX, -screenUpDeltaY) * 180) / Math.PI,
    ),
  };
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

function getSquareCameraRayStates(
  camera: Camera,
  scene: Object3D,
  size: { height: number; width: number },
  probeSquares: readonly ChessSquare[],
) {
  const squareCameraRayStates: BoardSquareCameraRayStates = {};

  if (probeSquares.length === 0) {
    return {
      squareCameraRayStates,
      squareCameraRayStatesSnapshot: '',
    };
  }

  camera.updateMatrixWorld();
  scene.updateMatrixWorld(true);

  const squareCameraRayStatesSnapshot = probeSquares
    .map((square) => {
      const boardSquare = getBoardSquare(square);
      const [x, z] = getSquarePosition(boardSquare);
      const projectedSquarePosition = projectBoardPositionToScreen({
        camera,
        size,
        x,
        y: boardSquareSurfaceY,
        z,
      });
      const squareCameraRayState = projectedSquarePosition.visible
        ? getSquareCameraRayState({
            camera,
            scene,
            x,
            y: boardSquareSurfaceY + squareCameraRayTargetLift,
            z,
          })
        : {
            clear: false,
            hit: 'out-of-view',
          };

      squareCameraRayStates[boardSquare.square] = squareCameraRayState;

      return `${boardSquare.square}:${Number(squareCameraRayState.clear)}:${squareCameraRayState.hit}`;
    })
    .join('|');

  return {
    squareCameraRayStates,
    squareCameraRayStatesSnapshot,
  };
}

function getSquareCameraRayState({
  camera,
  scene,
  x,
  y,
  z,
}: {
  camera: Camera;
  scene: Object3D;
  x: number;
  y: number;
  z: number;
}): BoardSquareCameraRayState {
  squareCameraRayOrigin.copy(camera.position);
  squareCameraRayDirection.set(x, y, z).sub(squareCameraRayOrigin);
  const targetDistance = squareCameraRayDirection.length();

  if (targetDistance <= 0) {
    return {
      clear: true,
      hit: 'none',
    };
  }

  squareCameraRayDirection.normalize();
  squareCameraRaycaster.set(squareCameraRayOrigin, squareCameraRayDirection);

  const firstOccludingIntersection = squareCameraRaycaster
    .intersectObjects(scene.children, true)
    .find(
      (intersection) =>
        intersection.distance <
          targetDistance - squareCameraRayDistanceTolerance &&
        !shouldIgnoreSquareCameraRayIntersection(intersection.object),
    );

  if (!firstOccludingIntersection) {
    return {
      clear: true,
      hit: 'none',
    };
  }

  return {
    clear: false,
    hit: getSquareCameraRayIntersectionRole(firstOccludingIntersection.object),
  };
}

function shouldIgnoreSquareCameraRayIntersection(object: Object3D) {
  return object.userData.boardSceneOcclusionBehavior === 'ignore';
}

function getResolvedBoardSceneCameraRayDiagnosticsMode(
  cameraRayDiagnosticsMode?: BoardSceneCameraRayDiagnosticsMode,
): BoardSceneCameraRayDiagnosticsMode {
  if (cameraRayDiagnosticsMode) {
    return cameraRayDiagnosticsMode;
  }

  if (typeof window === 'undefined') {
    return 'disabled';
  }

  return new URLSearchParams(window.location.search).get(
    boardSceneCameraRayDiagnosticsSearchParam,
  ) === 'representative'
    ? 'representative'
    : 'disabled';
}

function getBoardSceneCameraRayDiagnosticsSquares(
  cameraRayDiagnosticsMode: BoardSceneCameraRayDiagnosticsMode,
): readonly ChessSquare[] {
  return cameraRayDiagnosticsMode === 'representative'
    ? representativeCameraRayDiagnosticsSquares
    : disabledCameraRayDiagnosticsSquares;
}

function getSquareCameraRayIntersectionRole(object: Object3D) {
  return (
    object.userData.boardSceneOcclusionRole ??
    object.parent?.userData.boardSceneOcclusionRole ??
    object.type.toLowerCase()
  );
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
  const projectedVector = new Vector3(x, y, z).project(camera);
  const screenX = roundToNearestPixel(
    (projectedVector.x * 0.5 + 0.5) * size.width,
  );
  const screenY = roundToNearestPixel(
    (-projectedVector.y * 0.5 + 0.5) * size.height,
  );

  return {
    visible:
      projectedVector.z >= -1 &&
      projectedVector.z <= 1 &&
      screenX >= -interactionHitTargetViewportMarginPx &&
      screenX <= size.width + interactionHitTargetViewportMarginPx &&
      screenY >= -interactionHitTargetViewportMarginPx &&
      screenY <= size.height + interactionHitTargetViewportMarginPx,
    x: screenX,
    y: screenY,
  };
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundToNearestPixel(value: number): number {
  return Math.round(value);
}
