/**
 * Centralized native haptics for Trade Up.
 *
 * Priority:
 * 1. Capacitor Haptics (true iOS Taptic Engine / Android vibrator when wrapped natively)
 * 2. Android Chrome `navigator.vibrate` fallback (pattern-mapped approximations)
 * 3. No-op on iOS Safari / desktop (WebKit does not expose Core Haptics)
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

function canUseNavigatorVibrate(): boolean {
  return (
    hapticsAllowed() &&
    typeof navigator !== 'undefined' &&
    typeof navigator.vibrate === 'function' &&
    // iOS Safari does not expose the Taptic Engine via vibrate().
    !/iPhone|iPad|iPod/i.test(navigator.userAgent)
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

  const cap = await loadCapacitorHaptics();
  if (cap) {
    try {
      await cap.Haptics.selectionChanged();
      return;
    } catch {
      /* fall through */
    }
  }
  vibrateFallback(8);
}

export async function hapticImpact(style: ImpactStyle = 'light'): Promise<void> {
  if (!hapticsAllowed()) return;
  const now = performance.now();
  if (!allowImpact(style, now)) return;

  const cap = await loadCapacitorHaptics();
  if (cap) {
    try {
      await cap.Haptics.impact({ style: IMPACT_STYLE_MAP[style] });
      return;
    } catch {
      /* fall through */
    }
  }
  vibrateFallback(impactVibratePattern(style));
}

export async function hapticNotification(
  type: NotificationType = 'success',
): Promise<void> {
  if (!hapticsAllowed()) return;
  const now = performance.now();
  if (now - lastNotifyAt < NOTIFY_COOLDOWN_MS) return;
  lastNotifyAt = now;

  const cap = await loadCapacitorHaptics();
  if (cap) {
    try {
      await cap.Haptics.notification({ type: NOTIFY_TYPE_MAP[type] });
      return;
    } catch {
      /* fall through */
    }
  }
  vibrateFallback(notificationVibratePattern(type));
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
