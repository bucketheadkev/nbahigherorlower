'use client';

import { BALLION_SPLASH_LOGO_SRC } from './TradeUpLogo';

/** In-app loading — matches splash squircle + blue bloom (no square icon flash). */
export function TradeUpLoading() {
  return (
    <div className="tradeup-shell tradeup-shell--loading">
      <div className="tradeup-loading tradeup-loading--splash" role="status" aria-label="Loading">
        <div className="splash-world" aria-hidden>
          <div className="splash-world__grain" />
          <div className="splash-world__bloom splash-world__bloom--wide" />
        </div>
        <div className="ballion-splash__logo-wrap">
          <div className="ballion-splash__mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="ballion-splash__logo"
              src={BALLION_SPLASH_LOGO_SRC}
              alt=""
              width={1024}
              height={1024}
              decoding="async"
              draggable={false}
            />
          </div>
          <div className="tradeup-loading-spinner" aria-hidden />
          <p className="tradeup-loading-text">Loading game…</p>
        </div>
      </div>
    </div>
  );
}
