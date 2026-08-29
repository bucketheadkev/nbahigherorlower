/**
 * Ballion SFX — intentionally sparse.
 * Sound plays ONLY for:
 *  1) Team/decade spin (ticket print + wheel ambience)
 *  2) $1B success
 *  3) Optional restrained failure
 * All other game events are silent (haptics handle feedback).
 */

import { getAudioSettings, setSfxMuted, setSfxVolume } from './audioSettings';
import { prepareH2HEmojiAudio } from './h2hEmojiSound';
import {
  playDigitalWheelLock,
  startDigitalWheelSpin,
  stopDigitalWheelSpin,
} from './digitalWheelSound';

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
  | 'ui_secondary'
  | 'billion_celebration';

type SoundId =
  | 'ticket_print'
  | 'ticket_release'
  | 'wheel_spin'
  | 'wheel_stop'
  | 'success_peak'
  | 'billion_celebration'
  | 'defeat';

type SoundDef = {
  path: string;
  volume: number;
  debounceMs: number;
  loop?: boolean;
};

export const TICKET_PRINT_SOUND_PATH = '/sounds/ticket-print.mp3';

const SOUND_DEFS: Record<SoundId, SoundDef> = {
  ticket_print: {
    path: TICKET_PRINT_SOUND_PATH,
    volume: 0.32,
    debounceMs: 0,
    loop: true,
  },
  ticket_release: { path: '/sounds/ticket-release.mp3', volume: 0.34, debounceMs: 120 },
  wheel_spin: { path: '/sounds/wheel-spin.mp3', volume: 0.2, debounceMs: 0, loop: true },
  wheel_stop: { path: '/sounds/wheel-stop.mp3', volume: 0.36, debounceMs: 140 },
  success_peak: { path: '/sounds/success-peak.mp3', volume: 0.34, debounceMs: 400 },
  billion_celebration: {
    path: '/sounds/success-rich.mp3',
    volume: 0.52,
    debounceMs: 600,
  },
  defeat: { path: '/sounds/reject.mp3', volume: 0.22, debounceMs: 280 },
};

/** Only major moments map to audio. Everything else is intentionally silent. */
const EVENT_TO_SOUND: Partial<Record<GameSoundEvent, SoundId>> = {
  perfect_sweep: 'billion_celebration',
  billion_celebration: 'billion_celebration',
  victory: 'success_peak',
  defeat: 'defeat',
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
  prepareH2HEmojiAudio();
}

export function syncAudioSettings(): void {
  applyMasterVolume();
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
  const { sfxMuted } = getAudioSettings();
  if (sfxMuted) return;

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
    result.catch(() => {
      /* autoplay / unlock failures are silent */
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

/** Preload only the sparse major-moment library. */
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
  ensurePlayer('wheel_stop')?.load();
}

/** Start digital prize-wheel ticks (team/era reels). */
export function startWheelSpinSound(expectedDurationMs = 3200): void {
  unlockGameAudio();
  startDigitalWheelSpin(expectedDurationMs);
}

export function stopWheelSpinSound(): void {
  stopDigitalWheelSpin({ playLock: false });
}

/**
 * Start thermal printer + weighted reel ambience.
 * Call synchronously from the Print / Reroll user gesture on iOS.
 */
export function startTicketSpinHum(): void {
  playSound('ticket_print', { force: true });
  startWheelSpinSound();
}

/** Stop continuous machine loops (print + wheel). */
export function stopTicketSpinHum(_fadeMs = 160): void {
  stopSound('ticket_print');
  stopWheelSpinSound();
}

/** Soft paper release when the ticket finishes feeding. */
export function playTicketReleaseSound(): void {
  playSound('ticket_release');
}

/** Wheel ticks are haptic-only — no audio. */
export function playWheelTickSound(): void {
  /* intentionally silent */
}

/** Mechanical stop when reels lock — synthesized digital lock-in. */
export function playWheelStopSound(): void {
  playDigitalWheelLock();
}

/** Roster slot place — haptic-only. */
export function playSlotPlaceSound(): void {
  /* intentionally silent */
}

export function playGameSound(
  event: GameSoundEvent,
  _options?: { withCreditReward?: boolean },
): void {
  if (typeof window === 'undefined') return;
  if (event === 'ticket_print') return;

  const id = EVENT_TO_SOUND[event];
  if (!id) return;
  playSound(id);
  void unlocked;
}
