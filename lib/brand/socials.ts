/**
 * Official 1B Run community destinations for the main menu social row.
 * Opened via openExternal (Capacitor Browser on iOS, new tab on web).
 */
export const ONEB_SHARE_TEXT = 'Play 1B Run — build a $1,000,000,000 team.';

export type OnebSocialId = 'tiktok' | 'instagram' | 'x' | 'discord';

export type OnebSocial = {
  id: OnebSocialId;
  label: string;
  /** Absolute https URL to the official page. */
  href: string;
};

/** Order: TikTok → Instagram → X → Discord. */
export const ONEB_SOCIALS: OnebSocial[] = [
  {
    id: 'tiktok',
    label: 'TikTok',
    href: 'https://www.tiktok.com/@onebrun',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    href: 'https://www.instagram.com/onebillionrun/',
  },
  {
    id: 'x',
    label: 'X',
    href: 'https://x.com/1BillionRun',
  },
  {
    id: 'discord',
    label: 'Discord',
    href: 'https://discord.gg/ZphPQXks',
  },
];

export const ONEB_SUPPORT_MAIL = 'mailto:onebillionrun@gmail.com?subject=1B%20Run%20Support';
