import type { Locale } from '@/lib/i18n/messages';

/** Inline bilingual string. Intro copy lives beside the scene it drives. */
export type Copy = Record<Locale, string>;

export function pick(copy: Copy, locale: Locale): string {
  return copy[locale] ?? copy.en;
}

export const CHROME = {
  skip: { en: 'Skip', es: 'Omitir' },
  label: { en: 'How to play 1B Run', es: 'Cómo jugar 1B Run' },
} satisfies Record<string, Copy>;
