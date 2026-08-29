'use client';

/** Current $1B RUN app icon — transparent squircle PNG (no square halo). */
export const ONEB_APP_ICON_SRC = '/images/1b-run-app-icon-squircle.png?v=1';
/** Alias for all legacy logo imports. */
export const BALLION_LOGO_SRC = ONEB_APP_ICON_SRC;
export const BALLION_SPLASH_LOGO_SRC = ONEB_APP_ICON_SRC;

const SIZE_CLASS = {
  hero: 'tradeup-logo--hero tradeup-logo--app',
  md: 'tradeup-logo--md tradeup-logo--app',
  sm: 'tradeup-logo--sm tradeup-logo--app',
  xs: 'tradeup-logo--xs tradeup-logo--app',
} as const;

export type BallionLogoSize = keyof typeof SIZE_CLASS;

interface BallionLogoProps {
  size?: BallionLogoSize;
  className?: string;
  priority?: boolean;
}

/** Official $1B RUN logo. */
export function BallionLogo({
  size = 'md',
  className = '',
  priority = false,
}: BallionLogoProps) {
  return (
    <div
      className={`tradeup-logo ballion-logo oneb-logo ${SIZE_CLASS[size]}${
        className ? ` ${className}` : ''
      }`}
      aria-hidden={size === 'xs'}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ONEB_APP_ICON_SRC}
        alt="$1B RUN"
        className="tradeup-logo__img ballion-logo__img"
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        draggable={false}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  );
}

export const TradeUpLogo = BallionLogo;
export type TradeUpLogoSize = BallionLogoSize;
