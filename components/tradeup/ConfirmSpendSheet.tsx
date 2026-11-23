'use client';

interface ConfirmSpendSheetProps {
  open: boolean;
  title: string;
  copy: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Lightweight coin-spend confirmation for Classic perks / rerolls. */
export function ConfirmSpendSheet({
  open,
  title,
  copy,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: ConfirmSpendSheetProps) {
  if (!open) return null;
  return (
    <div className="spend-confirm" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="spend-confirm__scrim" aria-label="Cancel" onClick={onCancel} />
      <div className="spend-confirm__card">
        <h3 className="spend-confirm__title">{title}</h3>
        <p className="spend-confirm__copy">{copy}</p>
        <div className="spend-confirm__actions">
          <button type="button" className="spend-confirm__btn spend-confirm__btn--ghost ui-tap" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="spend-confirm__btn spend-confirm__btn--go ui-tap" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
