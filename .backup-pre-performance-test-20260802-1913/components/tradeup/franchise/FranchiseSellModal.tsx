'use client';

import { formatCredits } from '@/lib/tradeup/credits';

interface FranchiseSellModalProps {
  playerName: string;
  credits: number;
  processing?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function FranchiseSellModal({
  playerName,
  credits,
  processing = false,
  onConfirm,
  onCancel,
}: FranchiseSellModalProps) {
  return (
    <div className="sell-modal-backdrop" onClick={processing ? undefined : onCancel}>
      <div className="sell-modal franchise-sell-modal" onClick={(e) => e.stopPropagation()}>
        <span className="section-label">Sell player</span>
        <h2 className="sell-modal-title">Sell {playerName}?</h2>
        <p className="sell-modal-desc">
          You will receive {formatCredits(credits)} Credits. This player will be permanently removed
          from your collection.
        </p>
        <div className="sell-modal-payout">
          <span className="sell-modal-payout-label">Sell for</span>
          <span className="sell-modal-payout-value">{formatCredits(credits)} Credits</span>
        </div>
        <div className="sell-modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={processing}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary franchise-sell-confirm"
            onClick={onConfirm}
            disabled={processing}
          >
            {processing ? 'Selling…' : 'Sell Player'}
          </button>
        </div>
      </div>
    </div>
  );
}
