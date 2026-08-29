/**
 * 1v1 emoji taps — Pixabay MP3 samples (local playback only).
 * Player slot placement uses synthesized trophy chime (unchanged from pre-Pixabay).
 * Sources: public/audio/h2h/CREDITS.txt
 */

import { getAudioSettings } from './audioSettings';

const EMOJI_MAX_SEC = 4;
const RESULT_MAX_SEC = 5;

const EMOJI_SRC: Record<string, string> = {
  '🐐': '/audio/h2h/goat.mp3',
  '👑': '/audio/h2h/crown.mp3',
  '👏': '/audio/h2h/clap.mp3',
  '😂': '/audio/h2h/laugh.mp3',
  '🤣': '/audio/h2h/laugh.mp3',
  '🔥': '/audio/h2h/fire.mp3',
  '🎯': '/audio/h2h/target.mp3',
  '🏆': '/audio/h2h/trophy.mp3',
  '⭐': '/audio/h2h/star.mp3',
  '🙌': '/audio/h2h/cheer.mp3',
  '💰': '/audio/h2h/money.mp3',
  '🚀': '/audio/h2h/rocket.mp3',
  '🎉': '/audio/h2h/party.mp3',
  '💎': '/audio/h2h/gem.mp3',
  '😮': '/audio/h2h/wow.mp3',
};

const VICTORY_SRC = '/audio/h2h/victory.mp3';
const DEFEAT_SRC = '/audio/h2h/defeat.mp3';

const cache = new Map<string, HTMLAudioElement>();

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

/** Resume emoji synth during a user gesture (iOS requires this before delayed SFX). */
export function prepareH2HEmojiAudio(): void {
  const audio = getCtx();
  if (!audio) return;
  if (master) master.gain.value = sfxScale();
  if (audio.state === 'suspended') void audio.resume();
}

function scheduleTrophyChime(startAt: number, scale: number, noteGain = TROPHY_EMOJI_GAIN): void {
  const audio = getCtx();
  if (!audio || !master || scale <= 0) return;

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

function playSample(src: string, volumeScale: number, maxSec?: number): void {
  if (typeof window === 'undefined' || volumeScale <= 0) return;
  let audio = cache.get(src);
  if (!audio) {
    audio = new Audio(src);
    audio.preload = 'auto';
    cache.set(src, audio);
  }
  const node = audio.cloneNode(true) as HTMLAudioElement;
  node.volume = volumeScale;
  let stopTimer: number | undefined;
  if (maxSec != null && maxSec > 0) {
    stopTimer = window.setTimeout(() => {
      node.pause();
      node.currentTime = 0;
    }, maxSec * 1000);
    node.addEventListener(
      'ended',
      () => {
        if (stopTimer != null) window.clearTimeout(stopTimer);
      },
      { once: true },
    );
  }
  void node.play().catch(() => {
    if (stopTimer != null) window.clearTimeout(stopTimer);
  });
}

/** Trophy chime when a player locks into a roster slot (synthesized, not MP3). */
export function playPlayerSlotSound(): void {
  prepareH2HEmojiAudio();
  const audio = getCtx();
  const scale = sfxScale();
  if (!audio || scale <= 0) return;
  scheduleTrophyChime(audio.currentTime, scale, SLOT_PLACE_GAIN);
}

/** Schedule trophy chime on the audio clock (call from the tap handler before slam animation). */
export function schedulePlayerSlotSound(delayMs = 400): void {
  prepareH2HEmojiAudio();
  const audio = getCtx();
  const scale = sfxScale();
  if (!audio || scale <= 0) return;
  scheduleTrophyChime(audio.currentTime + delayMs / 1000, scale, SLOT_PLACE_GAIN);
}

export function playEmojiTapSound(emoji: string): void {
  const scale = sfxScale();
  if (scale <= 0) return;
  const src = EMOJI_SRC[emoji] ?? EMOJI_SRC['👏'];
  if (!src) return;
  playSample(src, scale, EMOJI_MAX_SEC);
}

export function playH2HVictorySound(): void {
  const scale = sfxScale();
  if (scale <= 0) return;
  playSample(VICTORY_SRC, scale * 0.95, RESULT_MAX_SEC);
}

export function playH2HDefeatSound(): void {
  const scale = sfxScale();
  if (scale <= 0) return;
  playSample(DEFEAT_SRC, scale * 0.9, RESULT_MAX_SEC);
}
