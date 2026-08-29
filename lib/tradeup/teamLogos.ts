/** Legacy logo URL helpers — 1B Run uses local team colors and abbreviations only. */

export function getTeamLogoUrl(
  _teamId: string,
  _variant: 'thumb' | 'panel' = 'thumb',
): undefined {
  return undefined;
}

export function getTeamLogoFallbackUrl(_teamId: string): undefined {
  return undefined;
}

export function logMissingTeamLogo(_teamId: string, _teamName?: string): void {
  /* no-op — remote logos are not loaded in production */
}
