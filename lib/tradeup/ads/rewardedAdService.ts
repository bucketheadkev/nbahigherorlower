/**
 * Centralized rewarded-ad facade.
 *
 * Keeps all ad provider logic out of gameplay screens.
 * Currently a complete stub that compiles without an advertising SDK.
 *
 * Final setup before going live:
 * 1. `npm i @capacitor-community/admob` (or chosen provider)
 * 2. Add AdMob App ID + ATT string to ios/App/App/Info.plist
 * 3. Set production unit IDs in `adConfig.ts`
 * 4. Set `REWARDED_ADS_SDK_ENABLED = true`
 * 5. Implement provider calls inside `loadNative` / `showNative` below
 */

import {
  REWARDED_ADS_SDK_ENABLED,
  getRewardedAdUnitId,
  type RewardedAdPlacement,
} from './adConfig';

export type RewardedAdState =
  | 'idle'
  | 'initializing'
  | 'loading'
  | 'ready'
  | 'showing'
  | 'rewarded'
  | 'dismissed'
  | 'unavailable'
  | 'failed';

export type RewardedAdResult =
  | 'rewarded'
  | 'dismissed'
  | 'unavailable'
  | 'failed'
  | 'busy';

type Listener = (state: RewardedAdState) => void;

let state: RewardedAdState = 'idle';
let initialized = false;
let listeners = new Set<Listener>();
let loadPromise: Promise<boolean> | null = null;
let showPromise: Promise<RewardedAdResult> | null = null;

function setState(next: RewardedAdState) {
  state = next;
  listeners.forEach((fn) => {
    try {
      fn(next);
    } catch {
      /* ignore listener errors */
    }
  });
}

function isNativePlatform(): boolean {
  try {
    // Dynamic require-style check without hard dependency on Capacitor globals at build time
    const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}

function platformKey(): 'ios' | 'android' {
  try {
    const cap = (globalThis as {
      Capacitor?: { getPlatform?: () => string };
    }).Capacitor;
    const p = cap?.getPlatform?.() ?? 'ios';
    return p === 'android' ? 'android' : 'ios';
  } catch {
    return 'ios';
  }
}

async function loadNative(): Promise<boolean> {
  /**
   * TODO: Wire real provider once `@capacitor-community/admob` (or similar) is installed.
   *
   * Example (do not uncomment until the package is installed):
   *   import { AdMob, RewardAdPluginEvents } from '@capacitor-community/admob';
   *   await AdMob.prepareRewardVideoAd({ adId: getRewardedAdUnitId(platformKey()) });
   */
  const unitId = getRewardedAdUnitId(platformKey());
  if (!unitId) {
    console.info(
      '[RewardedAdService] Production ad unit ID is empty — configure adConfig.ts before release.',
    );
    return false;
  }
  // SDK not enabled yet — report unavailable rather than crashing.
  console.info(
    '[RewardedAdService] SDK stub active. Unit would be:',
    unitId,
    'Set REWARDED_ADS_SDK_ENABLED after installing the provider.',
  );
  return false;
}

async function showNative(): Promise<RewardedAdResult> {
  /**
   * TODO: Present rewarded ad from the active Capacitor view controller via the SDK.
   * Grant 'rewarded' ONLY when the provider fires the user-earned-reward callback.
   * Map early close / fail → 'dismissed' | 'failed' — never grant a reward.
   */
  return 'unavailable';
}

export const RewardedAdService = {
  getState(): RewardedAdState {
    return state;
  },

  isReady(): boolean {
    return state === 'ready';
  },

  isBusy(): boolean {
    return state === 'loading' || state === 'showing' || state === 'initializing';
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener(state);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Call once at app launch (TradeUpApp). Safe to call repeatedly. */
  async initialize(): Promise<void> {
    if (initialized) return;
    initialized = true;
    setState('initializing');

    if (!REWARDED_ADS_SDK_ENABLED || !isNativePlatform()) {
      // Web / stub: remain idle/unavailable so UI can show "Ads coming soon".
      setState('unavailable');
      return;
    }

    try {
      // TODO: AdMob.initialize({ ... }) when SDK is installed.
      setState('idle');
      await RewardedAdService.preload();
    } catch (err) {
      console.warn('[RewardedAdService] initialize failed', err);
      setState('failed');
    }
  },

  /** Preload a rewarded ad. Idempotent. */
  async preload(): Promise<boolean> {
    if (state === 'ready') return true;
    if (state === 'showing') return false;
    if (loadPromise) return loadPromise;

    if (!REWARDED_ADS_SDK_ENABLED || !isNativePlatform()) {
      setState('unavailable');
      return false;
    }

    setState('loading');
    loadPromise = (async () => {
      try {
        const ok = await loadNative();
        setState(ok ? 'ready' : 'unavailable');
        return ok;
      } catch (err) {
        console.warn('[RewardedAdService] preload failed', err);
        setState('failed');
        return false;
      } finally {
        loadPromise = null;
      }
    })();

    return loadPromise;
  },

  /**
   * Present a rewarded ad for a named placement.
   * Resolves 'rewarded' only after provider confirmation.
   * Never grants reward on fail / early close / unavailable.
   */
  async show(placement: RewardedAdPlacement): Promise<RewardedAdResult> {
    if (showPromise) return 'busy';
    if (state === 'showing' || state === 'loading') return 'busy';

    if (!REWARDED_ADS_SDK_ENABLED || !isNativePlatform()) {
      setState('unavailable');
      return 'unavailable';
    }

    if (state !== 'ready') {
      const loaded = await RewardedAdService.preload();
      if (!loaded) return 'unavailable';
    }

    setState('showing');
    showPromise = (async () => {
      try {
        const result = await showNative();
        if (result === 'rewarded') {
          setState('rewarded');
        } else if (result === 'dismissed') {
          setState('dismissed');
        } else if (result === 'failed') {
          setState('failed');
        } else {
          setState('unavailable');
        }
        // Always begin loading the next ad after a presentation attempt.
        void RewardedAdService.preload();
        return result;
      } catch (err) {
        console.warn('[RewardedAdService] show failed', err, { placement });
        setState('failed');
        void RewardedAdService.preload();
        return 'failed';
      } finally {
        showPromise = null;
      }
    })();

    return showPromise;
  },
};
