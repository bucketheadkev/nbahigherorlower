/**
 * Trade Up premium SFX — cohesive file-based library for Capacitor iOS.
 *
 * Design rules:
 * - Real MP3 assets under /sounds (never oscillator beeps as primary UX)
 * - One HTMLAudioElement per cue (no overlapping copies / leaks)
 * - Immediate play from user-gesture paths; continuous loops stop on completion
 * - Haptics live elsewhere and must not be altered from this module
 */

import { getAudioSettings, setSfxMuted, setSfxVolume } from './audioSettings';

export type GameSoundEvent =
  | 'ui_hover'
  | 'ui_press'
  | 'ui_back'
  | 'card_lift'
  | 'card_flip'
  | 'card_land'
  | 'reveal_standard'
  | 'reveal_hidden_s'
  | 'keep'
  | 'keep_lock'
  | 'credit_reward'
  | 'credit_spend'
  | 'trade_open'
  | 'trade_complete'
  | 'market_reroll'
  | 'lineup_complete'
  | 'match_go'
  | 'matchmaking'
  | 'opponent_found'
  | 'opponent_reveal'
  | 'match_calc'
  | 'battle_round_appear'
  | 'battle_charge'
  | 'battle_lunge'
  | 'battle_slap'
  | 'battle_knockout'
  | 'battle_counter'
  | 'battle_round_win'
  | 'battle_round_loss'
  | 'victory'
  | 'perfect_sweep'
  | 'defeat'
  | 'trophy_gain'
  | 'trophy_loss'
  | 'rank_up'
  | 'rank_down'
  | 'accept'
  | 'reject'
  | 'unlock'
  | 'collect'
  | 'bank_coin'
  | 'ticket_print'
  | 'ticket_ding'
  | 'ticket_tear'
  | 'slot_place'
  | 'ui_confirm'
  | 'ui_secondary';

type SoundId =
  | 'ui_tap'
  | 'ui_back'
  | 'ui_confirm'
  | 'ui_secondary'
  | 'slot_place'
  | 'reject'
  | 'ticket_print'
  | 'ticket_release'
  | 'wheel_spin'
  | 'wheel_tick'
  | 'wheel_stop'
  | 'success_soft'
  | 'success_rich'
  | 'success_peak'
  | 'keep_lock'
  | 'card_flip'
  | 'reveal'
  | 'collect';

type SoundDef = {
  path: string;
  /** 0–1 peak gain before master sfx volume */
  volume: number;
  debounceMs: number;
  loop?: boolean;
};

/** Public asset paths — copied into Capacitor `out/sounds` on build:ios. */
export const TICKET_PRINT_SOUND_PATH = '/sounds/ticket-print.mp3';

const SOUND_DEFS: Record<SoundId, SoundDef> = {
  ui_tap: { path: '/sounds/ui-tap.mp3', volume: 0.34, debounceMs: 36 },
  ui_back: { path: '/sounds/ui-back.mp3', volume: 0.3, debounceMs: 70 },
  ui_confirm: { path: '/sounds/ui-confirm.mp3', volume: 0.36, debounceMs: 80 },
  ui_secondary: { path: '/sounds/ui-secondary.mp3', volume: 0.32, debounceMs: 70 },
  slot_place: { path: '/sounds/slot-place.mp3', volume: 0.38, debounceMs: 90 },
  reject: { path: '/sounds/reject.mp3', volume: 0.3, debounceMs: 90 },
  ticket_print: {
    path: TICKET_PRINT_SOUND_PATH,
    volume: 0.36,
    debounceMs: 0,
    loop: true,
  },
  ticket_release: { path: '/sounds/ticket-release.mp3', volume: 0.4, debounceMs: 120 },
  wheel_spin: { path: '/sounds/wheel-spin.mp3', volume: 0.24, debounceMs: 0, loop: true },
  wheel_tick: { path: '/sounds/wheel-tick.mp3', volume: 0.18, debounceMs: 42 },
  wheel_stop: { path: '/sounds/wheel-stop.mp3', volume: 0.4, debounceMs: 140 },
  success_soft: { path: '/sounds/success-soft.mp3', volume: 0.34, debounceMs: 200 },
  success_rich: { path: '/sounds/success-rich.mp3', volume: 0.36, debounceMs: 280 },
  success_peak: { path: '/sounds/success-peak.mp3', volume: 0.38, debounceMs: 400 },
  keep_lock: { path: '/sounds/keep-lock.mp3', volume: 0.36, debounceMs: 220 },
  card_flip: { path: '/sounds/card-flip.mp3', volume: 0.32, debounceMs: 70 },
  reveal: { path: '/sounds/reveal.mp3', volume: 0.34, debounceMs: 180 },
  collect: { path: '/audio/add-collection.wav', volume: 0.32, debounceMs: 350 },
};

const EVENT_TO_SOUND: Partial<Record<GameSoundEvent, SoundId>> = {
  ui_hover: 'ui_tap',
  ui_press: 'ui_tap',
  ui_back: 'ui_back',
  ui_confirm: 'ui_confirm',
  ui_secondary: 'ui_secondary',
  accept: 'ui_confirm',
  reject: 'reject',
  slot_place: 'slot_place',
  card_lift: 'ui_secondary',
  card_flip: 'card_flip',
  card_land: 'ui_tap',
  reveal_standard: 'reveal',
  reveal_hidden_s: 'success_rich',
  keep: 'keep_lock',
  keep_lock: 'keep_lock',
  credit_reward: 'success_soft',
  credit_spend: 'ui_secondary',
  trade_open: 'ui_secondary',
  trade_complete: 'success_soft',
  market_reroll: 'ui_secondary',
  lineup_complete: 'success_rich',
  match_go: 'ui_confirm',
  matchmaking: 'ui_tap',
  opponent_found: 'success_soft',
  opponent_reveal: 'reveal',
  match_calc: 'ui_secondary',
  battle_round_appear: 'ui_tap',
  battle_charge: 'ui_secondary',
  battle_lunge: 'ui_tap',
  battle_slap: 'slot_place',
  battle_knockout: 'wheel_stop',
  battle_counter: 'ui_secondary',
  battle_round_win: 'success_soft',
  battle_round_loss: 'reject',
  victory: 'success_peak',
  perfect_sweep: 'success_peak',
  defeat: 'reject',
  trophy_gain: 'success_soft',
  trophy_loss: 'reject',
  rank_up: 'success_rich',
  rank_down: 'reject',
  unlock: 'success_soft',
  collect: 'collect',
  bank_coin: 'success_soft',
  ticket_print: 'ticket_print',
  ticket_ding: 'ticket_release',
  ticket_tear: 'ticket_release',
};

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let unlocked = false;
const players = new Map<SoundId, HTMLAudioElement>();
const lastPlayed = new Map<string, number>();
let preloaded = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
    applyMasterVolume();
  }
  return ctx;
}

function applyMasterVolume(): void {
  if (!masterGain) return;
  const { sfxVolume } = getAudioSettings();
  masterGain.gain.value = sfxVolume;
}

function masterScale(): number {
  const { sfxVolume, sfxMuted } = getAudioSettings();
  // Product rule: mute UI removed — still honor stored mute if ever set.
  if (sfxMuted) return 0;
  return Math.min(1, Math.max(0.15, sfxVolume));
}

function canPlay(key: string, debounceMs: number): boolean {
  if (debounceMs <= 0) return true;
  const now = performance.now();
  const last = lastPlayed.get(key) ?? 0;
  if (now - last < debounceMs) return false;
  lastPlayed.set(key, now);
  return true;
}

export function unlockGameAudio(): void {
  const audio = getCtx();
  if (!audio) return;
  unlocked = true;
  applyMasterVolume();
  if (audio.state === 'suspended') void audio.resume();
}

export function syncAudioSettings(): void {
  applyMasterVolume();
  // Refresh volumes on cached elements when settings change.
  players.forEach((el, id) => {
    const def = SOUND_DEFS[id];
    el.volume = Math.min(1, def.volume * masterScale());
    el.muted = false;
  });
}

export function setGameSfxMuted(muted: boolean): void {
  setSfxMuted(muted);
  syncAudioSettings();
}

export function setGameSfxVolume(volume: number): void {
  setSfxVolume(volume);
  syncAudioSettings();
}

function ensurePlayer(id: SoundId): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  const existing = players.get(id);
  if (existing) return existing;

  const def = SOUND_DEFS[id];
  const el = new Audio(def.path);
  el.preload = 'auto';
  el.loop = Boolean(def.loop);
  el.muted = false;
  el.volume = Math.min(1, def.volume * masterScale());
  players.set(id, el);
  return el;
}

function playSound(id: SoundId, opts?: { force?: boolean }): void {
  if (typeof window === 'undefined') return;
  const def = SOUND_DEFS[id];
  if (!opts?.force && !canPlay(id, def.debounceMs)) return;

  unlockGameAudio();
  const el = ensurePlayer(id);
  if (!el) return;

  el.muted = false;
  el.loop = Boolean(def.loop);
  el.volume = Math.min(1, def.volume * masterScale());
  try {
    el.currentTime = 0;
  } catch {
    /* seek may fail before metadata */
  }

  const result = el.play();
  if (result && typeof result.then === 'function') {
    result.catch((err: unknown) => {
      console.error(`[sfx] play() failed for ${id} (${def.path}):`, err);
    });
  }
}

function stopSound(id: SoundId): void {
  const el = players.get(id);
  if (!el) return;
  try {
    el.pause();
    el.currentTime = 0;
  } catch {
    /* ignore */
  }
}

/** Preload the full premium library (and legacy collect wav). */
export function preloadGameAudio(): void {
  if (typeof window === 'undefined' || preloaded) return;
  unlockGameAudio();
  (Object.keys(SOUND_DEFS) as SoundId[]).forEach((id) => {
    const el = ensurePlayer(id);
    el?.load();
  });
  preloaded = true;
}

export function preloadTicketPrintSound(): void {
  ensurePlayer('ticket_print')?.load();
  ensurePlayer('ticket_release')?.load();
  ensurePlayer('wheel_spin')?.load();
  ensurePlayer('wheel_tick')?.load();
  ensurePlayer('wheel_stop')?.load();
}

/**
 * Start thermal printer + weighted reel ambience.
 * Call synchronously from the Print / Reroll user gesture on iOS.
 */
export function startTicketSpinHum(): void {
  playSound('ticket_print', { force: true });
  playSound('wheel_spin', { force: true });
}

/** Stop continuous machine loops (print + wheel). */
export function stopTicketSpinHum(_fadeMs = 160): void {
  stopSound('ticket_print');
  stopSound('wheel_spin');
}

/** Soft paper release when the ticket finishes feeding. */
export function playTicketReleaseSound(): void {
  playSound('ticket_release');
}

/** Tiny mechanical reel tick — keep sparse; synced from reel progress. */
export function playWheelTickSound(): void {
  playSound('wheel_tick');
}

/** Satisfying mechanical stop when reels lock. */
export function playWheelStopSound(): void {
  playSound('wheel_stop');
}

/** Extremely subtle snap when a player locks into a roster slot. */
export function playSlotPlaceSound(): void {
  playSound('slot_place');
}

export function playGameSound(
  event: GameSoundEvent,
  _options?: { withCreditReward?: boolean },
): void {
  if (typeof window === 'undefined') return;

  // Continuous printer is owned by TicketDispenser start/stop APIs.
  if (event === 'ticket_print') return;

  const id = EVENT_TO_SOUND[event];
  if (!id) return;

  // keep + credit: slightly richer, still the same family
  if (event === 'keep' && _options?.withCreditReward) {
    playSound('keep_lock');
    window.setTimeout(() => playSound('success_soft'), 90);
    return;
  }

  playSound(id);
  void unlocked;
}
