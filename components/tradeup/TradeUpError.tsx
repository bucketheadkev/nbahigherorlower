'use client';

import { BallionWordmark } from './BallionWordmark';

interface TradeUpErrorProps {
  message: string;
  onRetry: () => void;
}

export function TradeUpError({ message, onRetry }: TradeUpErrorProps) {
  return (
    <div className="tradeup-shell">
      <header className="tradeup-header">
        <BallionWordmark />
      </header>
      <div className="tradeup-error">
        <p className="tradeup-error-title">Something went wrong</p>
        <p className="tradeup-error-message">{message}</p>
        <button type="button" className="btn-primary tradeup-error-retry" onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  );
}
