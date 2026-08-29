#!/usr/bin/env node
/**
 * Download selected Pixabay SFX for H2H emoji bar (requires network).
 * Run: node scripts/fetch-pixabay-h2h-audio.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../public/audio/h2h');
const EMOJI_MAX_SEC = 4;

/** slug → output filename */
const SOURCES = [
  {
    page: 'https://pixabay.com/sound-effects/people-applause-cheer-236786/',
    out: 'clap.mp3',
  },
  {
    page: 'https://pixabay.com/sound-effects/soft-laughing-6445/',
    out: 'laugh-soft.mp3',
  },
  {
    page: 'https://pixabay.com/sound-effects/girl-soft-laughing-65744/',
    out: 'laugh-rofl.mp3',
  },
  {
    page: 'https://pixabay.com/sound-effects/party-balloon-pop-323588/',
    out: 'party.mp3',
  },
];

async function resolveMp3Url(pageUrl) {
  const res = await fetch(pageUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  const html = await res.text();
  const match =
    html.match(/https:\/\/cdn\.pixabay\.com\/download\/audio\/[^"'\\]+/i) ??
    html.match(/https:\\\/\\\/cdn\.pixabay\.com\\\/download\\\/audio\\\/[^"']+/i);
  if (!match) throw new Error(`No CDN URL on ${pageUrl}`);
  return match[0].replace(/\\\//g, '/');
}

function processClip(input, output, maxSec) {
  const tmp = `${output}.proc.tmp.mp3`;
  execFileSync(
    ffmpegPath,
    [
      '-y',
      '-i',
      input,
      '-af',
      `silenceremove=start_periods=1:start_silence=0.05:start_threshold=-45dB,afade=t=out:st=${Math.max(0.5, maxSec - 0.85)}:d=0.85`,
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
  fs.renameSync(tmp, output);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  for (const { page, out } of SOURCES) {
    const dest = path.join(outDir, out);
    const raw = `${dest}.raw.tmp`;
    console.log(`fetch ${out} …`);
    const mp3Url = await resolveMp3Url(page);
    const audio = await fetch(mp3Url);
    if (!audio.ok) throw new Error(`Download failed ${out}: ${audio.status}`);
    const buf = Buffer.from(await audio.arrayBuffer());
    fs.writeFileSync(raw, buf);
    processClip(raw, dest, EMOJI_MAX_SEC);
    fs.unlinkSync(raw);
    console.log(`wrote ${out}`);
  }
  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
