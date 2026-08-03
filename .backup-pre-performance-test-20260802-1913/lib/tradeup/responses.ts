import type { TeamInfo } from './types';
import type { TradeEvaluation } from './engine';
import { NEED_LABELS, type TeamNeedId } from './strengths';
import { getTeamNeeds } from './teamNeeds';

const ACCEPT_NEED_TEMPLATES = [
  'The {team} value your {strength}.',
  'The {team} needed more {need}.',
  'This improves our roster balance.',
  'The {team} like the fit with {need}.',
  'Your {strength} fills a hole for the {team}.',
  'The {team} see you addressing {need}.',
];

const ACCEPT_GENERIC = [
  'The {team} believe this deal improves both teams.',
  'The {team} agree to the trade.',
  'The {team} make it official.',
  'Deal done with the {team}.',
];

const REJECT_NEED_TEMPLATES = [
  "We're already strong at this position.",
  "Your skill set doesn't fit our current needs.",
  "We're looking for more {need}.",
  "This doesn't address our biggest weakness.",
  'We need {need}, not {strength}.',
  'The {team} pass — wrong profile.',
];

const REJECT_FRANCHISE = [
  "The {team} aren't moving their franchise player.",
  'The {team} refuse to part with their cornerstone.',
  "The {team} won't entertain that.",
  'Non-starter for the {team}.',
];

const REJECT_VALUE = [
  "That price isn't close.",
  'Not enough value.',
  'They want more in return.',
  "Can't make the math work.",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function needPhrase(label: string): string {
  return label.toLowerCase();
}

export function pickAcceptMessage(team: TeamInfo, evaluation: TradeEvaluation): string {
  const teamName = team.name;

  if (evaluation.matchedNeedLabels.length > 0 && Math.random() < 0.72) {
    const need = pick(evaluation.matchedNeedLabels);
    const template = pick(ACCEPT_NEED_TEMPLATES);
    return template
      .replace('{team}', teamName)
      .replace('{strength}', evaluation.primaryStrength.toLowerCase())
      .replace('{need}', needPhrase(need));
  }

  if (Math.random() < 0.5 && evaluation.matchedNeedLabels[0]) {
    return `The ${teamName} needed more ${needPhrase(evaluation.matchedNeedLabels[0])}.`;
  }

  return pick(ACCEPT_GENERIC).replace('{team}', teamName);
}

export function pickRejectMessage(team: TeamInfo, evaluation: TradeEvaluation): string {
  const teamName = team.name;

  if (evaluation.isFranchise && Math.random() < 0.7) {
    return pick(REJECT_FRANCHISE).replace('{team}', teamName);
  }

  if (evaluation.unmetNeedLabel && Math.random() < 0.65) {
    const template = pick(REJECT_NEED_TEMPLATES);
    return template
      .replace('{team}', teamName)
      .replace('{need}', needPhrase(evaluation.unmetNeedLabel))
      .replace('{strength}', evaluation.primaryStrength.toLowerCase());
  }

  if (evaluation.matchedNeedLabels.length === 0) {
    const needs = getTeamNeeds(team.id);
    const randomNeed = NEED_LABELS[pick(needs) as TeamNeedId];
    if (Math.random() < 0.55) {
      return `We're looking for more ${needPhrase(randomNeed)}.`;
    }
    return "Your skill set doesn't fit our current needs.";
  }

  return pick(REJECT_VALUE);
}
