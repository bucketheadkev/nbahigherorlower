/** The Classic arena art (scripts/build-classic-arena-rh11.mjs), warmed before the draft opens. */
export const CLASSIC_ARENA_IMAGES = ['/images/classic/arena-plate-rh11.webp', '/images/classic/results-bg-rh11.jpg'];

let warmed = false;

export function preloadClassicArena(): void {
  if (warmed || typeof window === 'undefined') return;
  warmed = true;
  for (const src of CLASSIC_ARENA_IMAGES) {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
  }
  // The results total's face (app/classic-results.css), so the number never appears in a fallback.
  document.fonts?.load('80px "1BR Total"').catch(() => {});
}
