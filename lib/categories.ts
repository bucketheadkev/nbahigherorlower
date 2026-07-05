import type { GameMode, Player, StatCategory } from '@/types/game';
import { formatStatValue } from '@/lib/formatters';

export interface CategoryConfig {
  key: StatCategory;
  label: string;
  shortLabel: string;
  getValue: (player: Player) => number;
}

export interface ComparisonCopy {
  categoryLabel: string;
  revealedAnchor: string;
  question: string;
  higherButton: string;
  lowerButton: string;
  hiddenReveal: string;
}

export const CATEGORIES: CategoryConfig[] = [
  { key: 'careerPoints', label: 'Career Points', shortLabel: 'PTS', getValue: (p) => p.careerPoints },
  { key: 'careerAssists', label: 'Career Assists', shortLabel: 'AST', getValue: (p) => p.careerAssists },
  { key: 'careerRebounds', label: 'Career Rebounds', shortLabel: 'REB', getValue: (p) => p.careerRebounds },
  { key: 'careerBlocks', label: 'Career Blocks', shortLabel: 'BLK', getValue: (p) => p.careerBlocks },
  { key: 'careerSteals', label: 'Career Steals', shortLabel: 'STL', getValue: (p) => p.careerSteals },
  { key: 'championships', label: 'Championships', shortLabel: 'RINGS', getValue: (p) => p.championships },
  { key: 'allStars', label: 'All-Star Appearances', shortLabel: 'ASG', getValue: (p) => p.allStars },
  { key: 'mvps', label: 'MVP Awards', shortLabel: 'MVP', getValue: (p) => p.mvps },
  { key: 'draftPick', label: 'Draft Pick', shortLabel: 'PICK', getValue: (p) => p.draftPick },
  { key: 'height', label: 'Height', shortLabel: 'HT', getValue: (p) => p.heightInches },
  { key: 'age', label: 'Age', shortLabel: 'AGE', getValue: (p) => p.age },
  { key: 'careerEarnings', label: 'Career Earnings', shortLabel: 'EARN', getValue: (p) => p.careerEarnings },
  { key: 'instagramFollowers', label: 'Instagram Followers', shortLabel: 'IG', getValue: (p) => p.instagramFollowers },
];

const categoryMap = new Map(CATEGORIES.map((c) => [c.key, c]));

export const STAT_CATEGORIES: StatCategory[] = CATEGORIES.map((c) => c.key);

export function getCategory(key: StatCategory): CategoryConfig {
  const category = categoryMap.get(key);
  if (!category) throw new Error(`Unknown category: ${key}`);
  return category;
}

export function getCategoryLabel(key: StatCategory): string {
  return getCategory(key).label;
}

export function getStatValue(player: Player, category: StatCategory): number {
  return getCategory(category).getValue(player);
}

function formatAnchorLine(player: Player, category: StatCategory): string {
  const value = formatStatValue(getStatValue(player, category), category);
  const name = player.name;

  switch (category) {
    case 'age':
      return `${name} is ${value} years old`;
    case 'height':
      return `${name} is ${value} tall`;
    case 'draftPick':
      return `${name} was draft pick ${value}`;
    case 'championships':
      return `${name} has ${value} NBA championship${Number(value) === 1 ? '' : 's'}`;
    case 'allStars':
      return `${name} has ${value} All-Star appearance${Number(value) === 1 ? '' : 's'}`;
    case 'mvps':
      return `${name} has ${value} MVP award${Number(value) === 1 ? '' : 's'}`;
    case 'careerEarnings':
      return `${name} earned ${value} in his career`;
    case 'instagramFollowers':
      return `${name} has ${value} Instagram followers`;
    case 'careerPoints':
      return `${name} has ${value} career points`;
    case 'careerAssists':
      return `${name} has ${value} career assists`;
    case 'careerRebounds':
      return `${name} has ${value} career rebounds`;
    case 'careerBlocks':
      return `${name} has ${value} career blocks`;
    case 'careerSteals':
      return `${name} has ${value} career steals`;
    default:
      return `${name}: ${value}`;
  }
}

export function getComparisonCopy(
  hidden: Player,
  revealed: Player,
  category: StatCategory,
): ComparisonCopy {
  const hiddenName = hidden.name;
  const revealedAnchor = formatAnchorLine(revealed, category);
  const hiddenReveal = formatAnchorLine(hidden, category);

  switch (category) {
    case 'age':
      return {
        categoryLabel: 'Age',
        revealedAnchor,
        question: `Is ${hiddenName} older or younger than ${revealed.name}?`,
        higherButton: `${hiddenName} is OLDER`,
        lowerButton: `${hiddenName} is YOUNGER`,
        hiddenReveal,
      };
    case 'height':
      return {
        categoryLabel: 'Height',
        revealedAnchor,
        question: `Is ${hiddenName} taller or shorter than ${revealed.name}?`,
        higherButton: `${hiddenName} is TALLER`,
        lowerButton: `${hiddenName} is SHORTER`,
        hiddenReveal,
      };
    case 'draftPick':
      return {
        categoryLabel: 'Draft Pick',
        revealedAnchor,
        question: `Was ${hiddenName} drafted earlier or later than ${revealed.name}?`,
        higherButton: `${hiddenName} was drafted LATER`,
        lowerButton: `${hiddenName} was drafted EARLIER`,
        hiddenReveal,
      };
    case 'championships':
      return {
        categoryLabel: 'Championships',
        revealedAnchor,
        question: `Does ${hiddenName} have more or fewer rings than ${revealed.name}?`,
        higherButton: `${hiddenName} has MORE rings`,
        lowerButton: `${hiddenName} has FEWER rings`,
        hiddenReveal,
      };
    case 'allStars':
      return {
        categoryLabel: 'All-Star Appearances',
        revealedAnchor,
        question: `Does ${hiddenName} have more or fewer All-Star appearances than ${revealed.name}?`,
        higherButton: `${hiddenName} has MORE All-Stars`,
        lowerButton: `${hiddenName} has FEWER All-Stars`,
        hiddenReveal,
      };
    case 'mvps':
      return {
        categoryLabel: 'MVP Awards',
        revealedAnchor,
        question: `Does ${hiddenName} have more or fewer MVP awards than ${revealed.name}?`,
        higherButton: `${hiddenName} has MORE MVPs`,
        lowerButton: `${hiddenName} has FEWER MVPs`,
        hiddenReveal,
      };
    case 'careerEarnings':
      return {
        categoryLabel: 'Career Earnings',
        revealedAnchor,
        question: `Did ${hiddenName} earn more or less than ${revealed.name}?`,
        higherButton: `${hiddenName} earned MORE`,
        lowerButton: `${hiddenName} earned LESS`,
        hiddenReveal,
      };
    case 'instagramFollowers':
      return {
        categoryLabel: 'Instagram Followers',
        revealedAnchor,
        question: `Does ${hiddenName} have more or fewer Instagram followers than ${revealed.name}?`,
        higherButton: `${hiddenName} has MORE followers`,
        lowerButton: `${hiddenName} has FEWER followers`,
        hiddenReveal,
      };
    case 'careerPoints':
      return {
        categoryLabel: 'Career Points',
        revealedAnchor,
        question: `Does ${hiddenName} have more or fewer career points than ${revealed.name}?`,
        higherButton: `${hiddenName} has MORE points`,
        lowerButton: `${hiddenName} has FEWER points`,
        hiddenReveal,
      };
    case 'careerAssists':
      return {
        categoryLabel: 'Career Assists',
        revealedAnchor,
        question: `Does ${hiddenName} have more or fewer career assists than ${revealed.name}?`,
        higherButton: `${hiddenName} has MORE assists`,
        lowerButton: `${hiddenName} has FEWER assists`,
        hiddenReveal,
      };
    case 'careerRebounds':
      return {
        categoryLabel: 'Career Rebounds',
        revealedAnchor,
        question: `Does ${hiddenName} have more or fewer career rebounds than ${revealed.name}?`,
        higherButton: `${hiddenName} has MORE rebounds`,
        lowerButton: `${hiddenName} has FEWER rebounds`,
        hiddenReveal,
      };
    case 'careerBlocks':
      return {
        categoryLabel: 'Career Blocks',
        revealedAnchor,
        question: `Does ${hiddenName} have more or fewer career blocks than ${revealed.name}?`,
        higherButton: `${hiddenName} has MORE blocks`,
        lowerButton: `${hiddenName} has FEWER blocks`,
        hiddenReveal,
      };
    case 'careerSteals':
      return {
        categoryLabel: 'Career Steals',
        revealedAnchor,
        question: `Does ${hiddenName} have more or fewer career steals than ${revealed.name}?`,
        higherButton: `${hiddenName} has MORE steals`,
        lowerButton: `${hiddenName} has FEWER steals`,
        hiddenReveal,
      };
    default:
      return {
        categoryLabel: getCategoryLabel(category),
        revealedAnchor,
        question: `Does ${hiddenName} have more or less than ${revealed.name}?`,
        higherButton: `${hiddenName} has MORE`,
        lowerButton: `${hiddenName} has LESS`,
        hiddenReveal,
      };
  }
}

export function pickRandomCategory(): StatCategory {
  return STAT_CATEGORIES[Math.floor(Math.random() * STAT_CATEGORIES.length)];
}

export function resolveCategory(mode: GameMode): StatCategory {
  if (mode === 'random' || mode === 'fullRun') return pickRandomCategory();
  return mode;
}

export function getModeLabel(mode: GameMode | string): string {
  if (mode === 'fullRun') return 'Full Run';
  if (mode === 'random') return 'Random Mode';
  if (!STAT_CATEGORIES.includes(mode as StatCategory)) return String(mode);
  return getCategory(mode as StatCategory).label;
}

export const GAME_MODES: { key: GameMode; label: string }[] = [
  ...CATEGORIES.map((c) => ({ key: c.key as GameMode, label: c.label })),
  { key: 'random', label: 'Random Mode' },
];
