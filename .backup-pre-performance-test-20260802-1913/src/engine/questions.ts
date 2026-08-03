import type { Decade, Difficulty, Player, Question, QuestionType } from '../types';
import { POSITION_LABELS, TEAMS, type TeamId } from '../data/teams';
import { PLAYERS } from '../data/players';

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getTeamLabel(teamId: string): string {
  const team = TEAMS.find((t) => t.id === teamId);
  return team ? `${team.name} (${teamId})` : teamId;
}

function getTeamName(teamId: string): string {
  return TEAMS.find((t) => t.id === teamId)?.name ?? teamId;
}

function availablePlayers(usedIds: Set<string>): Player[] {
  return PLAYERS.filter((p) => !usedIds.has(p.id));
}

function pickPlayer(usedIds: Set<string>, filter?: (p: Player) => boolean): Player | null {
  const pool = availablePlayers(usedIds).filter(filter ?? (() => true));
  if (pool.length === 0) return null;
  return pickRandom(pool);
}

function pickDistractors<T>(
  pool: T[],
  correct: T,
  count: number,
  key: (item: T) => string,
): T[] {
  const correctKey = key(correct);
  const candidates = shuffle(pool.filter((item) => key(item) !== correctKey));
  return candidates.slice(0, count);
}

function buildNameTeam(player: Player, difficulty: Difficulty): Question {
  const correctId = player.team;
  let distractorPool = TEAMS.map((t) => t.id).filter((id) => id !== correctId);

  if (difficulty === 'medium') {
    const playerConference = TEAMS.find((t) => t.id === correctId)?.conference;
    distractorPool = distractorPool.filter(
      (id) => TEAMS.find((t) => t.id === id)?.conference === playerConference,
    );
  } else if (difficulty === 'hard') {
    distractorPool = distractorPool.filter((id) =>
      PLAYERS.some((p) => p.team === id && p.decade === player.decade && p.id !== player.id),
    );
    if (distractorPool.length < 3) {
      distractorPool = TEAMS.map((t) => t.id).filter((id) => id !== correctId);
    }
  }

  const distractors = pickDistractors(distractorPool, correctId, 3, (id) => id);
  const options = shuffle([
    { id: correctId, label: getTeamLabel(correctId) },
    ...distractors.map((id) => ({ id, label: getTeamLabel(id) })),
  ]);

  const subtext =
    difficulty === 'easy'
      ? `${player.primaryPosition} · ${player.decade}${player.active ? ' · Active' : ''}`
      : difficulty === 'medium'
        ? player.primaryPosition
        : undefined;

  return {
    id: `nameTeam-${player.id}-${Date.now()}`,
    type: 'nameTeam',
    prompt: `Which team is ${player.name} most associated with?`,
    subtext,
    options,
    correctId,
    playerId: player.id,
  };
}

function buildStatLine(player: Player, difficulty: Difficulty): Question {
  const { ppg, rpg, apg } = player.stats;
  const subtext = `${ppg} PPG · ${rpg} RPG · ${apg} APG`;

  let distractorPool = availablePlayers(new Set([player.id]));
  if (difficulty !== 'easy') {
    distractorPool = distractorPool.filter(
      (p) => Math.abs(p.stats.ppg - ppg) <= (difficulty === 'medium' ? 6 : 3),
    );
  }
  if (distractorPool.length < 3) {
    distractorPool = availablePlayers(new Set([player.id]));
  }

  const distractors = pickDistractors(distractorPool, player, 3, (p) => p.id);
  const options = shuffle([
    { id: player.id, label: player.name },
    ...distractors.map((p) => ({ id: p.id, label: p.name })),
  ]);

  return {
    id: `statLine-${player.id}-${Date.now()}`,
    type: 'statLine',
    prompt: 'Who put up this stat line?',
    subtext: difficulty === 'hard' ? `${ppg} PPG · ${rpg} RPG` : subtext,
    options,
    correctId: player.id,
    playerId: player.id,
  };
}

function buildConference(teamId: TeamId, difficulty: Difficulty): Question {
  const team = TEAMS.find((t) => t.id === teamId)!;
  const correctId = team.conference;
  const wrongConference = team.conference === 'East' ? 'West' : 'East';

  const sameConfTeams = TEAMS.filter((t) => t.conference === team.conference && t.id !== teamId);
  const otherConfTeams = TEAMS.filter((t) => t.conference === wrongConference);

  const decoyTeams =
    difficulty === 'easy'
      ? shuffle(otherConfTeams).slice(0, 2)
      : shuffle(sameConfTeams).slice(0, 2);

  const options = shuffle([
    { id: 'East', label: 'Eastern Conference' },
    { id: 'West', label: 'Western Conference' },
    ...decoyTeams.map((t) => ({
      id: `decoy-${t.id}`,
      label: `${t.name} (${t.conference})`,
    })),
  ]).slice(0, 4);

  // Ensure correct conference option is present
  if (!options.some((o) => o.id === correctId)) {
    options[0] = {
      id: correctId,
      label: correctId === 'East' ? 'Eastern Conference' : 'Western Conference',
    };
  }

  return {
    id: `conference-${teamId}-${Date.now()}`,
    type: 'conference',
    prompt: `Which conference are the ${team.name} in?`,
    subtext: difficulty === 'easy' ? `Team abbreviation: ${teamId}` : undefined,
    options,
    correctId,
  };
}

function buildPosition(player: Player, difficulty: Difficulty): Question {
  const allPositions = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
  const wrongPositions = allPositions.filter((pos) => pos !== player.primaryPosition);
  const distractors = shuffle([...wrongPositions]).slice(0, 3);

  const options = shuffle([
    {
      id: player.primaryPosition,
      label: `${player.primaryPosition} — ${POSITION_LABELS[player.primaryPosition]}`,
    },
    ...distractors.map((pos) => ({
      id: pos,
      label: `${pos} — ${POSITION_LABELS[pos]}`,
    })),
  ]);

  return {
    id: `position-${player.id}-${Date.now()}`,
    type: 'position',
    prompt: `What is ${player.name}'s primary position?`,
    subtext:
      difficulty === 'easy'
        ? `${player.decade}${player.active ? ' · Current NBA' : ''}`
        : undefined,
    options,
    correctId: player.primaryPosition,
    playerId: player.id,
  };
}

function buildEra(player: Player, difficulty: Difficulty): Question {
  const decades: Decade[] = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
  const decadeIndex = decades.indexOf(player.decade);
  const nearby = decades.filter(
    (d, i) => d !== player.decade && Math.abs(i - decadeIndex) <= (difficulty === 'hard' ? 1 : 2),
  );
  let distractors = shuffle(nearby).slice(0, 3);
  if (distractors.length < 3) {
    distractors = shuffle(decades.filter((d) => d !== player.decade)).slice(0, 3);
  }

  const options = shuffle([
    { id: player.decade, label: player.decade },
    ...distractors.map((d) => ({ id: d, label: d })),
  ]);

  return {
    id: `era-${player.id}-${Date.now()}`,
    type: 'era',
    prompt: `Which decade did ${player.name} peak?`,
    subtext:
      difficulty === 'easy'
        ? `${player.primaryPosition} · ${getTeamName(player.team)}`
        : difficulty === 'medium'
          ? player.primaryPosition
          : undefined,
    options,
    correctId: player.decade,
    playerId: player.id,
  };
}

function buildHigherStat(playerA: Player, playerB: Player): Question {
  const correct = playerA.stats.ppg >= playerB.stats.ppg ? playerA : playerB;

  return {
    id: `higherStat-${playerA.id}-${playerB.id}-${Date.now()}`,
    type: 'higherStat',
    prompt: 'Who averaged more PPG?',
    options: [
      { id: playerA.id, label: playerA.name },
      { id: playerB.id, label: playerB.name },
    ],
    correctId: correct.id,
    playerId: correct.id,
  };
}

const GENERATORS: Record<
  QuestionType,
  (usedIds: Set<string>, difficulty: Difficulty) => Question | null
> = {
  nameTeam: (usedIds, difficulty) => {
    const player = pickPlayer(usedIds);
    return player ? buildNameTeam(player, difficulty) : null;
  },
  statLine: (usedIds, difficulty) => {
    const player = pickPlayer(usedIds, (p) => p.stats.ppg >= 15);
    return player ? buildStatLine(player, difficulty) : null;
  },
  conference: (_usedIds, difficulty) => {
    const team = pickRandom(TEAMS);
    return buildConference(team.id, difficulty);
  },
  position: (usedIds, difficulty) => {
    const player = pickPlayer(usedIds);
    return player ? buildPosition(player, difficulty) : null;
  },
  era: (usedIds, difficulty) => {
    const player = pickPlayer(usedIds);
    return player ? buildEra(player, difficulty) : null;
  },
  higherStat: (usedIds, difficulty) => {
    const pool = availablePlayers(usedIds);
    if (pool.length < 2) return null;
    const playerA = pickRandom(pool);
    const range = difficulty === 'hard' ? 3 : difficulty === 'medium' ? 6 : 10;
    let candidates = pool.filter(
      (p) => p.id !== playerA.id && Math.abs(p.stats.ppg - playerA.stats.ppg) <= range,
    );
    if (candidates.length === 0) {
      candidates = pool.filter((p) => p.id !== playerA.id);
    }
    const playerB = pickRandom(candidates);
    return buildHigherStat(playerA, playerB);
  },
};

const EASY_TYPES: QuestionType[] = ['nameTeam', 'conference', 'position', 'era'];
const MEDIUM_TYPES: QuestionType[] = ['nameTeam', 'statLine', 'position', 'era', 'conference'];
const HARD_TYPES: QuestionType[] = ['statLine', 'higherStat', 'nameTeam', 'era', 'position'];

function typesForDifficulty(difficulty: Difficulty): QuestionType[] {
  if (difficulty === 'easy') return EASY_TYPES;
  if (difficulty === 'medium') return MEDIUM_TYPES;
  return HARD_TYPES;
}

export function generateQuestion(
  difficulty: Difficulty,
  usedIds: Set<string>,
): Question | null {
  const types = shuffle(typesForDifficulty(difficulty));

  for (const type of types) {
    const question = GENERATORS[type](usedIds, difficulty);
    if (question) return question;
  }

  // Fallback: any type with relaxed filters
  for (const type of shuffle(Object.keys(GENERATORS) as QuestionType[])) {
    const question = GENERATORS[type](usedIds, 'easy');
    if (question) return question;
  }

  return null;
}
