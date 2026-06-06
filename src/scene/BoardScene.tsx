import { OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { DoubleSide, type Camera, MOUSE, TOUCH, Vector3 } from 'three';
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
  getBoardFrameSegmentFinish,
  getBoardSquareFinish,
} from './materials';
import { SceneLighting, sceneLightingContract } from './lighting';

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
  onCameraTelemetryChange?: (
    cameraTelemetry: BoardSceneCameraTelemetry,
  ) => void;
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

interface BoardSceneCameraTelemetry {
  maxDistance: number;
  minDistance: number;
  screenUpAngle: number;
}

type LegalDestinationMarkerVariant = 'dot' | 'perimeter';

type BoardSquareScreenPositions = Partial<
  Record<ChessSquare, BoardSquareScreenPosition>
>;

const boardSquares = createBoardSquares();
const squareSize = boardGeometry.squareSize;
const boardSquareHeight = boardGeometry.squareHeight;
const boardHalfSpan = boardGeometry.boardHalfSpan;
const boardSquareSurfaceY = boardGeometry.squareSurfaceY;
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
  legalMarkerOccupiedStyle: 'perimeter',
  legalMarkerPalette: 'sage-green',
  legalMarkerStyle: 'dot',
  legalMarkerTreatment: 'flat-dot',
  selectedHighlightContrast: 'light-dark-ready',
  selectedHighlightPalette: 'green-gold',
  selectedHighlightShape: 'perimeter',
  selectedHighlightTreatment: 'dual-ring',
} as const;
const moveHighlightPalette = {
  legalCoreColor: '#edf5cf',
  legalDotColor: '#77b06d',
  legalDotGlow: '#d6eab5',
  legalHaloColor: '#26422e',
  legalPerimeterColor: '#5d9360',
  legalPerimeterGlow: '#9fd289',
  markerContrastColor: '#121d15',
  selectedAccentColor: '#c09b4a',
  selectedAccentGlow: '#efd78f',
  selectedBaseColor: '#2f6f44',
  selectedBaseGlow: '#95d48f',
  selectedContrastColor: '#101812',
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
const cameraTarget = new Vector3(0, 0, 0);

function DefaultBoardSceneCanvas({
  cameraView = defaultCameraView,
  children,
  className,
  onCameraTelemetryChange,
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
        cameraView={cameraView}
        onCameraTelemetryChange={onCameraTelemetryChange}
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
  const occupiedSquares = new Set(piecePlacements.map(({ square }) => square));
  const legalDestinationMarkers = Array.from(legalDestinationSet).map((square) => ({
    occupied: occupiedSquares.has(square),
    square,
    treatment: getLegalDestinationMarkerTreatment(occupiedSquares.has(square)),
    variant: getLegalDestinationMarkerVariant(occupiedSquares.has(square)),
  }));
  const [cameraView, setCameraView] = useState(defaultCameraView);
  const [cameraTelemetry, setCameraTelemetry] = useState<BoardSceneCameraTelemetry>(
    () => ({
      maxDistance: maxCameraDistance,
      minDistance: minCameraDistance,
      screenUpAngle: 0,
    }),
  );
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
          cameraView={cameraView}
          className="board-scene-canvas"
          onCameraTelemetryChange={(nextCameraTelemetry) => {
            startTransition(() => {
              setCameraTelemetry((currentCameraTelemetry) =>
                areCameraTelemetryEqual(
                  currentCameraTelemetry,
                  nextCameraTelemetry,
                )
                  ? currentCameraTelemetry
                  : nextCameraTelemetry,
              );
            });
          }}
          onCameraViewChange={handleCameraViewChange}
          onSquareScreenPositionsChange={(nextSquareScreenPositions) => {
            startTransition(() => {
              setSquareScreenPositions(nextSquareScreenPositions);
            });
          }}
        >
          <SceneLighting />
          <group>
            <SceneBackdrop />
            <BoardFrame />
            {boardSquares.map((boardSquare) => {
              const squareFinish = getBoardSquareFinish(boardSquare);
              const [x, z] = getSquarePosition(boardSquare);
              const isOccupied = occupiedSquares.has(boardSquare.square);
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
                  <mesh castShadow receiveShadow>
                    <boxGeometry args={[squareSize, boardSquareHeight, squareSize]} />
                    <meshStandardMaterial
                      color={squareFinish.edgeColor}
                      metalness={0.08}
                      roughness={0.72}
                    />
                  </mesh>
                  <mesh
                    castShadow
                    position={[
                      0,
                      boardSquareSurfaceY -
                        boardGeometry.squareFieldHeight / 2,
                      0,
                    ]}
                    receiveShadow
                  >
                    <boxGeometry
                      args={[
                        boardGeometry.squareFieldScale,
                        boardGeometry.squareFieldHeight,
                        boardGeometry.squareFieldScale,
                      ]}
                    />
                    <meshStandardMaterial
                      color={squareFinish.baseColor}
                      metalness={0.1}
                      roughness={0.6}
                    />
                  </mesh>
                  <mesh
                    castShadow
                    position={[
                      0,
                      boardSquareSurfaceY - boardGeometry.squareInsetHeight / 2,
                      0,
                    ]}
                    receiveShadow
                  >
                    <boxGeometry
                      args={[
                        boardGeometry.squareInsetScale,
                        boardGeometry.squareInsetHeight,
                        boardGeometry.squareInsetScale,
                      ]}
                    />
                    <meshStandardMaterial
                      color={squareFinish.insetColor}
                      metalness={squareFinish.metalness}
                      roughness={squareFinish.roughness}
                    />
                  </mesh>
                  <mesh
                    castShadow
                    position={
                      squareFinish.accentAxis === 'file'
                        ? [
                            0,
                            boardSquareSurfaceY -
                              boardGeometry.squareAccentHeight / 2,
                            squareFinish.accentOffset,
                          ]
                        : [
                            squareFinish.accentOffset,
                            boardSquareSurfaceY -
                              boardGeometry.squareAccentHeight / 2,
                            0,
                          ]
                    }
                    receiveShadow
                  >
                    <boxGeometry
                      args={
                        squareFinish.accentAxis === 'file'
                          ? [
                              boardGeometry.squareAccentLength,
                              boardGeometry.squareAccentHeight,
                              boardGeometry.squareAccentWidth,
                            ]
                          : [
                              boardGeometry.squareAccentWidth,
                              boardGeometry.squareAccentHeight,
                              boardGeometry.squareAccentLength,
                            ]
                      }
                    />
                    <meshStandardMaterial
                      color={squareFinish.accentColor}
                      metalness={0.12}
                      roughness={0.48}
                    />
                  </mesh>
                  {isSelected ? <SelectedSquareHighlight /> : null}
                  {isLegalDestination ? (
                    <LegalDestinationMarker occupied={isOccupied} />
                  ) : null}
                </group>
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
          {piecePlacements.map((piecePlacement) => (
            <li
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
                data-piece-color={piecePlacement.color}
                data-piece-marker={pieceMarkerByType[piecePlacement.piece]}
                data-square={piecePlacement.square}
                data-piece-type={piecePlacement.piece}
                data-testid={`board-piece-${piecePlacement.renderId}`}
              >
                {piecePlacement.color} {piecePlacement.piece} on {piecePlacement.square}
              </span>
            </li>
          ))}
        </ul>
        <div
          data-dark-square-material={boardVisualContract.darkSquareMaterialId}
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
  return (
    <>
      <mesh
        position={[0, -0.34, 0]}
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[11.5, 64]} />
        <meshStandardMaterial color="#101720" roughness={0.94} />
      </mesh>
      <mesh position={[0, 4.8, -9.2]}>
        <planeGeometry args={[24, 16]} />
        <meshBasicMaterial color="#0c1118" side={DoubleSide} />
      </mesh>
    </>
  );
}

function BoardFrame() {
  const playableHalfExtent = boardHalfSpan + squareSize / 2;
  const frameOuterSpan = boardGeometry.boardSpan + boardGeometry.frameOverhang * 2;
  const sideRailLength = boardGeometry.boardSpan;
  const frameRailY = (boardGeometry.frameRailHeight - boardSquareHeight) / 2;
  const plinthY = -boardGeometry.plinthHeight / 2 - 0.08;
  const innerTrimY = boardSquareSurfaceY - boardGeometry.innerTrimHeight / 2;
  const frameSegments = [
    {
      args: [
        frameOuterSpan,
        boardGeometry.frameRailHeight,
        boardGeometry.frameRailThickness,
      ] as [number, number, number],
      position: [
        0,
        frameRailY,
        playableHalfExtent + boardGeometry.frameRailThickness / 2,
      ] as [number, number, number],
    },
    {
      args: [
        frameOuterSpan,
        boardGeometry.frameRailHeight,
        boardGeometry.frameRailThickness,
      ] as [number, number, number],
      position: [
        0,
        frameRailY,
        -(playableHalfExtent + boardGeometry.frameRailThickness / 2),
      ] as [number, number, number],
    },
    {
      args: [
        boardGeometry.frameRailThickness,
        boardGeometry.frameRailHeight,
        sideRailLength,
      ] as [number, number, number],
      position: [
        playableHalfExtent + boardGeometry.frameRailThickness / 2,
        frameRailY,
        0,
      ] as [number, number, number],
    },
    {
      args: [
        boardGeometry.frameRailThickness,
        boardGeometry.frameRailHeight,
        sideRailLength,
      ] as [number, number, number],
      position: [
        -(playableHalfExtent + boardGeometry.frameRailThickness / 2),
        frameRailY,
        0,
      ] as [number, number, number],
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
      {frameCorners.map(([xDirection, zDirection], cornerIndex) => (
        <mesh
          castShadow
          key={`frame-corner-${cornerIndex}`}
          position={[
            xDirection *
              (playableHalfExtent + boardGeometry.frameRailThickness / 2),
            frameRailY,
            zDirection *
              (playableHalfExtent + boardGeometry.frameRailThickness / 2),
          ]}
          receiveShadow
        >
          <boxGeometry
            args={[
              boardGeometry.frameCornerSize,
              boardGeometry.frameRailHeight,
              boardGeometry.frameCornerSize,
            ]}
          />
          <meshStandardMaterial
            color={boardFramePalette.railHighlightColor}
            metalness={0.14}
            roughness={0.46}
          />
        </mesh>
      ))}
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
  const markerY = boardSquareSurfaceY + boardGeometry.markerLift;

  return (
    <>
      <PerimeterMarkerFrame
        color={moveHighlightPalette.selectedContrastColor}
        depth={boardGeometry.selectedFrameDepth * 0.56}
        emissive={moveHighlightPalette.selectedContrastColor}
        emissiveIntensity={0}
        opacity={0.88}
        roughness={0.76}
        thickness={boardGeometry.selectedFrameThickness + 0.16}
        y={markerY - boardGeometry.selectedFrameDepth * 0.16}
      />
      <PerimeterMarkerFrame
        color={moveHighlightPalette.selectedBaseColor}
        depth={boardGeometry.selectedFrameDepth * 0.82}
        emissive={moveHighlightPalette.selectedBaseGlow}
        emissiveIntensity={0.34}
        roughness={0.38}
        thickness={boardGeometry.selectedFrameThickness + 0.03}
        y={markerY}
      />
      <PerimeterMarkerFrame
        color={moveHighlightPalette.selectedAccentColor}
        depth={boardGeometry.selectedFrameDepth * 0.52}
        emissive={moveHighlightPalette.selectedAccentGlow}
        emissiveIntensity={0.2}
        metalness={0.2}
        roughness={0.28}
        thickness={boardGeometry.selectedFrameThickness * 0.4}
        y={markerY + boardGeometry.selectedFrameDepth * 0.18}
      />
    </>
  );
}

function LegalDestinationMarker({ occupied }: { occupied: boolean }) {
  if (occupied) {
    return <LegalDestinationPerimeterMarker />;
  }

  return <LegalDestinationDotMarker />;
}

function LegalDestinationPerimeterMarker() {
  const markerY = boardSquareSurfaceY + boardGeometry.markerLift * 0.72;

  return (
    <>
      <PerimeterMarkerFrame
        color={moveHighlightPalette.markerContrastColor}
        depth={boardGeometry.legalMarkerHeight * 0.34}
        emissive={moveHighlightPalette.markerContrastColor}
        emissiveIntensity={0}
        opacity={0.82}
        roughness={0.82}
        thickness={boardGeometry.selectedFrameThickness * 0.68}
        y={markerY - boardGeometry.legalMarkerHeight * 0.08}
      />
      <PerimeterMarkerFrame
        color={moveHighlightPalette.legalPerimeterColor}
        depth={boardGeometry.legalMarkerHeight * 0.52}
        emissive={moveHighlightPalette.legalPerimeterGlow}
        emissiveIntensity={0.18}
        roughness={0.42}
        thickness={boardGeometry.selectedFrameThickness * 0.48}
        y={markerY}
      />
      <PerimeterMarkerFrame
        color={moveHighlightPalette.legalCoreColor}
        depth={boardGeometry.legalMarkerHeight * 0.22}
        emissive={moveHighlightPalette.legalDotGlow}
        emissiveIntensity={0.14}
        roughness={0.28}
        thickness={boardGeometry.selectedFrameThickness * 0.26}
        y={markerY + boardGeometry.legalMarkerHeight * 0.16}
      />
    </>
  );
}

function LegalDestinationDotMarker() {
  const markerY =
    boardSquareSurfaceY +
    boardGeometry.markerLift * 0.78 +
    boardGeometry.legalMarkerHeight / 2;

  return (
    <>
      <mesh position={[0, markerY - boardGeometry.legalMarkerHeight * 0.3, 0]}>
        <cylinderGeometry
          args={[
            boardGeometry.legalMarkerRadius * 1.1,
            boardGeometry.legalMarkerRadius * 1.1,
            boardGeometry.legalMarkerHeight * 0.22,
            40,
          ]}
        />
        <meshStandardMaterial
          color={moveHighlightPalette.markerContrastColor}
          emissive={moveHighlightPalette.markerContrastColor}
          emissiveIntensity={0}
          opacity={0.84}
          roughness={0.82}
          transparent
        />
      </mesh>
      <mesh
        position={[0, markerY - boardGeometry.legalMarkerHeight * 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <torusGeometry
          args={[
            boardGeometry.legalMarkerRingRadius * 0.74,
            boardGeometry.legalMarkerRingTube * 0.5,
            18,
            42,
          ]}
        />
        <meshStandardMaterial
          color={moveHighlightPalette.legalHaloColor}
          emissive={moveHighlightPalette.legalPerimeterGlow}
          emissiveIntensity={0.12}
          metalness={0.08}
          opacity={0.92}
          roughness={0.62}
          transparent
        />
      </mesh>
      <mesh position={[0, markerY, 0]}>
        <cylinderGeometry
          args={[
            boardGeometry.legalMarkerRadius * 0.7,
            boardGeometry.legalMarkerRadius * 0.82,
            boardGeometry.legalMarkerHeight * 0.32,
            36,
          ]}
        />
        <meshStandardMaterial
          color={moveHighlightPalette.legalDotColor}
          emissive={moveHighlightPalette.legalPerimeterGlow}
          emissiveIntensity={0.16}
          metalness={0.06}
          roughness={0.36}
        />
      </mesh>
      <mesh position={[0, markerY + boardGeometry.legalMarkerHeight * 0.12, 0]}>
        <sphereGeometry
          args={[
            boardGeometry.legalMarkerRadius * 0.22,
            18,
            18,
          ]}
        />
        <meshStandardMaterial
          color={moveHighlightPalette.legalCoreColor}
          emissive={moveHighlightPalette.legalDotGlow}
          emissiveIntensity={0.2}
          metalness={0.08}
          roughness={0.22}
        />
      </mesh>
    </>
  );
}

function PerimeterMarkerFrame({
  color,
  depth,
  emissive,
  emissiveIntensity,
  metalness = 0.1,
  opacity,
  roughness,
  thickness,
  y,
}: {
  color: string;
  depth: number;
  emissive: string;
  emissiveIntensity: number;
  metalness?: number;
  opacity?: number;
  roughness: number;
  thickness: number;
  y: number;
}) {
  const offset = squareSize / 2 - thickness / 2;
  const sideLength = squareSize - thickness * 2;

  return (
    <>
      <mesh position={[0, y, offset]}>
        <boxGeometry args={[squareSize, depth, thickness]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          metalness={metalness}
          opacity={opacity}
          roughness={roughness}
          transparent={opacity !== undefined && opacity < 1}
        />
      </mesh>
      <mesh position={[0, y, -offset]}>
        <boxGeometry args={[squareSize, depth, thickness]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          metalness={metalness}
          opacity={opacity}
          roughness={roughness}
          transparent={opacity !== undefined && opacity < 1}
        />
      </mesh>
      <mesh position={[offset, y, 0]}>
        <boxGeometry args={[thickness, depth, sideLength]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          metalness={metalness}
          opacity={opacity}
          roughness={roughness}
          transparent={opacity !== undefined && opacity < 1}
        />
      </mesh>
      <mesh position={[-offset, y, 0]}>
        <boxGeometry args={[thickness, depth, sideLength]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          metalness={metalness}
          opacity={opacity}
          roughness={roughness}
          transparent={opacity !== undefined && opacity < 1}
        />
      </mesh>
    </>
  );
}

function getLegalDestinationMarkerVariant(
  occupied: boolean,
): LegalDestinationMarkerVariant {
  return occupied
    ? moveHighlightVisualContract.legalMarkerOccupiedStyle
    : moveHighlightVisualContract.legalMarkerStyle;
}

function getLegalDestinationMarkerTreatment(occupied: boolean) {
  return occupied ? 'capture-ring' : moveHighlightVisualContract.legalMarkerTreatment;
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
  onCameraTelemetryChange,
  onCameraViewChange,
  onSquareScreenPositionsChange,
}: {
  cameraView: BoardCameraView;
  onCameraTelemetryChange?: (
    cameraTelemetry: BoardSceneCameraTelemetry,
  ) => void;
  onCameraViewChange?: (cameraView: BoardCameraView) => void;
  onSquareScreenPositionsChange?: (
    squareScreenPositions: BoardSquareScreenPositions,
  ) => void;
}) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const lastCameraTelemetrySnapshotRef = useRef('');
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
    publishCameraTelemetry({
      camera,
      lastCameraTelemetrySnapshotRef,
      onCameraTelemetryChange,
      size,
    });
  }, [camera, cameraView, onCameraTelemetryChange, onSquareScreenPositionsChange, size]);

  useFrame(() => {
    publishProjectedSquarePositions({
      camera,
      lastSquareScreenPositionsRef,
      onSquareScreenPositionsChange,
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

function getPiecePosition(square: ChessSquare): [number, number, number] {
  const boardSquare = boardSquares.find((entry) => entry.square === square);

  if (!boardSquare) {
    return [0, getGroundedPiecePlacementY(), 0];
  }

  const [x, z] = getSquarePosition(boardSquare);
  return [x, getGroundedPiecePlacementY(), z];
}

function getGroundedPiecePlacementY() {
  return boardSquareSurfaceY - pieceBaseContactLocalY;
}

function formatGroundingValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
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

function getCameraViewSnapshot(cameraView: BoardCameraView): string {
  return `${cameraView.viewMode}:${roundToTwoDecimals(cameraView.azimuth)}:${roundToTwoDecimals(cameraView.distance)}:${roundToTwoDecimals(cameraView.polar)}`;
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
