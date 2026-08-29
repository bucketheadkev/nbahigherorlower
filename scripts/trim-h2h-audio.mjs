#!/usr/bin/env node
/**
 * Trim H2H audio clips to max duration (emoji ≤4s, result stingers ≤5s).
 * Run: node scripts/trim-h2h-audio.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const audioDir = path.join(__dirname, '../public/audio/h2h');

const EMOJI_MAX_SEC = 4;
const RESULT_MAX_SEC = 5;

/** Remaining emoji + result clips after removals. */
const EMOJI_FILES = [
  'goat.mp3',
  'crown.mp3',
  'clap.mp3',
  'laugh-soft.mp3',
  'laugh-rofl.mp3',
  'fire.mp3',
  'target.mp3',
  'trophy.mp3',
  'star.mp3',
  'cheer.mp3',
  'money.mp3',
  'rocket.mp3',
  'party.mp3',
  'gem.mp3',
  'wow.mp3',
];

const RESULT_FILES = ['victory.mp3', 'defeat.mp3'];

function trimFile(file, maxSec) {
  const input = path.join(audioDir, file);
  if (!fs.existsSync(input)) {
    console.warn(`skip missing: ${file}`);
    return;
  }
  const tmp = `${input}.trim.tmp.mp3`;
  const fadeStart = Math.max(0.5, maxSec - 0.85);
  execFileSync(
    ffmpegPath,
    [
      '-y',
      '-i',
      input,
      '-af',
      `silenceremove=start_periods=1:start_silence=0.05:start_threshold=-45dB,afade=t=out:st=${fadeStart}:d=0.85`,
      '-t',
      String(maxSec),
      '-acodec',
      'libmp3lame',
      '-q:a',
      '4',
      tmp,
    ],
    { stdio: 'pipe' },
  );
  fs.renameSync(tmp, input);
  console.log(`trimmed ${file} → ≤${maxSec}s`);
}

for (const file of EMOJI_FILES) trimFile(file, EMOJI_MAX_SEC);
for (const file of RESULT_FILES) trimFile(file, RESULT_MAX_SEC);

console.log('done');
