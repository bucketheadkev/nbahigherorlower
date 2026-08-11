'use client';

/**
 * Extremely faint CSS-only basketball half-court for the Home/Play screen.
 * Decorative only — never captures pointer events.
 */
export function SubtleCourtBackground() {
  return (
    <div className="subtle-court" aria-hidden="true">
      <div className="subtle-court__fade">
        <div className="subtle-court__stage">
          <div className="subtle-court__sideline subtle-court__sideline--left" />
          <div className="subtle-court__sideline subtle-court__sideline--right" />
          <div className="subtle-court__baseline" />
          <div className="subtle-court__midline" />
          <div className="subtle-court__center-arc" />
          <div className="subtle-court__three" />
          <div className="subtle-court__lane" />
          <div className="subtle-court__ft-circle" />
          <div className="subtle-court__backboard" />
          <div className="subtle-court__rim" />
        </div>
      </div>
    </div>
  );
}
