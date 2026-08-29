/** Legacy portrait lookup — 1B Run uses team-color initials; no remote images. */

export function getHeadshotUrl(_playerId: string, _playerName?: string): string | undefined {
  return undefined;
}

export function resolveHeadshotUrl(url: string): string {
  return url;
}

export function logMissingHeadshot(_playerId: string, _playerName: string): void {
  /* no-op — portraits not loaded in production UI */
}
