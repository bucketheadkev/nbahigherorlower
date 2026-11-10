/** The Classic arena art (scripts/build-classic-arena.py), warmed before the draft opens. */
export const CLASSIC_ARENA_IMAGES = ['/images/classic/arena-plate.webp', '/images/classic/results-bg.webp'];

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
