/**
 * Regenerates optional file SFX. Keep / trade / H2H use Web Audio in gameAudio.ts.
 * sell-credits.wav is intentionally retired — do not regenerate it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function writeWav(filePath, durationSec, fill) {
  const sampleRate = 44100;
  const samples = Math.floor(sampleRate * durationSec);
  const data = new Float32Array(samples);
  fill(data);

  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);

  for (let i = 0; i < samples; i += 1) {
    const clamped = Math.max(-1, Math.min(1, data[i]));
    buffer.writeInt16LE((clamped * 0x7fff) | 0, 44 + i * 2);
  }
  writeFileSync(filePath, buffer);
}

function envAt(t, attack, decay) {
  if (t < 0) return 0;
  if (t < attack) return t / attack;
  return Math.exp(-(t - attack) * decay);
}

function synth(samples, fn) {
  for (let i = 0; i < samples.length; i += 1) {
    const t = i / 44100;
    samples[i] += fn(t);
  }
}

const outDir = path.join(process.cwd(), 'public', 'audio');
mkdirSync(outDir, { recursive: true });

writeWav(path.join(outDir, 'add-collection.wav'), 0.48, (samples) => {
  const notes = [523.25, 659.25, 783.99];
  notes.forEach((freq, idx) => {
    const start = idx * 0.07;
    synth(samples, (t) => {
      const local = t - start;
      if (local < 0) return 0;
      const e = envAt(local, 0.006, 9);
      return Math.sin(2 * Math.PI * freq * local) * 0.42 * e;
    });
  });
  synth(samples, (t) => {
    const e = envAt(t, 0.01, 6);
    return Math.sin(2 * Math.PI * 1046.5 * t) * 0.12 * e;
  });
});

console.log('Wrote public/audio/add-collection.wav (sell-credits.wav retired)');
