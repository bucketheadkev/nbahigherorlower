/**
 * 1v1 emoji taps — Pixabay MP3 samples (local playback only).
 * Player slot placement uses synthesized trophy chime (unchanged from pre-Pixabay).
 * Sources: public/audio/h2h/CREDITS.txt
 */

import { getAudioSettings } from './audioSettings';

const EMOJI_MAX_SEC_DEFAULT = 4;
const RESULT_MAX_SEC = 5;

const EMOJI_MAX_SEC: Partial<Record<string, number>> = {
  '🚀': 2,
};

const EMOJI_SRC: Record<string, string> = {
  '🐐': '/audio/h2h/goat.mp3',
  '👑': '/audio/h2h/crown.mp3',
  '😂': '/audio/h2h/laugh-soft.mp3',
  '🔥': '/audio/h2h/fire.mp3',
  '🎯': '/audio/h2h/target.mp3',
  '🏆': '/audio/h2h/trophy.mp3',
  '⭐': '/audio/h2h/star.mp3',
  '💰': '/audio/h2h/money.mp3',
  '🚀': '/audio/h2h/rocket.mp3',
  '🎉': '/audio/h2h/party.mp3',
  '💎': '/audio/h2h/gem.mp3',
  '😮': '/audio/h2h/wow.mp3',
};

const VICTORY_SRC = '/audio/h2h/victory.mp3';
const DEFEAT_SRC = '/audio/h2h/defeat.mp3';

const cache = new Map<string, HTMLAudioElement>();
const buffers = new Map<string, AudioBuffer>();
const bufferJobs = new Map<string, Promise<AudioBuffer | null>>();

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

const TROPHY_FREQS = [392, 523, 659] as const;
const TROPHY_NOTE_GAP = 0.034;
const TROPHY_EMOJI_GAIN = 0.07;
/** Roster slot placement — louder than emoji-bar trophy taps. */
const SLOT_PLACE_GAIN = 0.22;

function sfxScale(): number {
  const { sfxMuted, sfxVolume } = getAudioSettings();
  if (sfxMuted) return 0;
  return Math.min(1, Math.max(0.12, sfxVolume * 0.85));
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (master) master.gain.value = sfxScale();
  return ctx;
}

const REACTION_SRCS = [...Object.values(EMOJI_SRC), VICTORY_SRC, DEFEAT_SRC];

function ensureSampleBuffer(src: string): Promise<AudioBuffer | null> {
  const ready = buffers.get(src);
  if (ready) return Promise.resolve(ready);
  const pending = bufferJobs.get(src);
  if (pending) return pending;

  const audio = getCtx();
  if (!audio) return Promise.resolve(null);

  const job = (async () => {
    try {
      const res = await fetch(src);
      if (!res.ok) return null;
      const raw = await res.arrayBuffer();
      const decoded = await audio.decodeAudioData(raw.slice(0));
      buffers.set(src, decoded);
      return decoded;
    } catch {
      return null;
    }
  })();
  bufferJobs.set(src, job);
  return job;
}

/** Decode emoji and result samples ahead of the tap so they are not late or noisy. */
export function warmH2HReactionSounds(): void {
  prepareH2HEmojiAudio();
  for (const src of REACTION_SRCS) void ensureSampleBuffer(src);
}

function gestureIsActive(): boolean {
  try {
    return navigator.userActivation?.isActive === true;
  } catch {
    return false;
  }
}

function playBufferNow(
  buf: AudioBuffer,
  volumeScale: number,
  maxSec?: number,
): boolean {
  const audio = getCtx();
  if (!audio || audio.state !== 'running' || !master) return false;
  const gain = audio.createGain();
  gain.gain.value = Math.min(1, Math.max(0, volumeScale));
  gain.connect(master);
  const src = audio.createBufferSource();
  src.buffer = buf;
  src.connect(gain);
  try {
    src.start(0);
  } catch {
    try { gain.disconnect(); } catch { /* ignore */ }
    return false;
  }
  const stopAt = Math.min(buf.duration, maxSec ?? buf.duration);
  try {
    src.stop(audio.currentTime + Math.max(0.05, stopAt));
  } catch {
    /* already scheduled */
  }
  src.onended = () => {
    try { gain.disconnect(); } catch { /* ignore */ }
  };
  return true;
}

/** Resume emoji synth during a user gesture (iOS requires this before delayed SFX). */
export function prepareH2HEmojiAudio(): void {
  const audio = getCtx();
  if (!audio) return;
  if (master) master.gain.value = sfxScale();
  if (audio.state === 'suspended') void audio.resume();
}

function runWhenAudioReady(fn: (audio: AudioContext) => void): void {
  prepareH2HEmojiAudio();
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === 'running') {
    fn(audio);
    return;
  }
  void audio
    .resume()
    .then(() => {
      const ready = getCtx();
      if (ready?.state === 'running') fn(ready);
    })
    .catch(() => {
      /* blocked */
    });
}

function scheduleTrophyChime(startAt: number, scale: number, noteGain = TROPHY_EMOJI_GAIN): void {
  const audio = getCtx();
  if (!audio || !master || scale <= 0 || audio.state !== 'running') return;

  TROPHY_FREQS.forEach((freq, i) => {
    const t0 = startAt + i * TROPHY_NOTE_GAP;
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    const peak = noteGain * scale;
    osc.type = 'sine';
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(peak, t0 + 0.008);
    amp.gain.setValueAtTime(peak, t0 + 0.048);
    amp.gain.exponentialRampToValueAtTime(0.001, t0 + 0.17);
    osc.connect(amp);
    amp.connect(master);
    osc.start(t0);
    osc.stop(t0 + 0.22);
  });
}

function playWarmedElement(src: string, volumeScale: number, maxSec?: number): boolean {
  let el = cache.get(src);
  if (!el) {
    el = new Audio(src);
    el.preload = 'auto';
    cache.set(src, el);
  }
  if (!el.paused) {
    try {
      el.pause();
    } catch {
      /* ignore */
    }
  }
  if (el.readyState >= 1) {
    try {
      el.currentTime = 0;
    } catch {
      /* not seekable yet */
    }
  }
  el.volume = Math.min(1, Math.max(0, volumeScale));
  const result = el.play();
  if (maxSec != null && maxSec > 0) {
    window.setTimeout(() => {
      if (cache.get(src) !== el) return;
      try {
        el.pause();
      } catch {
        /* ignore */
      }
    }, maxSec * 1000);
  }
  if (result && typeof result.catch === 'function') {
    result.catch(() => {
      /* blocked outside a tap */
    });
  }
  return true;
}

/**
 * Play a decoded buffer when the context is already running so iPhone doesn't
 * re-download a clone (that was the 1–2s late, scratchy emoji tap).
 */
function playSample(src: string, volumeScale: number, maxSec?: number): void {
  if (typeof window === 'undefined' || volumeScale <= 0) return;
  prepareH2HEmojiAudio();
  const audio = getCtx();
  const ready = buffers.get(src);
  if (ready && audio?.state === 'running' && playBufferNow(ready, volumeScale, maxSec)) {
    return;
  }

  const gesture = gestureIsActive();
  if (gesture) playWarmedElement(src, volumeScale, maxSec);

  void ensureSampleBuffer(src).then(async (buf) => {
    if (!buf || gesture) return;
    const ctxNow = getCtx();
    if (!ctxNow) return;
    if (ctxNow.state === 'suspended') {
      try {
        await ctxNow.resume();
      } catch {
        return;
      }
    }
    if (ctxNow.state === 'running') playBufferNow(buf, volumeScale, maxSec);
  });
}

/** Trophy chime when a player locks into a roster slot (synthesized, not MP3). */
export function playPlayerSlotSound(): void {
  const scale = sfxScale();
  if (scale <= 0) return;
  runWhenAudioReady((audio) => {
    scheduleTrophyChime(audio.currentTime, scale, SLOT_PLACE_GAIN);
  });
}

/** Schedule trophy chime on the audio clock (call from the tap handler before slam animation). */
export function schedulePlayerSlotSound(delayMs = 400): void {
  const scale = sfxScale();
  if (scale <= 0) return;
  runWhenAudioReady((audio) => {
    scheduleTrophyChime(audio.currentTime + delayMs / 1000, scale, SLOT_PLACE_GAIN);
  });
}

export function playEmojiTapSound(emoji: string): void {
  const scale = sfxScale();
  if (scale <= 0) return;
  const src = EMOJI_SRC[emoji] ?? EMOJI_SRC['🔥'];
  if (!src) return;
  playSample(src, scale, EMOJI_MAX_SEC[emoji] ?? EMOJI_MAX_SEC_DEFAULT);
}

export function playH2HVictorySound(): void {
  const scale = sfxScale();
  if (scale <= 0) return;
  playSample(VICTORY_SRC, scale * 0.95, RESULT_MAX_SEC);
}

/** Short bright ping when you win a position round — not the full match victory sting. */
export function playH2HRoundWinSound(): void {
  prepareH2HEmojiAudio();
  const audio = getCtx();
  const scale = sfxScale();
  if (!audio || scale <= 0) return;

  const freqs = [523, 784] as const;
  freqs.forEach((freq, i) => {
    const t0 = audio.currentTime + i * 0.055;
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    const peak = 0.11 * scale;
    osc.type = 'triangle';
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(peak, t0 + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
    osc.connect(amp);
    amp.connect(master!);
    osc.start(t0);
    osc.stop(t0 + 0.16);
  });
}

export function playH2HDefeatSound(): void {
  const scale = sfxScale();
  if (scale <= 0) return;
  playSample(DEFEAT_SRC, scale * 0.9, RESULT_MAX_SEC);
}
