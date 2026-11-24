'use client';

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

/** Sit tight under the jumbotron so rerolls read as the first sheet content. */
const GAP_BELOW_ANCHOR_PX = 4;
/** Ignore tiny finger jitter so a tap never becomes a drag onto the booth behind. */
const TAP_SLOP_PX = 12;

type Props = {
  /** Mounted and on screen (a spin has landed). When false the sheet slides fully away. */
  present: boolean;
  /** Expanded (list showing) vs collapsed (court showing, peek bar only). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Collapsed bar content. */
  peek: ReactNode;
  /** Shown under the handle while expanded (e.g. "tap to see your court"). */
  cue?: ReactNode;
  children: ReactNode;
  /** The expanded sheet stops just below the first of these that exists. */
  anchorSelectors?: string[];
  label: string;
};

/**
 * Bottom sheet over the lower court. Open/close is tap-only on the handle / peek bar —
 * no drag or flick — so gestures never leak into the booth spinners behind the sheet.
 */
export function DraftSheet({ present, open, onOpenChange, peek, cue, children, anchorSelectors, label }: Props) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const grabRef = useRef<HTMLDivElement | null>(null);
  const peekRef = useRef<HTMLDivElement | null>(null);
  const safeRef = useRef<HTMLSpanElement | null>(null);
  const [top, setTop] = useState<number | null>(null);
  const pressRef = useRef<{ id: number; x: number; y: number } | null>(null);

  // Keep the last content on screen while the sheet slides away.
  const lastPeek = useRef(peek);
  const lastChildren = useRef(children);
  if (present) {
    lastPeek.current = peek;
    lastChildren.current = children;
  }

  const measure = useCallback(() => {
    const anchor = (anchorSelectors ?? [])
      .map((selector) => document.querySelector(selector))
      .find((el): el is Element => el != null);
    const anchorBottom = anchor?.getBoundingClientRect().bottom ?? 0;
    setTop(Math.max(0, Math.round(anchorBottom + GAP_BELOW_ANCHOR_PX)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorSelectors?.join('|')]);

  /** Collapsed offset: everything but the handle, peek bar and home-indicator inset slides below. */
  const closedY = useCallback(() => {
    const sheet = sheetRef.current;
    if (!sheet) return 0;
    const peekH =
      (grabRef.current?.offsetHeight ?? 0) +
      (peekRef.current?.offsetHeight ?? 0) +
      (safeRef.current?.offsetHeight ?? 0);
    return Math.max(0, sheet.offsetHeight - peekH);
  }, []);

  const place = useCallback(
    (y: number, animate: boolean) => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      sheet.style.transition = animate ? '' : 'none';
      sheet.style.transform = `translate3d(0, ${y}px, 0)`;
      const collapse = Math.min(1, Math.max(0, y / (closedY() || 1)));
      sheet.style.setProperty('--sheet-collapse', String(collapse));
    },
    [closedY],
  );

  const restingY = useCallback(
    () => (!present ? (sheetRef.current?.offsetHeight ?? 0) + 24 : open ? 0 : closedY()),
    [closedY, open, present],
  );

  useLayoutEffect(() => {
    measure();
  }, [measure, present]);

  useLayoutEffect(() => {
    // Collapse instantly when closing over the court so jersey taps are not blocked
    // by the sheet for ~380ms (felt like a massive place delay).
    const animate = open || !present;
    place(restingY(), animate);
  }, [open, place, present, restingY, top]);

  useEffect(() => {
    const onResize = () => {
      measure();
      place(restingY(), false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measure, place, restingY]);

  const toggle = useCallback(() => {
    if (!present) return;
    onOpenChange(!open);
  }, [onOpenChange, open, present]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!present || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pressRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    pressRef.current = null;
    if (!press || press.id !== event.pointerId) return;
    if (
      Math.abs(event.clientX - press.x) > TAP_SLOP_PX ||
      Math.abs(event.clientY - press.y) > TAP_SLOP_PX
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    toggle();
  };

  const onPointerCancel = () => {
    pressRef.current = null;
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  };

  return (
    <div
      ref={sheetRef}
      className={`draft-sheet${present ? ' is-present' : ''}${open ? ' is-open' : ''}`}
      style={top == null ? undefined : { top }}
      role="region"
      aria-label={label}
    >
      <div
        className="draft-sheet__grab"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={(e) => e.preventDefault()}
      >
        <div
          ref={grabRef}
          className="draft-sheet__handle"
          role="button"
          tabIndex={present ? 0 : -1}
          aria-expanded={open}
          aria-label={open ? 'Tap to show the court' : 'Tap to show players'}
          onKeyDown={onKeyDown}
        >
          <span className="draft-sheet__toggle" aria-hidden="true">
            <svg className="draft-sheet__toggle-icon" viewBox="0 0 24 24">
              {open ? <path d="M6 9.5l6 6 6-6" /> : <path d="M6 14.5l6-6 6 6" />}
            </svg>
          </span>
          {cue ? (
            <span className="draft-sheet__cue" aria-hidden={!open || undefined}>
              {cue}
            </span>
          ) : null}
        </div>
        <div ref={peekRef} className="draft-sheet__peek" aria-hidden={open || undefined}>
          {lastPeek.current}
        </div>
      </div>
      <div className="draft-sheet__body" inert={!open || !present || undefined}>
        {lastChildren.current}
      </div>
      <span ref={safeRef} className="draft-sheet__safe" aria-hidden="true" />
    </div>
  );
}
