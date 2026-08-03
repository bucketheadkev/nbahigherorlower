'use client';

import { TradeUpLogo } from './TradeUpLogo';

export function TradeUpLoading() {
  return (
    <div className="tradeup-shell tradeup-shell--loading">
      <div className="tradeup-loading">
        <TradeUpLogo size="md" priority />
        <div className="tradeup-loading-spinner" aria-hidden />
        <p className="tradeup-loading-text">Loading game…</p>
      </div>
    </div>
  );
}
