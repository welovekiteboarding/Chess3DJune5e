import type { ChessPromotionPiece } from '../chess/chessTypes';

export interface PromotionDialogProps {
  choices: readonly ChessPromotionPiece[];
  onCancel?: () => void;
  onChoose: (piece: ChessPromotionPiece) => void;
}

export function PromotionDialog({
  choices,
  onCancel,
  onChoose,
}: PromotionDialogProps) {
  return (
    <section
      aria-labelledby="promotion-dialog-title"
      aria-modal="true"
      role="dialog"
      style={{
        display: 'grid',
        gap: '0.75rem',
        padding: '1rem',
        border: '1px solid rgba(15, 23, 42, 0.12)',
        borderRadius: '0.75rem',
        background: 'rgba(255, 255, 255, 0.92)',
      }}
    >
      <header>
        <h2
          id="promotion-dialog-title"
          style={{
            margin: 0,
            fontSize: '1.1rem',
          }}
        >
          Choose promotion piece
        </h2>
        <p
          style={{
            margin: '0.35rem 0 0',
          }}
        >
          Select the piece to complete this pawn promotion.
        </p>
      </header>

      <div
        aria-label="Promotion piece choices"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(8rem, 1fr))',
          gap: '0.5rem',
        }}
      >
        {choices.map((choice) => (
          <button
            key={choice}
            onClick={() => onChoose(choice)}
            type="button"
          >
            Promote to {choice}
          </button>
        ))}
      </div>

      {onCancel ? (
        <div>
          <button onClick={onCancel} type="button">
            Cancel promotion
          </button>
        </div>
      ) : null}
    </section>
  );
}
