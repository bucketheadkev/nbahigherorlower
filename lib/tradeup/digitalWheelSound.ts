/**
 * Synthesized digital prize-wheel SFX — low, soft stepped ticks + warm pad.
 * Calm digital spinner feel (no harsh square / high blips).
 */

import { getAudioSettings } from './audioSettings';

let ctx: AudioContext | null = null;
let active = false;
let startMs = 0;
let maxMs = 3200;
let tickTimer = 0;
let humOsc: OscillatorNode | null = null;
let humOsc2: OscillatorNode | null = null;
let humGain: GainNode | null = null;
let outMaster: GainNode | null = null;
let outFilter: BiquadFilterNode | null = null;

function masterGain(): number {
  const { sfxMuted, sfxVolume } = getAudioSettings();
  if (sfxMuted) return 0;
  return Math.min(1, Math.max(0.12, sfxVolume));
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function ensureBus(audio: AudioContext): GainNode | null {
  const scale = masterGain();
  if (scale <= 0) return null;
  if (!outMaster) {
    outFilter = audio.createBiquadFilter();
    outFilter.type = 'lowpass';
    outFilter.frequency.value = 920;
    outFilter.Q.value = 0.6;
    outMaster = audio.createGain();
    outMaster.connect(outFilter);
    outFilter.connect(audio.destination);
  }
  outMaster.gain.value = scale;
  return outMaster;
}

function connectWarm(output: AudioNode, audio: AudioContext): void {
  const bus = ensureBus(audio);
  if (bus) output.connect(bus);
}

function playTick(progress: number): void {
  const audio = getCtx();
  const scale = masterGain();
  if (!audio || scale <= 0) return;

  const now = audio.currentTime;
  // Low digital steps — glides down gently as the wheel slows.
  const pitch = 320 - progress * 95 + (Math.random() - 0.5) * 18;

  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = 'sine';
  osc.frequency.value = pitch;
  amp.gain.setValueAtTime(0, now);
  amp.gain.linearRampToValueAtTime(scale * 0.1, now + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  osc.connect(amp);
  connectWarm(amp, audio);
  osc.start(now);
  osc.stop(now + 0.075);

  const sub = audio.createOscillator();
  const subAmp = audio.createGain();
  sub.type = 'triangle';
  sub.frequency.value = pitch * 0.5;
  subAmp.gain.setValueAtTime(0, now);
  subAmp.gain.linearRampToValueAtTime(scale * 0.052, now + 0.015);
  subAmp.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
  sub.connect(subAmp);
  connectWarm(subAmp, audio);
  sub.start(now);
  sub.stop(now + 0.085);
}

function scheduleTick(): void {
  if (!active) return;
  const elapsed = performance.now() - startMs;
  const progress = Math.min(1, elapsed / maxMs);
  playTick(progress);
  if (progress >= 1) return;
  const interval = 72 + Math.pow(progress, 2.05) * 265;
  tickTimer = window.setTimeout(scheduleTick, interval);
}

function startHum(): void {
  const audio = getCtx();
  const scale = masterGain();
  if (!audio || scale <= 0) return;
  stopHum();

  humGain = audio.createGain();
  humGain.gain.value = 0;
  humGain.gain.linearRampToValueAtTime(scale * 0.068, audio.currentTime + 0.08);
  connectWarm(humGain, audio);

  humOsc = audio.createOscillator();
  humOsc.type = 'sine';
  humOsc.frequency.value = 98;
  humOsc.connect(humGain);
  humOsc.start();

  humOsc2 = audio.createOscillator();
  humOsc2.type = 'triangle';
  humOsc2.frequency.value = 147;
  humOsc2.connect(humGain);
  humOsc2.start();
}

function stopHum(): void {
  const audio = getCtx();
  if (humGain && audio) {
    humGain.gain.cancelScheduledValues(audio.currentTime);
    humGain.gain.setValueAtTime(humGain.gain.value, audio.currentTime);
    humGain.gain.linearRampToValueAtTime(0.001, audio.currentTime + 0.12);
  }
  window.setTimeout(() => {
    try {
      humOsc?.stop();
      humOsc2?.stop();
    } catch {
      /* already stopped */
    }
    humOsc = null;
    humOsc2 = null;
    humGain = null;
  }, 130);
}

/** Start decelerating digital wheel ticks (call from user gesture). */
export function startDigitalWheelSpin(expectedDurationMs = 3200): void {
  stopDigitalWheelSpin({ playLock: false });
  const scale = masterGain();
  if (scale <= 0) return;

  active = true;
  startMs = performance.now();
  maxMs = Math.max(1200, expectedDurationMs);
  startHum();
  playTick(0);
  scheduleTick();
}

/** Stop ticks/hum; optionally play the digital lock-in chime. */
export function stopDigitalWheelSpin(opts?: { playLock?: boolean }): void {
  active = false;
  window.clearTimeout(tickTimer);
  stopHum();
  if (opts?.playLock !== false) {
    playDigitalWheelLock();
  }
}

/** Soft low lock-in when the reel lands. */
export function playDigitalWheelLock(): void {
  const audio = getCtx();
  const scale = masterGain();
  if (!audio || scale <= 0) return;

  const freqs = [196, 246.94, 293.66];
  freqs.forEach((freq, i) => {
    const t0 = audio.currentTime + i * 0.055;
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(scale * 0.13, t0 + 0.018);
    amp.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28);
    osc.connect(amp);
    connectWarm(amp, audio);
    osc.start(t0);
    osc.stop(t0 + 0.3);
  });
}
