/**
 * Historic NBA playoff teams used as series opponents.
 * Strength is a sim rating aligned with lineupScore (roughly 40–100).
 */

export type PlayoffRoundId =
  | 'first_round'
  | 'second_round'
  | 'conference_finals'
  | 'nba_finals';

export interface HistoricalPlayoffTeam {
  id: string;
  year: number;
  city: string;
  name: string;
  /** Display label e.g. "1996 Chicago Bulls" */
  label: string;
  conference: 'East' | 'West';
  /** Deepest round this club reached historically. */
  deepestRound: PlayoffRoundId;
  strength: number;
}

const TEAMS: HistoricalPlayoffTeam[] = [
  // First-round caliber
  {
    id: '1981-rockets',
    year: 1981,
    city: 'Houston',
    name: 'Rockets',
    label: '1981 Houston Rockets',
    conference: 'West',
    deepestRound: 'nba_finals',
    strength: 74,
  },
  {
    id: '1995-magic',
    year: 1995,
    city: 'Orlando',
    name: 'Magic',
    label: '1995 Orlando Magic',
    conference: 'East',
    deepestRound: 'nba_finals',
    strength: 82,
  },
  {
    id: '2001-bucks',
    year: 2001,
    city: 'Milwaukee',
    name: 'Bucks',
    label: '2001 Milwaukee Bucks',
    conference: 'East',
    deepestRound: 'conference_finals',
    strength: 79,
  },
  {
    id: '2002-kings',
    year: 2002,
    city: 'Sacramento',
    name: 'Kings',
    label: '2002 Sacramento Kings',
    conference: 'West',
    deepestRound: 'conference_finals',
    strength: 84,
  },
  {
    id: '2004-pistons',
    year: 2004,
    city: 'Detroit',
    name: 'Pistons',
    label: '2004 Detroit Pistons',
    conference: 'East',
    deepestRound: 'nba_finals',
    strength: 88,
  },
  {
    id: '2006-heat',
    year: 2006,
    city: 'Miami',
    name: 'Heat',
    label: '2006 Miami Heat',
    conference: 'East',
    deepestRound: 'nba_finals',
    strength: 86,
  },
  {
    id: '2007-cavaliers',
    year: 2007,
    city: 'Cleveland',
    name: 'Cavaliers',
    label: '2007 Cleveland Cavaliers',
    conference: 'East',
    deepestRound: 'nba_finals',
    strength: 83,
  },
  {
    id: '2008-celtics',
    year: 2008,
    city: 'Boston',
    name: 'Celtics',
    label: '2008 Boston Celtics',
    conference: 'East',
    deepestRound: 'nba_finals',
    strength: 91,
  },
  {
    id: '2011-mavericks',
    year: 2011,
    city: 'Dallas',
    name: 'Mavericks',
    label: '2011 Dallas Mavericks',
    conference: 'West',
    deepestRound: 'nba_finals',
    strength: 87,
  },
  {
    id: '2013-pacers',
    year: 2013,
    city: 'Indiana',
    name: 'Pacers',
    label: '2013 Indiana Pacers',
    conference: 'East',
    deepestRound: 'conference_finals',
    strength: 81,
  },
  {
    id: '2014-clippers',
    year: 2014,
    city: 'Los Angeles',
    name: 'Clippers',
    label: '2014 Los Angeles Clippers',
    conference: 'West',
    deepestRound: 'second_round',
    strength: 80,
  },
  {
    id: '2015-hawks',
    year: 2015,
    city: 'Atlanta',
    name: 'Hawks',
    label: '2015 Atlanta Hawks',
    conference: 'East',
    deepestRound: 'conference_finals',
    strength: 78,
  },
  {
    id: '2016-thunder',
    year: 2016,
    city: 'Oklahoma City',
    name: 'Thunder',
    label: '2016 Oklahoma City Thunder',
    conference: 'West',
    deepestRound: 'conference_finals',
    strength: 85,
  },
  {
    id: '2017-wizards',
    year: 2017,
    city: 'Washington',
    name: 'Wizards',
    label: '2017 Washington Wizards',
    conference: 'East',
    deepestRound: 'second_round',
    strength: 76,
  },
  {
    id: '2018-jazz',
    year: 2018,
    city: 'Utah',
    name: 'Jazz',
    label: '2018 Utah Jazz',
    conference: 'West',
    deepestRound: 'second_round',
    strength: 77,
  },
  {
    id: '2019-raptors',
    year: 2019,
    city: 'Toronto',
    name: 'Raptors',
    label: '2019 Toronto Raptors',
    conference: 'East',
    deepestRound: 'nba_finals',
    strength: 90,
  },
  {
    id: '2020-nuggets',
    year: 2020,
    city: 'Denver',
    name: 'Nuggets',
    label: '2020 Denver Nuggets',
    conference: 'West',
    deepestRound: 'conference_finals',
    strength: 82,
  },
  {
    id: '2021-suns',
    year: 2021,
    city: 'Phoenix',
    name: 'Suns',
    label: '2021 Phoenix Suns',
    conference: 'West',
    deepestRound: 'nba_finals',
    strength: 89,
  },
  {
    id: '2022-celtics',
    year: 2022,
    city: 'Boston',
    name: 'Celtics',
    label: '2022 Boston Celtics',
    conference: 'East',
    deepestRound: 'nba_finals',
    strength: 88,
  },
  {
    id: '2023-heat',
    year: 2023,
    city: 'Miami',
    name: 'Heat',
    label: '2023 Miami Heat',
    conference: 'East',
    deepestRound: 'nba_finals',
    strength: 84,
  },
  // Dynasties / finals beasts
  {
    id: '1986-celtics',
    year: 1986,
    city: 'Boston',
    name: 'Celtics',
    label: '1986 Boston Celtics',
    conference: 'East',
    deepestRound: 'nba_finals',
    strength: 94,
  },
  {
    id: '1987-lakers',
    year: 1987,
    city: 'Los Angeles',
    name: 'Lakers',
    label: '1987 Los Angeles Lakers',
    conference: 'West',
    deepestRound: 'nba_finals',
    strength: 93,
  },
  {
    id: '1989-pistons',
    year: 1989,
    city: 'Detroit',
    name: 'Pistons',
    label: '1989 Detroit Pistons',
    conference: 'East',
    deepestRound: 'nba_finals',
    strength: 90,
  },
  {
    id: '1991-bulls',
    year: 1991,
    city: 'Chicago',
    name: 'Bulls',
    label: '1991 Chicago Bulls',
    conference: 'East',
    deepestRound: 'nba_finals',
    strength: 92,
  },
  {
    id: '1996-bulls',
    year: 1996,
    city: 'Chicago',
    name: 'Bulls',
    label: '1996 Chicago Bulls',
    conference: 'East',
    deepestRound: 'nba_finals',
    strength: 97,
  },
  {
    id: '2000-lakers',
    year: 2000,
    city: 'Los Angeles',
    name: 'Lakers',
    label: '2000 Los Angeles Lakers',
    conference: 'West',
    deepestRound: 'nba_finals',
    strength: 92,
  },
  {
    id: '2001-lakers',
    year: 2001,
    city: 'Los Angeles',
    name: 'Lakers',
    label: '2001 Los Angeles Lakers',
    conference: 'West',
    deepestRound: 'nba_finals',
    strength: 95,
  },
  {
    id: '2014-spurs',
    year: 2014,
    city: 'San Antonio',
    name: 'Spurs',
    label: '2014 San Antonio Spurs',
    conference: 'West',
    deepestRound: 'nba_finals',
    strength: 94,
  },
  {
    id: '2015-warriors',
    year: 2015,
    city: 'Golden State',
    name: 'Warriors',
    label: '2015 Golden State Warriors',
    conference: 'West',
    deepestRound: 'nba_finals',
    strength: 93,
  },
  {
    id: '2016-cavaliers',
    year: 2016,
    city: 'Cleveland',
    name: 'Cavaliers',
    label: '2016 Cleveland Cavaliers',
    conference: 'East',
    deepestRound: 'nba_finals',
    strength: 91,
  },
  {
    id: '2017-warriors',
    year: 2017,
    city: 'Golden State',
    name: 'Warriors',
    label: '2017 Golden State Warriors',
    conference: 'West',
    deepestRound: 'nba_finals',
    strength: 98,
  },
  {
    id: '2023-nuggets',
    year: 2023,
    city: 'Denver',
    name: 'Nuggets',
    label: '2023 Denver Nuggets',
    conference: 'West',
    deepestRound: 'nba_finals',
    strength: 91,
  },
  // Classic first-round / early exits that still made the dance
  {
    id: '1993-hornets',
    year: 1993,
    city: 'Charlotte',
    name: 'Hornets',
    label: '1993 Charlotte Hornets',
    conference: 'East',
    deepestRound: 'second_round',
    strength: 72,
  },
  {
    id: '1998-nets',
    year: 1998,
    city: 'New Jersey',
    name: 'Nets',
    label: '1998 New Jersey Nets',
    conference: 'East',
    deepestRound: 'first_round',
    strength: 68,
  },
  {
    id: '2005-wizards',
    year: 2005,
    city: 'Washington',
    name: 'Wizards',
    label: '2005 Washington Wizards',
    conference: 'East',
    deepestRound: 'second_round',
    strength: 73,
  },
  {
    id: '2009-rockets',
    year: 2009,
    city: 'Houston',
    name: 'Rockets',
    label: '2009 Houston Rockets',
    conference: 'West',
    deepestRound: 'second_round',
    strength: 78,
  },
  {
    id: '2010-hawks',
    year: 2010,
    city: 'Atlanta',
    name: 'Hawks',
    label: '2010 Atlanta Hawks',
    conference: 'East',
    deepestRound: 'second_round',
    strength: 74,
  },
  {
    id: '2012-sixers',
    year: 2012,
    city: 'Philadelphia',
    name: '76ers',
    label: '2012 Philadelphia 76ers',
    conference: 'East',
    deepestRound: 'second_round',
    strength: 75,
  },
];

const ROUND_ORDER: PlayoffRoundId[] = [
  'first_round',
  'second_round',
  'conference_finals',
  'nba_finals',
];

function roundDepth(round: PlayoffRoundId): number {
  return ROUND_ORDER.indexOf(round);
}

/** Teams that historically reached at least this round. */
export function teamsForRound(round: PlayoffRoundId): HistoricalPlayoffTeam[] {
  const minDepth = roundDepth(round);
  return TEAMS.filter((team) => roundDepth(team.deepestRound) >= minDepth);
}

export function pickHistoricalOpponent(
  round: PlayoffRoundId,
  usedIds: Set<string>,
): HistoricalPlayoffTeam {
  const pool = teamsForRound(round).filter((team) => !usedIds.has(team.id));
  const choices = pool.length > 0 ? pool : teamsForRound(round);
  return choices[Math.floor(Math.random() * choices.length)]!;
}

export function playoffRoundLabel(round: PlayoffRoundId): string {
  switch (round) {
    case 'first_round':
      return 'First Round';
    case 'second_round':
      return 'Conference Semifinals';
    case 'conference_finals':
      return 'Conference Finals';
    case 'nba_finals':
      return 'NBA Finals';
  }
}

export function nextPlayoffRound(round: PlayoffRoundId): PlayoffRoundId | null {
  const index = ROUND_ORDER.indexOf(round);
  if (index < 0 || index >= ROUND_ORDER.length - 1) return null;
  return ROUND_ORDER[index + 1]!;
}

export function enterRoundButtonLabel(round: PlayoffRoundId): string {
  switch (round) {
    case 'first_round':
      return 'Enter the Playoffs';
    case 'second_round':
      return 'Next Round';
    case 'conference_finals':
      return 'Next Round';
    case 'nba_finals':
      return 'Enter Finals';
  }
}
