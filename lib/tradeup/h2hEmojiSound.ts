/**
 * 1v1 reaction soundboard — Web Audio only (no HTMLAudioElement).
 *
 * Architecture:
 *   LOCAL TAP → immediate BufferSource start + visual + async broadcast
 *   REMOTE    → visual + BufferSource when broadcast arrives (skip self echo)
 *
 * Never fetch/decode at tap time. Never queue late playback.
 * Isolated from gameAudio (wheel / cash-register).
 */

import { getAudioSettings } from './audioSettings';

const STALE_MS = 400;
const VOICE_CAP = 6;
/** Same-emoji audio-only drop window — drop, never delay. */
const SAME_EMOJI_MS = 45;
const RESULT_MAX_SEC = 5;

const EMOJI_MAX_SEC: Partial<Record<string, number>> = {
  '🚀': 2,
};

/** Known reaction assets — all must exist under public/audio/h2h/. */
export const EMOJI_SRC: Readonly<Record<string, string>> = {
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

const ALL_REACTION_SRCS = [
  ...new Set([...Object.values(EMOJI_SRC), VICTORY_SRC, DEFEAT_SRC]),
] as const;

const buffers = new Map<string, AudioBuffer>();
const bufferJobs = new Map<string, Promise<AudioBuffer | null>>();
const preloadFailed = new Set<string>();

let reactionCtx: AudioContext | null = null;
let reactionMaster: GainNode | null = null;
let voiceSeq = 0;
const activeVoices: Array<{ id: number; stop: () => void }> = [];
const lastEmojiAudioAt = new Map<string, number>();
let preloadStarted = false;

const TROPHY_FREQS = [392, 523, 659] as const;
const TROPHY_NOTE_GAP = 0.034;
const TROPHY_EMOJI_GAIN = 0.07;
const SLOT_PLACE_GAIN = 0.22;

type ReactionOrigin = 'local' | 'remote';

function audioDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem('h2h_debug') === '1') return true;
  } catch {
    /* ignore */
  }
  return process.env.NODE_ENV === 'development';
}

function stamp(): string {
  return new Date().toISOString().slice(11, 23);
}

function h2hAudioLog(message: string, detail?: Record<string, unknown>): void {
  if (!audioDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.info(`[h2h-audio] ${stamp()} ${message}`, detail ?? '');
}

function emojiLabel(emoji: string): string {
  const map: Record<string, string> = {
    '🐐': 'goat',
    '👑': 'crown',
    '😂': 'laugh',
    '🔥': 'fire',
    '🎯': 'target',
    '🏆': 'trophy',
    '⭐': 'star',
    '💰': 'money',
    '🚀': 'rocket',
    '🎉': 'party',
    '💎': 'gem',
    '😮': 'wow',
  };
  return map[emoji] ?? emoji;
}

function sfxScale(): number {
  const { sfxMuted, sfxVolume } = getAudioSettings();
  if (sfxMuted) return 0;
  return Math.min(1, Math.max(0.12, sfxVolume * 0.85));
}

function getReactionCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!reactionCtx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    reactionCtx = new AC();
    reactionMaster = reactionCtx.createGain();
    reactionMaster.connect(reactionCtx.destination);
    h2hAudioLog('context created', { state: reactionCtx.state });
  }
  if (reactionMaster) reactionMaster.gain.value = sfxScale();
  return reactionCtx;
}

function decodeSrc(src: string): Promise<AudioBuffer | null> {
  const ready = buffers.get(src);
  if (ready) return Promise.resolve(ready);
  const pending = bufferJobs.get(src);
  if (pending) return pending;

  const audio = getReactionCtx();
  if (!audio) return Promise.resolve(null);

  const job = (async () => {
    try {
      const res = await fetch(src);
      if (!res.ok) {
        preloadFailed.add(src);
        h2hAudioLog('preload FAIL', { src, status: res.status });
        return null;
      }
      const raw = await res.arrayBuffer();
      const decoded = await audio.decodeAudioData(raw.slice(0));
      buffers.set(src, decoded);
      h2hAudioLog('preload ok', { src, seconds: Number(decoded.duration.toFixed(2)) });
      return decoded;
    } catch (err) {
      preloadFailed.add(src);
      h2hAudioLog('preload FAIL', {
        src,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    } finally {
      bufferJobs.delete(src);
    }
  })();
  bufferJobs.set(src, job);
  return job;
}

/**
 * Create/resume reaction AudioContext and decode all known reaction assets.
 * Call from a user gesture (Ready / Print / first pointer). Silent — no audible unlock.
 */
export function unlockH2HReactionAudio(): void {
  const audio = getReactionCtx();
  if (!audio) return;
  if (reactionMaster) reactionMaster.gain.value = sfxScale();
  if (audio.state === 'suspended') {
    void audio.resume().then(() => {
      h2hAudioLog('context resumed', { state: audio.state });
    });
  }
  if (!preloadStarted) {
    preloadStarted = true;
    h2hAudioLog('preload begin', { count: ALL_REACTION_SRCS.length });
    for (const src of ALL_REACTION_SRCS) void decodeSrc(src);
  }
}

/** @deprecated alias — prefer unlockH2HReactionAudio */
export function prepareH2HEmojiAudio(): void {
  unlockH2HReactionAudio();
}

/** @deprecated alias */
export function warmH2HReactionSounds(): void {
  unlockH2HReactionAudio();
}

function releaseVoice(id: number): void {
  const idx = activeVoices.findIndex((v) => v.id === id);
  if (idx >= 0) activeVoices.splice(idx, 1);
}

function stopOldestVoice(): void {
  const oldest = activeVoices.shift();
  if (!oldest) return;
  try {
    oldest.stop();
  } catch {
    /* ignore */
  }
}

/**
 * Synchronous one-shot BufferSource start. Must only be called when context is running
 * and buffer is already decoded. Never schedules future/queued playback.
 */
function startBufferNow(
  buf: AudioBuffer,
  volumeScale: number,
  maxSec: number | undefined,
  meta: { reaction: string; origin: ReactionOrigin; requestedAt: number; preloaded: boolean },
): boolean {
  const audio = getReactionCtx();
  if (!audio || audio.state !== 'running' || !reactionMaster) return false;

  const latency = performance.now() - meta.requestedAt;
  if (latency > STALE_MS) {
    h2hAudioLog(`drop ${meta.reaction}`, {
      reason: 'stale',
      latencyMs: Math.round(latency),
      origin: meta.origin,
    });
    return false;
  }

  while (activeVoices.length >= VOICE_CAP) stopOldestVoice();

  const gain = audio.createGain();
  gain.gain.value = Math.min(1, Math.max(0, volumeScale));
  gain.connect(reactionMaster);
  const src = audio.createBufferSource();
  src.buffer = buf;
  src.connect(gain);

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      src.stop(0);
    } catch {
      /* ignore */
    }
    try {
      gain.disconnect();
    } catch {
      /* ignore */
    }
  };

  const voiceId = ++voiceSeq;
  activeVoices.push({ id: voiceId, stop });

  try {
    src.start(0);
    const dur = Math.min(buf.duration, maxSec ?? buf.duration);
    if (dur > 0 && Number.isFinite(dur)) {
      src.stop(audio.currentTime + Math.max(0.05, dur));
    }
  } catch {
    stop();
    releaseVoice(voiceId);
    h2hAudioLog(`drop ${meta.reaction}`, { reason: 'start_failed', origin: meta.origin });
    return false;
  }

  src.onended = () => {
    stop();
    releaseVoice(voiceId);
  };

  h2hAudioLog(`start ${meta.reaction}`, {
    origin: meta.origin,
    latencyMs: Math.round(latency),
    context: audio.state,
    preloaded: meta.preloaded,
    voices: activeVoices.length,
  });
  return true;
}

/**
 * Play a pre-decoded buffer immediately, or after a gesture-bound resume if needed.
 * If resume takes too long → DROP. If buffer missing → DROP (kick preload, never late-play).
 */
function playDecodedReaction(
  src: string,
  reaction: string,
  origin: ReactionOrigin,
  volumeScale: number,
  maxSec?: number,
): void {
  const requestedAt = performance.now();
  const audio = getReactionCtx();
  if (!audio || volumeScale <= 0) return;

  const buf = buffers.get(src);
  if (!buf) {
    h2hAudioLog(`drop ${reaction}`, {
      reason: 'not_preloaded',
      src,
      origin,
      failed: preloadFailed.has(src),
    });
    // Warm for a later tap — do NOT play when decode finishes.
    void decodeSrc(src);
    unlockH2HReactionAudio();
    return;
  }

  const meta = { reaction, origin, requestedAt, preloaded: true };

  if (audio.state === 'running') {
    startBufferNow(buf, volumeScale, maxSec, meta);
    return;
  }

  // Resume from this call stack when possible (must be user-gesture for iOS).
  void audio
    .resume()
    .then(() => {
      startBufferNow(buf, volumeScale, maxSec, meta);
    })
    .catch(() => {
      h2hAudioLog(`drop ${reaction}`, { reason: 'resume_failed', origin });
    });
}

function runWhenAudioReady(fn: (audio: AudioContext) => void): void {
  unlockH2HReactionAudio();
  const audio = getReactionCtx();
  if (!audio) return;
  if (audio.state === 'running') {
    fn(audio);
    return;
  }
  void audio
    .resume()
    .then(() => {
      const ready = getReactionCtx();
      if (ready?.state === 'running') fn(ready);
    })
    .catch(() => {
      /* blocked */
    });
}

function scheduleTrophyChime(startAt: number, scale: number, noteGain = TROPHY_EMOJI_GAIN): void {
  const audio = getReactionCtx();
  if (!audio || !reactionMaster || scale <= 0 || audio.state !== 'running') return;

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
    amp.connect(reactionMaster!);
    osc.start(t0);
    osc.stop(t0 + 0.22);
  });
}

/** Stop reaction voices only — never touches wheel/game audio. */
export function stopH2HReactionSounds(): void {
  while (activeVoices.length > 0) {
    const v = activeVoices.shift();
    try {
      v?.stop();
    } catch {
      /* ignore */
    }
  }
}

export function playPlayerSlotSound(): void {
  const scale = sfxScale();
  if (scale <= 0) return;
  runWhenAudioReady((audio) => {
    scheduleTrophyChime(audio.currentTime, scale, SLOT_PLACE_GAIN);
  });
}

export function schedulePlayerSlotSound(delayMs = 400): void {
  const scale = sfxScale();
  if (scale <= 0) return;
  runWhenAudioReady((audio) => {
    scheduleTrophyChime(audio.currentTime + delayMs / 1000, scale, SLOT_PLACE_GAIN);
  });
}

/**
 * LOCAL reaction — call directly from the pointer handler.
 * Never waits on network / React state / HTMLAudio.
 */
export function playEmojiTapSound(emoji: string, origin: ReactionOrigin = 'local'): void {
  const scale = sfxScale();
  const label = emojiLabel(emoji);
  h2hAudioLog(`tap ${label}`, { origin, emoji });

  if (scale <= 0) {
    h2hAudioLog(`drop ${label}`, { reason: 'muted', origin });
    return;
  }

  const src = EMOJI_SRC[emoji] ?? EMOJI_SRC['🔥'];
  if (!src) {
    h2hAudioLog(`drop ${label}`, { reason: 'unknown_emoji', origin });
    return;
  }

  if (origin === 'local') {
    const now = performance.now();
    const last = lastEmojiAudioAt.get(emoji) ?? 0;
    if (now - last < SAME_EMOJI_MS) {
      h2hAudioLog(`drop ${label}`, { reason: 'same_emoji_throttle', origin });
      return;
    }
    lastEmojiAudioAt.set(emoji, now);
  }

  // Keep context warm on every tap (covers iOS background suspend).
  unlockH2HReactionAudio();
  playDecodedReaction(src, label, origin, scale, EMOJI_MAX_SEC[emoji]);
}

/** Opponent reaction — same engine, never delayed queue. */
export function playRemoteEmojiSound(emoji: string): void {
  playEmojiTapSound(emoji, 'remote');
}

export function playH2HVictorySound(): void {
  const scale = sfxScale();
  if (scale <= 0) return;
  unlockH2HReactionAudio();
  playDecodedReaction(VICTORY_SRC, 'victory', 'local', scale * 0.95, RESULT_MAX_SEC);
}

export function playH2HRoundWinSound(): void {
  unlockH2HReactionAudio();
  const audio = getReactionCtx();
  const scale = sfxScale();
  if (!audio || scale <= 0 || !reactionMaster) return;

  const start = () => {
    if (audio.state !== 'running' || !reactionMaster) return;
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
      amp.connect(reactionMaster!);
      osc.start(t0);
      osc.stop(t0 + 0.16);
    });
  };

  if (audio.state === 'running') start();
  else void audio.resume().then(start).catch(() => {});
}

export function playH2HDefeatSound(): void {
  const scale = sfxScale();
  if (scale <= 0) return;
  unlockH2HReactionAudio();
  playDecodedReaction(DEFEAT_SRC, 'defeat', 'local', scale * 0.9, RESULT_MAX_SEC);
}
