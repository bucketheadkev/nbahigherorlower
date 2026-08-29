'use client';

export type OneBRunBackgroundVariant = 'home' | 'gameplay' | 'splash';

interface OneBRunBackgroundProps {
  variant?: OneBRunBackgroundVariant;
}

/**
 * Branded $1B Run environment — oversized half-court, grain, atmospheric glow.
 * Decorative only; never captures pointer events.
 */
export function OneBRunBackground({ variant = 'home' }: OneBRunBackgroundProps) {
  return (
    <div
      className={`oneb-bg oneb-bg--${variant}`}
      aria-hidden="true"
    >
      <div className="oneb-bg__base" />
      <div className="oneb-bg__grain" />
      <div className="oneb-bg__glow" />
      <div className="oneb-bg__court-wrap">
        <div className="oneb-bg__court">
          <div className="oneb-bg__sideline oneb-bg__sideline--left" />
          <div className="oneb-bg__sideline oneb-bg__sideline--right" />
          <div className="oneb-bg__baseline" />
          <div className="oneb-bg__midline" />
          <div className="oneb-bg__center-arc" />
          <div className="oneb-bg__three" />
          <div className="oneb-bg__lane" />
          <div className="oneb-bg__ft-circle" />
          <div className="oneb-bg__backboard" />
          <div className="oneb-bg__rim" />
          <div className="oneb-bg__key-fill" />
        </div>
      </div>
      <div className="oneb-bg__vignette" />
    </div>
  );
}
