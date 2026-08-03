/**
 * Rewarded-ad unit IDs and feature flags.
 *
 * Test IDs are used in development / until production units are created.
 * Never put secret API keys in UI components — only ad unit IDs belong here.
 *
 * TODO: Add production rewarded-ad unit ID before App Store release.
 * TODO: Add iOS ATT usage description + AdMob App ID to Info.plist when enabling AdMob.
 * TODO: Install `@capacitor-community/admob` (or chosen provider) and wire RewardedAdService.
 */

export type AdEnvironment = 'development' | 'production';

/** Flip to true once the native AdMob (or other) SDK is installed and configured. */
export const REWARDED_ADS_SDK_ENABLED = false;

/**
 * Show the reusable rewarded-ad button in the draft UI.
 * Safe to leave true — the stub service never grants rewards without a completed ad.
 */
export const REWARDED_ADS_UI_ENABLED = true;

export function getAdEnvironment(): AdEnvironment {
  if (process.env.NEXT_PUBLIC_AD_ENV === 'production') return 'production';
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_AD_ENV !== 'development') {
    // Default production web/native builds to production IDs once configured.
    // Still safe: SDK is gated by REWARDED_ADS_SDK_ENABLED.
    return 'production';
  }
  return 'development';
}

/**
 * Google AdMob sample rewarded unit IDs (safe for development).
 * @see https://developers.google.com/admob/ios/test-ads
 */
export const REWARDED_AD_UNIT_IDS = {
  development: {
    /** AdMob iOS rewarded test unit */
    ios: 'ca-app-pub-3940256099942544/1712485313',
    /** AdMob Android rewarded test unit */
    android: 'ca-app-pub-3940256099942544/5224354917',
  },
  production: {
    // TODO: Add production rewarded-ad unit ID before App Store release.
    ios: '',
    // TODO: Add production Android rewarded-ad unit ID before Play Store release.
    android: '',
  },
} as const;

export function getRewardedAdUnitId(platform: 'ios' | 'android'): string {
  const env = getAdEnvironment();
  return REWARDED_AD_UNIT_IDS[env][platform];
}

/** Placement keys for future reward wiring (rerolls, bonus runs, etc.). */
export type RewardedAdPlacement =
  | 'extra_team_reroll'
  | 'extra_era_reroll'
  | 'bonus_opportunity'
  | 'dev_test';
