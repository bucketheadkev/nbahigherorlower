import { BILLION_GOAL } from './billionDollar';

export type RosterLetterGrade =
  | 'S'
  | 'A+'
  | 'A'
  | 'B+'
  | 'B'
  | 'C+'
  | 'C'
  | 'D'
  | 'F';

/** Letter grade from final five-man market value. */
export function gradeRosterValue(teamValue: number): RosterLetterGrade {
  const v = Math.max(0, Math.round(teamValue));
  if (v >= BILLION_GOAL + 100_000_000) return 'S';
  if (v >= BILLION_GOAL) return 'A+';
  if (v >= 950_000_000) return 'A';
  if (v >= 900_000_000) return 'B+';
  if (v >= 850_000_000) return 'B';
  if (v >= 800_000_000) return 'C+';
  if (v >= 750_000_000) return 'C';
  if (v >= 650_000_000) return 'D';
  return 'F';
}

export function gradeRosterBlurb(grade: RosterLetterGrade): string {
  switch (grade) {
    case 'S':
      return 'Historic dynasty board';
    case 'A+':
      return 'Billion-dollar roster';
    case 'A':
      return 'Elite championship core';
    case 'B+':
      return 'Contender-level value';
    case 'B':
      return 'Strong but short';
    case 'C+':
      return 'Solid build — keep climbing';
    case 'C':
      return 'Average market haul';
    case 'D':
      return 'Below the chase line';
    default:
      return 'Needs a full rebuild';
  }
}
