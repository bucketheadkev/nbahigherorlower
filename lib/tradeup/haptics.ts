/**
 * Centralized haptics for Trade Up.
 *
 * Priority:
 * 1. Capacitor Haptics (Taptic Engine / Android vibrator in the native app)
 * 2. Android Chrome `navigator.vibrate`, called in the same tap — before any await
 * 3. iPhone Safari: a real tap on a native switch overlay (the only web path that
 *    still ticks after iOS 26.5). Programmatic clicks do not. Spin ticks from
 *    animation frames cannot vibrate in the browser.
 *
 * Never plays audio. Never simulates haptics with sound.
 */

import { getAudioSettings } from './audioSettings';
import { playPlayerSlotSound } from './h2hEmojiSound';

type ImpactStyle = 'light' | 'medium' | 'heavy' | 'soft' | 'rigid';
type NotificationType = 'success' | 'warning' | 'error';

type CapacitorHapticsModule = {
  Haptics: {
    impact: (opts: { style: string }) => Promise<void>;
    notification: (opts: { type: string }) => Promise<void>;
    selectionStart?: () => Promise<void>;
    selectionChanged: () => Promise<void>;
    selectionEnd?: () => Promise<void>;
  };
};

const IMPACT_STYLE_MAP: Record<ImpactStyle, string> = {
  light: 'LIGHT',
  soft: 'LIGHT',
  medium: 'MEDIUM',
  rigid: 'MEDIUM',
  heavy: 'HEAVY',
};

const NOTIFY_TYPE_MAP: Record<NotificationType, string> = {
  success: 'SUCCESS',
  warning: 'WARNING',
  error: 'ERROR',
};

const IMPACT_COOLDOWN_MS: Record<ImpactStyle, number> = {
  light: 70,
  soft: 72,
  medium: 90,
  rigid: 90,
  heavy: 110,
};

const NOTIFY_COOLDOWN_MS = 120;
const SELECTION_COOLDOWN_MS = 40;

let capacitorHaptics: CapacitorHapticsModule | null | undefined;
let lastImpactAt = 0;
let lastImpactStyle: ImpactStyle | null = null;
let lastNotifyAt = 0;
let lastSelectionAt = 0;
let lastTickIndex = -1;
let spinActive = false;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function hapticsAllowed(): boolean {
  if (!isBrowser()) return false;
  try {
    return getAudioSettings().hapticsEnabled !== false;
  } catch {
    return true;
  }
}

function isNativeApp(): boolean {
  if (!isBrowser()) return false;
  try {
    const cap = (
      window as Window & {
        Capacitor?: { isNativePlatform?: () => boolean };
      }
    ).Capacitor;
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/** Phone website on WebKit. vibrate() exists on some versions and still no-ops. */
function isIosWeb(): boolean {
  if (!isBrowser() || isNativeApp() || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua);
}

function canUseNavigatorVibrate(): boolean {
  return (
    hapticsAllowed() &&
    !isNativeApp() &&
    !isIosWeb() &&
    typeof navigator !== 'undefined' &&
    typeof navigator.vibrate === 'function'
  );
}

async function loadCapacitorHaptics(): Promise<CapacitorHapticsModule | null> {
  if (capacitorHaptics !== undefined) return capacitorHaptics;
  if (!isBrowser()) {
    capacitorHaptics = null;
    return null;
  }
  try {
    const core = await import('@capacitor/core');
    if (!core.Capacitor.isNativePlatform()) {
      capacitorHaptics = null;
      return null;
    }
    const mod = (await import('@capacitor/haptics')) as CapacitorHapticsModule;
    capacitorHaptics = mod;
    return mod;
  } catch {
    capacitorHaptics = null;
    return null;
  }
}

function vibrateFallback(pattern: number | number[]): void {
  if (!canUseNavigatorVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* unsupported */
  }
}

function impactVibratePattern(style: ImpactStyle): number | number[] {
  switch (style) {
    case 'light':
    case 'soft':
      return 10;
    case 'medium':
    case 'rigid':
      return 18;
    case 'heavy':
      return [22, 12, 28];
    default:
      return 12;
  }
}

function notificationVibratePattern(type: NotificationType): number | number[] {
  switch (type) {
    case 'success':
      return [18, 40, 32, 30, 48];
    case 'warning':
      return [24, 40, 24];
    case 'error':
      return [40, 50, 40];
    default:
      return 24;
  }
}

function allowImpact(style: ImpactStyle, now: number): boolean {
  const gap = IMPACT_COOLDOWN_MS[style];
  if (lastImpactStyle === style && now - lastImpactAt < gap) return false;
  if (now - lastImpactAt < Math.min(gap, 24)) return false;
  lastImpactAt = now;
  lastImpactStyle = style;
  return true;
}

/** Light crisp tap — native iOS button press feel. */
export async function hapticSelection(): Promise<void> {
  if (!hapticsAllowed()) return;
  const now = performance.now();
  if (now - lastSelectionAt < SELECTION_COOLDOWN_MS) return;
  lastSelectionAt = now;

  // Must run before the Capacitor import. Android drops vibrate() after an await.
  vibrateFallback(8);

  const cap = await loadCapacitorHaptics();
  if (!cap) return;
  try {
    await cap.Haptics.selectionChanged();
  } catch {
    /* native unavailable */
  }
}

export async function hapticImpact(style: ImpactStyle = 'light'): Promise<void> {
  if (!hapticsAllowed()) return;
  const now = performance.now();
  if (!allowImpact(style, now)) return;

  vibrateFallback(impactVibratePattern(style));

  const cap = await loadCapacitorHaptics();
  if (!cap) return;
  try {
    await cap.Haptics.impact({ style: IMPACT_STYLE_MAP[style] });
  } catch {
    /* native unavailable */
  }
}

export async function hapticNotification(
  type: NotificationType = 'success',
): Promise<void> {
  if (!hapticsAllowed()) return;
  const now = performance.now();
  if (now - lastNotifyAt < NOTIFY_COOLDOWN_MS) return;
  lastNotifyAt = now;

  vibrateFallback(notificationVibratePattern(type));

  const cap = await loadCapacitorHaptics();
  if (!cap) return;
  try {
    await cap.Haptics.notification({ type: NOTIFY_TYPE_MAP[type] });
  } catch {
    /* native unavailable */
  }
}

/** Fire-and-forget wrappers safe to call from click handlers / rAF. */
export function hapticTap(): void {
  void hapticImpact('light');
}

export function hapticLight(): void {
  void hapticImpact('light');
}

export function hapticMedium(): void {
  void hapticImpact('medium');
}

export function hapticHeavy(): void {
  void hapticImpact('heavy');
}

export function hapticSuccess(): void {
  void hapticNotification('success');
}

export function hapticWarning(): void {
  void hapticNotification('warning');
}

export function hapticError(): void {
  void hapticNotification('error');
}

/** Call once when a prize wheel / ticket reel begins spinning. */
export function hapticWheelStart(): void {
  spinActive = true;
  lastTickIndex = -1;
  void hapticImpact('medium');
}

/**
 * Sync light section ticks to continuous reel progress.
 * Pass the eased fractional item offset (same value driving translateY).
 * As the ease decelerates, crossings naturally space farther apart.
 */
export function hapticWheelTick(offsetItems: number): void {
  if (!spinActive) return;
  const idx = Math.floor(offsetItems);
  if (idx <= lastTickIndex) return;
  // Skip bursts — only one tick per discrete cell, and skip if we jumped many cells
  if (lastTickIndex >= 0 && idx - lastTickIndex > 2) {
    lastTickIndex = idx;
    return;
  }
  lastTickIndex = idx;
  // Fire-and-forget; never await on the animation thread
  void hapticImpact('light');
}

/** Alias — spinner selection ticks. */
export function hapticSpinTick(offsetItems: number): void {
  hapticWheelTick(offsetItems);
}

/** Stronger lock feel when the final result settles. */
export function hapticWheelStop(): void {
  spinActive = false;
  lastTickIndex = -1;
  void hapticImpact('heavy');
}

/** Alias — spinner stop lock. */
export function hapticSpinStop(): void {
  hapticWheelStop();
}

/** Short crisp confirm when a player locks into a roster slot. */
export function hapticSlotConfirm(): void {
  void hapticImpact('light');
}

/** Pick-up then slam when a player locks into a roster circle. */
export function hapticSlam(): void {
  playPlayerSlotSound();
  void hapticImpact('heavy');
}

export function hapticTicketPrint(): void {
  void hapticImpact('medium');
}

export function hapticPlayerReveal(): void {
  void hapticImpact('light');
}

export function hapticTicketInsert(): void {
  void hapticImpact('medium');
}

/** One light pulse when a player value finishes counting — never during count-up. */
export function hapticValueComplete(): void {
  void hapticImpact('light');
}

/** Cancel any in-flight web vibrate pattern (Android only). */
export function hapticCancel(): void {
  spinActive = false;
  lastTickIndex = -1;
  if (canUseNavigatorVibrate()) {
    try {
      navigator.vibrate(0);
    } catch {
      /* ignore */
    }
  }
}

/** @deprecated Prefer hapticTap / hapticMedium / hapticSuccess. */
export function triggerHaptic(
  kind:
    | 'tap'
    | 'flip'
    | 'keep'
    | 'trade'
    | 'reveal_s'
    | 'victory'
    | 'promotion'
    | 'ticket_stop',
): void {
  switch (kind) {
    case 'tap':
    case 'flip':
      hapticTap();
      break;
    case 'keep':
    case 'trade':
      hapticMedium();
      break;
    case 'reveal_s':
      hapticHeavy();
      break;
    case 'victory':
    case 'promotion':
    case 'ticket_stop':
      hapticSuccess();
      break;
    default:
      hapticTap();
  }
}

/** @deprecated */
export function startTicketSpinHaptics(): void {
  hapticWheelStart();
}

/** @deprecated */
export function stopTicketSpinHaptics(): void {
  hapticCancel();
}

/** @deprecated */
export function triggerTicketStopHaptic(): void {
  hapticWheelStop();
}

const WEB_HAPTIC_ATTR = 'data-web-haptic';
const WEB_HAPTIC_HOST = 'button, a[href], [role="button"]';

function syncOverlay(sw: HTMLInputElement, host: HTMLElement): void {
  const blocked =
    !hapticsAllowed() ||
    host.hasAttribute('disabled') ||
    host.getAttribute('aria-disabled') === 'true';
  sw.style.pointerEvents = blocked ? 'none' : 'auto';
}

/**
 * iPhone Safari cannot vibrate from script. A direct tap on a native switch
 * still ticks (including after iOS 26.5). Cover each control so the finger
 * lands on the switch, and keep the existing pointerdown handler in the same tap.
 */
export function installWebHapticTargets(): () => void {
  if (!isIosWeb() || typeof document === 'undefined') return () => {};

  const root = document.body;
  if (!root) return () => {};

  const overlays = new Set<HTMLInputElement>();

  const attach = (host: HTMLElement) => {
    if (host.querySelector(`:scope > [${WEB_HAPTIC_ATTR}]`)) return;
    if (host.closest(`[${WEB_HAPTIC_ATTR}]`)) return;
    const pos = getComputedStyle(host).position;
    if (pos !== 'absolute' && pos !== 'relative' && pos !== 'fixed' && pos !== 'sticky') {
      host.style.position = 'relative';
    }

    const sw = document.createElement('input');
    sw.type = 'checkbox';
    sw.setAttribute('switch', '');
    sw.setAttribute(WEB_HAPTIC_ATTR, '');
    sw.setAttribute('aria-hidden', 'true');
    sw.tabIndex = -1;
    sw.style.cssText = [
      'position:absolute',
      'inset:0',
      'z-index:8',
      'width:100%',
      'height:100%',
      'margin:0',
      'padding:0',
      'border:0',
      'opacity:0',
      'appearance:auto',
      '-webkit-appearance:switch',
      'font-size:16px',
      'touch-action:manipulation',
      '-webkit-tap-highlight-color:transparent',
      'cursor:inherit',
    ].join(';');

    sw.addEventListener(
      'pointerdown',
      (event) => {
        if (!hapticsAllowed()) return;
        // Button handlers call preventDefault to kill ghost clicks. That also
        // cancels the switch toggle, which is the only iPhone haptic.
        event.preventDefault = () => {};
      },
      true,
    );
    let forwarding = false;
    sw.addEventListener('click', (event) => {
      if (forwarding) return;
      event.stopPropagation();
      const parent = sw.parentElement;
      if (!parent) return;
      forwarding = true;
      parent.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      forwarding = false;
    });

    host.appendChild(sw);
    overlays.add(sw);
    syncOverlay(sw, host);
  };

  const scan = (root: ParentNode) => {
    if (root instanceof HTMLElement && root.matches(WEB_HAPTIC_HOST)) attach(root);
    root.querySelectorAll(WEB_HAPTIC_HOST).forEach((node) => {
      if (node instanceof HTMLElement) attach(node);
    });
  };

  scan(document);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
        const sw = mutation.target.querySelector(`:scope > [${WEB_HAPTIC_ATTR}]`);
        if (sw instanceof HTMLInputElement) syncOverlay(sw, mutation.target);
      }
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) scan(node);
      }
    }
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'aria-disabled', 'hidden'],
  });

  const onSettings = () => {
    overlays.forEach((sw) => {
      const host = sw.parentElement;
      if (host) syncOverlay(sw, host);
    });
  };
  window.addEventListener('oneb-haptics-change', onSettings);

  return () => {
    observer.disconnect();
    window.removeEventListener('oneb-haptics-change', onSettings);
    overlays.forEach((sw) => sw.remove());
    overlays.clear();
  };
}
