/** Private 1V1 lobby codes — must match Supabase `rooms_room_code_format_chk`. */
export const H2H_ROOM_CODE_LENGTH = 4;

export const H2H_ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function sanitizeH2HRoomCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .split('')
    .filter((ch) => H2H_ROOM_CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, H2H_ROOM_CODE_LENGTH);
}

export function isValidH2HRoomCode(raw: string): boolean {
  const code = sanitizeH2HRoomCode(raw);
  return code.length === H2H_ROOM_CODE_LENGTH;
}
