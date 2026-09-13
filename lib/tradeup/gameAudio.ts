/**
 * Ballion SFX — intentionally sparse.
 * Sound plays ONLY for:
 *  1) Team/era wheel spin (bundled Pixabay spin sample)
 *  2) Final total settle (cash register)
 *  3) $1B / major result stingers
 * All other game events are silent (haptics handle feedback).
 */

import { getAudioSettings, setSfxMuted, setSfxVolume } from './audioSettings';
import { prepareH2HEmojiAudio } from './h2hEmojiSound';
import { playDigitalWheelLock } from './digitalWheelSound';

/** Team + Era reel duration (initial spin and every Team/Era reroll). */
export const WHEEL_SPIN_DURATION_MS = 2940;

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
  | 'billion_celebration'
  | 'results_celebration';

type SoundId =
  | 'ticket_print'
  | 'ticket_release'
  | 'wheel_spin'
  | 'wheel_stop'
  | 'success_peak'
  | 'success_soft'
  | 'results_cheer'
  | 'cash_register'
  | 'billion_celebration'
  | 'defeat';

type SoundDef = {
  path: string;
  volume: number;
  debounceMs: number;
  loop?: boolean;
  /** Hard-stop playback after this many ms (peaceful stingers ≤2s). */
  maxPlayMs?: number;
};

export const TICKET_PRINT_SOUND_PATH = '/sounds/ticket-print.mp3';
/** Pixabay: film-special-effects-spin-232536 (victorabdo). */
export const WHEEL_SPIN_SOUND_PATH = '/sounds/wheel-spin.mp3';
/** Pixabay: film-special-effects-cash-register-1-481216 (ksjsbwuil). */
export const CASH_REGISTER_SOUND_PATH = '/sounds/cash-register.mp3';

/**
 * Wheel spin loudness.
 * Baseline (pre-quiet) was 0.42; 40% quieter = 0.42 * 0.6 = 0.252.
 * Played via AudioBuffer + GainNode so volume works on iOS WKWebView
 * (HTMLAudioElement.volume is ignored there; MediaElementSource was muting).
 */
const WHEEL_SPIN_VOLUME_BASE = 0.42;
const WHEEL_SPIN_VOLUME = WHEEL_SPIN_VOLUME_BASE * 0.6;

const SOUND_DEFS: Record<SoundId, SoundDef> = {
  ticket_print: {
    path: TICKET_PRINT_SOUND_PATH,
    volume: 0.32,
    debounceMs: 0,
    loop: true,
  },
  ticket_release: { path: '/sounds/ticket-release.mp3', volume: 0.34, debounceMs: 120 },
  wheel_spin: {
    path: WHEEL_SPIN_SOUND_PATH,
    volume: WHEEL_SPIN_VOLUME,
    debounceMs: 0,
    loop: false,
  },
  wheel_stop: { path: '/sounds/wheel-stop.mp3', volume: 0.36, debounceMs: 140 },
  success_peak: { path: '/sounds/success-peak.mp3', volume: 0.34, debounceMs: 400 },
  success_soft: { path: '/sounds/success-soft.mp3', volume: 0.4, debounceMs: 400, maxPlayMs: 1800 },
  /** Legacy alias — final total uses cash_register. */
  results_cheer: {
    path: CASH_REGISTER_SOUND_PATH,
    volume: 0.48,
    debounceMs: 800,
  },
  cash_register: {
    path: CASH_REGISTER_SOUND_PATH,
    volume: 0.48,
    debounceMs: 800,
  },
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
  results_celebration: 'cash_register',
  victory: 'success_peak',
  defeat: 'defeat',
};

let ctx: AudioContext | null = null;
let unlocked = false;
const players = new Map<SoundId, HTMLAudioElement>();
const lastPlayed = new Map<string, number>();
let preloaded = false;
let wheelSpinToken = 0;
let wheelSpinStopTimer = 0;
/** Decoded wheel sample — GainNode volume works on iOS (unlike element.volume). */
let wheelSpinBuffer: AudioBuffer | null = null;
let wheelSpinBufferPromise: Promise<AudioBuffer | null> | null = null;
let wheelSpinSource: AudioBufferSourceNode | null = null;
let wheelSpinGain: GainNode | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    ctx = new AudioContext();
  }
  return ctx;
}

function masterScale(): number {
  const { sfxVolume, sfxMuted } = getAudioSettings();
  if (sfxMuted) return 0;
  return Math.min(1, Math.max(0.15, sfxVolume));
}

function wheelSpinGainValue(): number {
  return Math.min(1, Math.max(0, WHEEL_SPIN_VOLUME * masterScale()));
}

function stopWheelSpinBufferSource(): void {
  if (wheelSpinSource) {
    try {
      wheelSpinSource.stop();
    } catch {
      /* already stopped */
    }
    try {
      wheelSpinSource.disconnect();
    } catch {
      /* ignore */
    }
    wheelSpinSource = null;
  }
  if (wheelSpinGain) {
    try {
      wheelSpinGain.disconnect();
    } catch {
      /* ignore */
    }
    wheelSpinGain = null;
  }
}

function ensureWheelSpinBuffer(): Promise<AudioBuffer | null> {
  if (wheelSpinBuffer) return Promise.resolve(wheelSpinBuffer);
  if (wheelSpinBufferPromise) return wheelSpinBufferPromise;

  const audio = getCtx();
  if (!audio) return Promise.resolve(null);

  wheelSpinBufferPromise = (async () => {
    try {
      const res = await fetch(WHEEL_SPIN_SOUND_PATH);
      if (!res.ok) return null;
      const raw = await res.arrayBuffer();
      // decodeAudioData may detach the buffer — copy first.
      const copy = raw.slice(0);
      const decoded = await audio.decodeAudioData(copy);
      wheelSpinBuffer = decoded;
      return decoded;
    } catch {
      return null;
    }
  })();

  return wheelSpinBufferPromise;
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
  if (audio.state === 'suspended') void audio.resume();
  void ensureWheelSpinBuffer();
  prepareH2HEmojiAudio();
}

export function syncAudioSettings(): void {
  if (wheelSpinGain) {
    wheelSpinGain.gain.value = wheelSpinGainValue();
  }
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

  if (def.maxPlayMs && def.maxPlayMs > 0 && !def.loop) {
    window.setTimeout(() => {
      const current = players.get(id);
      if (!current || current !== el) return;
      try {
        current.pause();
        current.currentTime = 0;
      } catch {
        /* ignore */
      }
    }, def.maxPlayMs);
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
  ensurePlayer('cash_register')?.load();
}

function clearWheelSpinStopTimer(): void {
  if (wheelSpinStopTimer) {
    window.clearTimeout(wheelSpinStopTimer);
    wheelSpinStopTimer = 0;
  }
}

/**
 * Play the bundled wheel-spin sample once, rate-fitted so it ends with the reel
 * (default 2940 ms). Stops any prior spin before starting — no overlap.
 * Uses Web Audio buffer playback so gain is audible on iOS.
 */
export function startWheelSpinSound(
  expectedDurationMs: number = WHEEL_SPIN_DURATION_MS,
): void {
  if (typeof window === 'undefined') return;
  const { sfxMuted } = getAudioSettings();
  if (sfxMuted) return;

  unlockGameAudio();
  stopWheelSpinSound();

  const targetMs = Math.max(80, expectedDurationMs);
  const token = ++wheelSpinToken;

  const startHtmlFallback = () => {
    if (token !== wheelSpinToken) return;
    const el = ensurePlayer('wheel_spin');
    if (!el) return;

    const naturalSec = Number.isFinite(el.duration) && el.duration > 0.05 ? el.duration : null;
    el.playbackRate = naturalSec
      ? Math.min(2.5, Math.max(0.45, naturalSec / (targetMs / 1000)))
      : 1;
    el.loop = false;
    el.muted = false;
    el.volume = wheelSpinGainValue();
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
    clearWheelSpinStopTimer();
    wheelSpinStopTimer = window.setTimeout(() => {
      if (token !== wheelSpinToken) return;
      stopSound('wheel_spin');
      try {
        el.playbackRate = 1;
      } catch {
        /* ignore */
      }
    }, targetMs + 80);
  };

  const startFromBuffer = (buf: AudioBuffer) => {
    if (token !== wheelSpinToken) return;
    const audio = getCtx();
    if (!audio) {
      startHtmlFallback();
      return;
    }

    void audio.resume().then(() => {
      if (token !== wheelSpinToken) return;

      stopWheelSpinBufferSource();
      stopSound('wheel_spin');

      const gain = audio.createGain();
      gain.gain.value = wheelSpinGainValue();
      gain.connect(audio.destination);
      wheelSpinGain = gain;

      const src = audio.createBufferSource();
      src.buffer = buf;
      const naturalSec = buf.duration > 0.05 ? buf.duration : null;
      src.playbackRate.value = naturalSec
        ? Math.min(2.5, Math.max(0.45, naturalSec / (targetMs / 1000)))
        : 1;
      src.connect(gain);
      wheelSpinSource = src;

      try {
        src.start(0);
      } catch {
        stopWheelSpinBufferSource();
        startHtmlFallback();
        return;
      }

      clearWheelSpinStopTimer();
      wheelSpinStopTimer = window.setTimeout(() => {
        if (token !== wheelSpinToken) return;
        stopWheelSpinBufferSource();
      }, targetMs + 80);

      src.onended = () => {
        if (wheelSpinSource === src) {
          stopWheelSpinBufferSource();
        }
      };
    });
  };

  void ensureWheelSpinBuffer().then((buf) => {
    if (token !== wheelSpinToken) return;
    if (buf) {
      startFromBuffer(buf);
      return;
    }
    startHtmlFallback();
  });
}

/** Stop team/era spin audio (leave screen / new spin / unmount). */
export function stopWheelSpinSound(): void {
  wheelSpinToken += 1;
  clearWheelSpinStopTimer();
  stopWheelSpinBufferSource();
  const el = players.get('wheel_spin');
  stopSound('wheel_spin');
  if (el) {
    try {
      el.playbackRate = 1;
    } catch {
      /* ignore */
    }
  }
}

/**
 * Start thermal printer + wheel spin sample.
 * Call synchronously from the Print / Reroll user gesture on iOS.
 */
export function startTicketSpinHum(): void {
  playSound('ticket_print', { force: true });
  startWheelSpinSound(WHEEL_SPIN_DURATION_MS);
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

/**
 * Mechanical stop for non–team/era reels (prize wheels, name reels).
 * Team/era spins use the fitted Pixabay sample only — no extra lock chime.
 */
export function playWheelStopSound(): void {
  playDigitalWheelLock();
}

/** Final combined total settle — once per reveal. */
export function playFinalTotalSettleSound(): void {
  playSound('cash_register', { force: true });
}

/** Stop cash-register / results stinger when leaving the reveal screen. */
export function stopFinalTotalSettleSound(): void {
  stopSound('cash_register');
  stopSound('results_cheer');
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
