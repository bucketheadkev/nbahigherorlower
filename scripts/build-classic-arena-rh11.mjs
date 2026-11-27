/**
 * rh11 Classic arena plate: design/classic-rh11/arena-rh11.jpg (720x1280, same composition as the
 * reference) -> public/images/classic/arena-plate-rh11.webp.
 *
 * Same geometry as public/images/classic/arena-plate.webp (2 px per reference unit, 1794x3128):
 * the 576x1024 reference maps to 1152x2048 at (320, 440); the rest is mirrored, blurred edge that
 * falls off to the arena navy. Uses sharp (libvips, streamed) so it stays light on memory.
 *
 *     node scripts/build-classic-arena-rh11.mjs
 */

import sharp from 'sharp';

const SRC = 'design/classic-rh11/arena-rh11.jpg';
const OUT = 'public/images/classic/arena-plate-rh11.webp';
const K = 2;
const ART_W = 576 * K;
const ART_H = 1024 * K;
const PAD_L = 160 * K;
const PAD_R = 897 * K - ART_W - PAD_L;
const PAD_T = 220 * K;
const PAD_B = 1564 * K - ART_H - PAD_T;
const W = ART_W + PAD_L + PAD_R;
const H = ART_H + PAD_T + PAD_B;

sharp.concurrency(2);
sharp.cache(false);

const art = await sharp(SRC)
  .resize(ART_W, ART_H, { kernel: 'lanczos3' })
  .sharpen({ sigma: 0.8, m1: 0.5, m2: 1.4 })
  .toBuffer();

const mirrored = await sharp(art)
  .extend({ top: PAD_T, bottom: PAD_B, left: PAD_L, right: PAD_R, extendWith: 'mirror' })
  .removeAlpha()
  .toBuffer();

const blurred = await sharp(mirrored).blur(28).toBuffer();

const feather = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <filter id="f"><feGaussianBlur stdDeviation="20"/></filter>
    <rect width="100%" height="100%" fill="black"/>
    <rect x="${PAD_L - 30}" y="${PAD_T - 30}" width="${ART_W + 60}" height="${ART_H + 60}" fill="white" filter="url(#f)"/>
  </svg>`,
);
const featherMask = await sharp(feather).greyscale().extractChannel(0).toBuffer();
const sharpEdge = await sharp(mirrored).joinChannel(featherMask).png().toBuffer();

const fx = Math.round(PAD_L * 0.15) + 150;
const fy = Math.round(PAD_T * 0.15) + 150;
const fb = Math.round(PAD_B * 0.15) + 150;
const falloff = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <filter id="f" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="90"/></filter>
    <mask id="m">
      <rect width="100%" height="100%" fill="white"/>
      <rect x="${PAD_L - fx}" y="${PAD_T - fy}" width="${ART_W + 2 * fx}" height="${ART_H + fy + fb}" fill="black" filter="url(#f)"/>
    </mask>
    <rect width="100%" height="100%" fill="rgb(2,8,21)" fill-opacity="0.92" mask="url(#m)"/>
  </svg>`,
);

const info = await sharp(blurred)
  .composite([
    { input: sharpEdge, top: 0, left: 0 },
    { input: art, top: PAD_T, left: PAD_L },
    { input: falloff, top: 0, left: 0 },
  ])
  .webp({ quality: 86, effort: 6 })
  .toFile(OUT);

console.log(OUT, `${info.width}x${info.height}`, `${Math.round(info.size / 1024)} KB`);
