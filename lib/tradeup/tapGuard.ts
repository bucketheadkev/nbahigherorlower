/**
 * App-wide tap-vs-scroll guard for touch and pen.
 *
 * A click that ends a touch gesture which moved past TAP_SLOP_PX, scrolled anything, or was
 * taken over by the browser (pointercancel — it decided the gesture was a scroll or zoom) is
 * swallowed before any handler sees it, including clicks a WebView synthesizes after a pan.
 * Mouse clicks and keyboard activation (detail === 0) are never touched, and nothing here calls
 * preventDefault on pointer events, so native scrolling, wheel and momentum are unaffected.
 * No touch listeners: on iOS they would make every button flash :active as a scroll begins.
 */

export const TAP_SLOP_PX = 10;
/** Clicks arrive right after the finger lifts; anything later is a new gesture. */
const CLICK_WINDOW_MS = 700;
/** One stray event can come from a programmatic scrollIntoView; real pans produce many. */
const SCROLLS_TO_CANCEL = 2;

interface Gesture {
  id: number;
  x: number;
  y: number;
  moved: boolean;
  scrolls: number;
  cancelled: boolean;
  /** 0 while the finger is down. */
  endedAt: number;
}

type PointLike = { pointerId: number; clientX: number; clientY: number };

/** The decision logic, separate from the DOM so it can be exercised directly. */
export function createTapTracker(now: () => number = () => performance.now()) {
  let gesture: Gesture | null = null;

  const far = (g: Gesture, p: PointLike) => Math.hypot(p.clientX - g.x, p.clientY - g.y) > TAP_SLOP_PX;
  const live = () =>
    gesture && (gesture.endedAt === 0 || now() - gesture.endedAt <= CLICK_WINDOW_MS) ? gesture : null;

  return {
    down(e: PointLike) {
      gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, scrolls: 0, cancelled: false, endedAt: 0 };
    },
    /** A second finger while one is down: a pinch, never a tap. */
    extraPointer() {
      const g = live();
      if (g) g.moved = true;
    },
    move(e: PointLike) {
      const g = live();
      if (g && g.endedAt === 0 && e.pointerId === g.id && !g.moved && far(g, e)) g.moved = true;
    },
    end(e: PointLike, cancelled: boolean) {
      const g = live();
      if (!g || g.endedAt !== 0 || e.pointerId !== g.id) return;
      if (far(g, e)) g.moved = true;
      g.cancelled = cancelled;
      g.endedAt = now();
    },
    scroll() {
      const g = live();
      if (g) g.scrolls += 1;
    },
    /** True when this click ends a drag/scroll and must not activate anything. */
    shouldSuppress(click: { detail: number }): boolean {
      const g = live();
      if (!g || click.detail === 0) return false;
      gesture = null;
      return g.moved || g.cancelled || g.scrolls >= SCROLLS_TO_CANCEL;
    },
  };
}

let installed = false;

export function installTapGuard(): () => void {
  if (installed || typeof window === 'undefined') return () => {};
  installed = true;

  const tracker = createTapTracker();
  const touchLike = (e: PointerEvent) => e.isTrusted && e.pointerType !== 'mouse';

  const onDown = (e: PointerEvent) => {
    if (!touchLike(e)) return;
    if (e.isPrimary) tracker.down(e);
    else tracker.extraPointer();
  };
  const onMove = (e: PointerEvent) => {
    if (touchLike(e) && e.isPrimary) tracker.move(e);
  };
  const onUp = (e: PointerEvent) => {
    if (touchLike(e) && e.isPrimary) tracker.end(e, false);
  };
  const onCancel = (e: PointerEvent) => {
    if (touchLike(e) && e.isPrimary) tracker.end(e, true);
  };
  const onScroll = () => tracker.scroll();
  const onClick = (e: MouseEvent) => {
    if (!tracker.shouldSuppress(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  const opts = { capture: true, passive: true } as const;
  window.addEventListener('pointerdown', onDown, opts);
  window.addEventListener('pointermove', onMove, opts);
  window.addEventListener('pointerup', onUp, opts);
  window.addEventListener('pointercancel', onCancel, opts);
  document.addEventListener('scroll', onScroll, opts);
  window.addEventListener('click', onClick, true);

  return () => {
    installed = false;
    window.removeEventListener('pointerdown', onDown, opts);
    window.removeEventListener('pointermove', onMove, opts);
    window.removeEventListener('pointerup', onUp, opts);
    window.removeEventListener('pointercancel', onCancel, opts);
    document.removeEventListener('scroll', onScroll, opts);
    window.removeEventListener('click', onClick, true);
  };
}
