import type { StatCategory } from '@/types/game';

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

export function formatHeight(inches: number): string {
  const feet = Math.floor(inches / 12);
  const remaining = inches % 12;
  return `${feet}'${remaining}"`;
}

export function formatDraftPick(pick: number): string {
  return `#${pick}`;
}

export function formatEarnings(dollars: number): string {
  if (dollars >= 1_000_000_000) {
    return `$${(dollars / 1_000_000_000).toFixed(1)}B`;
  }
  if (dollars >= 1_000_000) {
    return `$${Math.round(dollars / 1_000_000)}M`;
  }
  return `$${formatNumber(dollars)}`;
}

export function formatFollowers(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return formatNumber(count);
}

export function formatStatValue(value: number, category: StatCategory): string {
  switch (category) {
    case 'height':
      return formatHeight(value);
    case 'draftPick':
      return formatDraftPick(value);
    case 'careerEarnings':
      return formatEarnings(value);
    case 'instagramFollowers':
      return formatFollowers(value);
    case 'championships':
    case 'allStars':
    case 'mvps':
    case 'age':
      return String(value);
    default:
      return formatNumber(value);
  }
}
