/** Stable jersey-style number derived from player id (0–99). Not real NBA numbers. */

export function getPlayerJerseyNumber(playerId: string): number {
  let hash = 0;
  for (let i = 0; i < playerId.length; i += 1) {
    hash = (hash * 31 + playerId.charCodeAt(i)) >>> 0;
  }
  const n = hash % 100;
  // Avoid bare 0 looking empty on cards — map to 00→99 still fine as 0.
  return n;
}

export function formatJerseyNumber(playerId: string): string {
  return String(getPlayerJerseyNumber(playerId)).padStart(2, '0');
}
