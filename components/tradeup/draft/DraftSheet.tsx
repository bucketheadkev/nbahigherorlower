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

const DRAG_SLOP_PX = 6;
/** px/ms — a flick this fast decides the snap regardless of where it was released. */
const FLICK_VELOCITY = 0.35;
const GAP_BELOW_ANCHOR_PX = 8;

type Props = {
  /** Mounted and on screen (a spin has landed). When false the sheet slides fully away. */
  present: boolean;
  /** Expanded (list showing) vs collapsed (court showing, peek bar only). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Collapsed bar content. */
  peek: ReactNode;
  children: ReactNode;
  /** The expanded sheet stops just below the first of these that exists. */
  anchorSelectors?: string[];
  label: string;
};

/**
 * Bottom sheet that slides over the lower court. Only the handle strip (and the peek bar when
 * collapsed) drags it, so scrolling the list inside never moves or closes the sheet.
 */
export function DraftSheet({ present, open, onOpenChange, peek, children, anchorSelectors, label }: Props) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const grabRef = useRef<HTMLDivElement | null>(null);
  const peekRef = useRef<HTMLDivElement | null>(null);
  const safeRef = useRef<HTMLSpanElement | null>(null);
  const [top, setTop] = useState<number | null>(null);
  const dragRef = useRef<{
    id: number;
    startY: number;
    baseY: number;
    y: number;
    dragging: boolean;
    samples: Array<{ y: number; t: number }>;
  } | null>(null);

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
    if (dragRef.current?.dragging) return;
    place(restingY(), true);
  }, [place, restingY, top]);

  useEffect(() => {
    const onResize = () => {
      measure();
      if (!dragRef.current?.dragging) place(restingY(), false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measure, place, restingY]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!present || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const baseY = open ? 0 : closedY();
    dragRef.current = {
      id: event.pointerId,
      startY: event.clientY,
      baseY,
      y: baseY,
      dragging: false,
      samples: [{ y: event.clientY, t: event.timeStamp }],
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dy = event.clientY - drag.startY;
    if (!drag.dragging && Math.abs(dy) < DRAG_SLOP_PX) return;
    drag.dragging = true;
    const maxY = closedY();
    let y = drag.baseY + dy;
    // Soft resistance past either end.
    if (y < 0) y = y / 4;
    if (y > maxY) y = maxY + (y - maxY) / 4;
    drag.y = y;
    drag.samples.push({ y: event.clientY, t: event.timeStamp });
    if (drag.samples.length > 5) drag.samples.shift();
    place(y, false);
  };

  const finish = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    dragRef.current = null;
    if (!drag.dragging) {
      if (!cancelled) onOpenChange(!open);
      return;
    }
    if (cancelled) {
      place(restingY(), true);
      return;
    }
    const first = drag.samples[0]!;
    const last = drag.samples[drag.samples.length - 1]!;
    const velocity = (last.y - first.y) / Math.max(1, last.t - first.t);
    const next =
      velocity <= -FLICK_VELOCITY ? true : velocity >= FLICK_VELOCITY ? false : drag.y < closedY() / 2;
    if (next === open) place(restingY(), true);
    else onOpenChange(next);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpenChange(!open);
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
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
      >
        <div
          ref={grabRef}
          className="draft-sheet__handle"
          role="button"
          tabIndex={present ? 0 : -1}
          aria-expanded={open}
          aria-label={open ? 'Show the court' : 'Show players'}
          onKeyDown={onKeyDown}
        >
          <span aria-hidden="true" />
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
