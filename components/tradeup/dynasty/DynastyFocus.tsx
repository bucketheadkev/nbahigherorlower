'use client';

import { useState, type CSSProperties } from 'react';
import type { DynastyResult, DynastyState } from '@/lib/account/dynastyCloud';
import { collectionById, DYNASTY_COLLECTIONS } from '@/lib/tradeup/dynasty/catalog';
import { dc } from '@/lib/tradeup/dynasty/copy';
import { hapticLight } from '@/lib/tradeup/haptics';
import { Check, Pips } from './DynastySignOffer';

/** The active Focus Dynasty, or a quiet prompt to choose one. Tapping opens the picker. */
export function FocusBanner({
  state,
  locale,
  onChange,
}: {
  state: DynastyState;
  locale: string;
  onChange: () => void;
}) {
  const focus = state.focusCollectionId ? collectionById(state.focusCollectionId) : undefined;
  if (!focus) {
    return (
      <button type="button" className="dyn-focus dyn-focus--empty" onClick={onChange}>
        <span className="dyn-focus__icon" aria-hidden>
          <FocusIcon />
        </span>
        <span className="dyn-focus__copy">
          <strong>{dc('focusChoose', locale)}</strong>
          <em>{dc('focusLine', locale)}</em>
        </span>
        <span className="dyn-focus__cta">{dc('focusPick', locale)}</span>
      </button>
    );
  }
  const have = focus.slots.filter((s) => state.owned.some((o) => o.collectionId === focus.id && o.playerId === s.playerId)).length;
  return (
    <button
      type="button"
      className="dyn-focus"
      style={{ '--dyn-primary': focus.colors.primary, '--dyn-accent': focus.colors.accent } as CSSProperties}
      onClick={onChange}
    >
      <span className="dyn-focus__icon" aria-hidden>
        <FocusIcon />
      </span>
      <span className="dyn-focus__copy">
        <span className="dyn-focus__kicker">{dc('focusKicker', locale)}</span>
        <strong>
          {focus.season} {focus.team}
        </strong>
        <em>{dc('focusLine', locale)}</em>
      </span>
      <span className="dyn-focus__side">
        <span className="dyn-focus__count">{have}/5</span>
        <span className="dyn-focus__cta">{dc('focusChange', locale)}</span>
      </span>
    </button>
  );
}

export function FocusPicker({
  state,
  locale,
  setFocus,
  onClose,
}: {
  state: DynastyState;
  locale: string;
  setFocus: (id: string | null) => Promise<DynastyResult<DynastyState>>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const done = new Set(state.completed.map((c) => c.collectionId));
  const choices = DYNASTY_COLLECTIONS.filter((c) => c.kind === 'championship');

  const pick = async (id: string | null) => {
    if (busy) return;
    hapticLight();
    setBusy(id ?? 'none');
    setFailed(false);
    const res = await setFocus(id);
    setBusy(null);
    if (res.ok) onClose();
    else setFailed(true);
  };

  return (
    <div className="dyn-sheet" role="dialog" aria-modal="true" aria-label={dc('focusKicker', locale)}>
      <button type="button" className="dyn-sheet__scrim" aria-label={dc('close', locale)} onClick={onClose} />
      <section className="dyn-sheet__panel">
        <span className="dyn-sheet__grip" aria-hidden />
        <header className="dyn-sheet__head">
          <div>
            <span className="dyn-offer__kicker">{dc('focusKicker', locale)}</span>
            <strong className="dyn-sheet__title">{dc('focusChoose', locale)}</strong>
            <p className="dyn-sheet__line">{dc('focusExplain', locale)}</p>
          </div>
          <button type="button" className="dyn-sheet__close" aria-label={dc('close', locale)} onClick={onClose}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <ul className="dyn-focus-list">
          {choices.map((c) => {
            const complete = done.has(c.id);
            const active = state.focusCollectionId === c.id;
            const have = c.slots.filter((s) => state.owned.some((o) => o.collectionId === c.id && o.playerId === s.playerId)).length;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={`dyn-focus-opt${active ? ' is-active' : ''}${complete ? ' is-complete' : ''}`}
                  style={{ '--dyn-primary': c.colors.primary, '--dyn-accent': c.colors.accent } as CSSProperties}
                  disabled={complete || busy != null}
                  onClick={() => void pick(active ? null : c.id)}
                >
                  <span className="dyn-focus-opt__swatch" aria-hidden />
                  <span className="dyn-focus-opt__copy">
                    <strong>
                      {c.season} {c.team}
                    </strong>
                    <Pips have={have} />
                  </span>
                  <span className="dyn-focus-opt__state">
                    {complete ? (
                      <>
                        <Check /> {dc('completeShort', locale)}
                      </>
                    ) : active ? (
                      busy ? dc('saving', locale) : dc('focusClear', locale)
                    ) : busy === c.id ? (
                      dc('saving', locale)
                    ) : (
                      dc('focusSet', locale)
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {failed ? <p className="dyn-offer__note is-warn">{dc('actionFailed', locale)}</p> : null}
      </section>
    </div>
  );
}

function FocusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    </svg>
  );
}
