/** Local storage keys written by 1B Run (solo progress, settings, multiplayer prefs). */
const APP_LOCAL_STORAGE_KEYS = [
  'ballion_mp_active_room_v1',
  'ballion_h2h_username_v1',
  'ballion_h2h_entitlements_dev_v1',
  'oneb-run-locale',
  'oneb_billion_runs_v1',
  'oneb_challenges_v1',
  'tradeup_muted',
  'tradeup_sfx_volume_v1',
  'tradeup_music_muted_v1',
  'tradeup_music_volume_v1',
  'tradeup_haptics_v1',
  'tradeup_best_chain',
  'tradeup_best_season_record_v1',
  'tradeup_best_roster_value_v1',
  'tradeup_credits',
  'tradeup_starting_tier',
  'tradeup_starting_tiers_owned',
  'tradeup_dev_credits_50k_v1',
  'tradeup_negotiation_tutorial_seen',
  'tradeup_best_world_rank_v1',
  'tradeup_best_four_player_sum_v1',
  'tradeup_trophy_profile_v1',
  'tradeup_franchise',
  'tradeup_championship_rings_v1',
  'tradeup_lineup_session_v11',
  'tradeup_lineup_session_v10',
  'tradeup_lineup_session_v9',
  'tradeup_lineup_session_v8',
  'tradeup_lineup_session_v7',
  'tradeup_lineup_session_v6',
  'tradeup_lineup_session_v5',
  'tradeup_lineup_session_v4',
  'tradeup_lineup_session_v3',
  'tradeup_lineup_session_v2',
  'tradeup_lineup_session_v1',
  'tradeup_full_motion',
  'nba-higher-lower-best-streak',
  'nba-higher-lower-x-username',
  'shot-clock-best-tier',
] as const;

/** Clears on-device game data for this installation (not other users on shared devices). */
export function clearLocalUserData(): void {
  if (typeof window === 'undefined') return;

  for (const key of APP_LOCAL_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore quota / privacy errors */
    }
  }

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (key.startsWith('sb-') && key.includes('auth')) {
        keysToRemove.push(key);
      }
      if (key.startsWith('nba-higher-lower-mode-best-')) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }

  try {
    window.dispatchEvent(new Event('oneb:userdata-cleared'));
  } catch {
    /* ignore */
  }
}

export const USER_DATA_CLEARED_EVENT = 'oneb:userdata-cleared';
