'use client';

import { BallionLogo } from './TradeUpLogo';

export function TradeUpLoading() {
  return (
    <div className="tradeup-shell tradeup-shell--loading">
      <div className="tradeup-loading">
        <BallionLogo size="md" />
        <div className="tradeup-loading-spinner" aria-hidden />
        <p className="tradeup-loading-text">Loading game…</p>
      </div>
    </div>
  );
}
