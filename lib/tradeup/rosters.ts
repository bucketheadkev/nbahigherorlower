import type { Position, PlayerStats, TradePlayer } from './types';
import { getHeadshotUrl } from './playerHeadshots';
import { isHiddenEliteOfferId } from './hiddenEliteOffer';
import { isHiddenValueId } from './hiddenValue';

const CANONICAL_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

function p(
  id: string,
  name: string,
  teamId: string,
  primaryPosition: Position,
  age: number,
  stats: PlayerStats,
  tradeValue: number,
  isStarter: boolean,
  isFranchise = false,
): TradePlayer {
  if (!(CANONICAL_POSITIONS as readonly string[]).includes(primaryPosition)) {
    throw new Error(`Invalid primaryPosition "${primaryPosition}" for player ${id}`);
  }
  if (primaryPosition.includes('/')) {
    throw new Error(`Multi-position primaryPosition "${primaryPosition}" for player ${id}`);
  }

  const headshotUrl = getHeadshotUrl(id, name);
  const hiddenEliteOffer = isHiddenEliteOfferId(id);
  const hiddenValue = isHiddenValueId(id);
  return {
    id,
    name,
    teamId,
    primaryPosition,
    position: primaryPosition,
    age,
    stats,
    tradeValue,
    isStarter,
    isFranchise,
    ...(hiddenEliteOffer ? { hiddenEliteOffer: true } : {}),
    ...(hiddenValue ? { hiddenValue: true } : {}),
    ...(headshotUrl ? { headshotUrl } : {}),
  };
}

export const ROSTER: TradePlayer[] = [
  // Atlanta Hawks
  p('mccollum', 'CJ McCollum', 'ATL', 'SG', 34, { ppg: 19, rpg: 4, apg: 4.6, spg: 0.8, bpg: 0.3 }, 63, true),
  p('johnson_j', 'Jalen Johnson', 'ATL', 'PF', 24, { ppg: 18.9, rpg: 10, apg: 3.8, spg: 1.2, bpg: 0.8 }, 72, true),
  p('alexander_w', 'Nickeil Alexander-Walker', 'ATL', 'SG', 27, { ppg: 9, rpg: 2.8, apg: 2.5, spg: 0.7, bpg: 0.3 }, 40, true),
  p('okongwu', 'Onyeka Okongwu', 'ATL', 'C', 25, { ppg: 13.4, rpg: 8.2, apg: 2.3, spg: 0.6, bpg: 0.9 }, 54, true),
  p('kispert', 'Corey Kispert', 'ATL', 'SF', 27, { ppg: 11.2, rpg: 2.8, apg: 1.5, spg: 0.4, bpg: 0.1 }, 34, true),
  p('risacher', 'Zaccharie Risacher', 'ATL', 'SF', 21, { ppg: 12.1, rpg: 3.8, apg: 1.4, spg: 0.8, bpg: 0.5 }, 48, false),
  p('gabe_vincent', 'Gabe Vincent', 'ATL', 'PG', 30, { ppg: 13.7, rpg: 5.9, apg: 3.9, spg: 0.9, bpg: 1 }, 49, false),
  p('aaron_wiggins', 'Aaron Wiggins', 'ATL', 'SG', 27, { ppg: 12.6, rpg: 5.4, apg: 3.6, spg: 0.8, bpg: 0.9 }, 45, false),
  p('hield', 'Buddy Hield', 'ATL', 'SG', 33, { ppg: 12.1, rpg: 3.2, apg: 1.8, spg: 0.6, bpg: 0.2 }, 40, false),
  p('daniels', 'Dyson Daniels', 'ATL', 'SG', 23, { ppg: 14.1, rpg: 5.9, apg: 4.4, spg: 3, bpg: 0.5 }, 65, false),

  // Boston Celtics
  p('tatum', 'Jayson Tatum', 'BOS', 'SF', 28, { ppg: 26.8, rpg: 8.7, apg: 6, spg: 1, bpg: 0.5 }, 94, true, true),
  p('george', 'Paul George', 'BOS', 'SF', 36, { ppg: 16.2, rpg: 5.3, apg: 4.3, spg: 1.3, bpg: 0.3 }, 62, true),
  p('white', 'Derrick White', 'BOS', 'SG', 32, { ppg: 16.2, rpg: 4.1, apg: 5.2, spg: 1, bpg: 1 }, 68, true),
  p('mitchell_robinson', 'Mitchell Robinson', 'BOS', 'C', 28, { ppg: 17.6, rpg: 7.6, apg: 5, spg: 1.1, bpg: 1.3 }, 63, true),
  p('hauser', 'Sam Hauser', 'BOS', 'SF', 28, { ppg: 8.6, rpg: 3.5, apg: 1, spg: 0.4, bpg: 0.2 }, 32, true),
  p('pritchard', 'Payton Pritchard', 'BOS', 'PG', 28, { ppg: 14.3, rpg: 3.8, apg: 3.5, spg: 0.9, bpg: 0.1 }, 48, false),
  p('gonzalez', 'Hugo Gonzalez', 'BOS', 'SF', 20, { ppg: 13.2, rpg: 5.6, apg: 3.8, spg: 0.8, bpg: 0.9 }, 47, false),
  p('baylor_scheierman', 'Baylor Scheierman', 'BOS', 'SF', 25, { ppg: 10.9, rpg: 4.7, apg: 3.1, spg: 0.7, bpg: 0.8 }, 39, false),
  p('garza', 'Luka Garza', 'BOS', 'C', 27, { ppg: 6.5, rpg: 3.8, apg: 0.8, spg: 0.3, bpg: 0.4 }, 40, false),
  p('neemias_queta', 'Neemias Queta', 'BOS', 'C', 26, { ppg: 8.4, rpg: 3.6, apg: 2.4, spg: 0.5, bpg: 0.6 }, 51, false),

  // Brooklyn Nets
  p('porter', 'Michael Porter Jr.', 'BKN', 'SF', 28, { ppg: 18.2, rpg: 7, apg: 1.8, spg: 0.6, bpg: 0.5 }, 62, true),
  p('julius_randle', 'Julius Randle', 'BKN', 'PF', 31, { ppg: 12.6, rpg: 5.4, apg: 3.6, spg: 0.8, bpg: 0.9 }, 63, true),
  p('mann', 'Terance Mann', 'BKN', 'SG', 29, { ppg: 7.6, rpg: 3.2, apg: 2.2, spg: 0.5, bpg: 0.5 }, 27, true),
  p('demin', 'Egor Demin', 'BKN', 'PG', 20, { ppg: 16, rpg: 6.8, apg: 4.6, spg: 1, bpg: 1.1 }, 57, true),
  p('sharpe', 'Day\'Ron Sharpe', 'BKN', 'C', 24, { ppg: 8.5, rpg: 6.8, apg: 1.5, spg: 0.5, bpg: 0.6 }, 32, true),
  p('ziaire_williams', 'Ziaire Williams', 'BKN', 'SF', 24, { ppg: 14.3, rpg: 6.1, apg: 4.1, spg: 0.9, bpg: 1 }, 51, false),
  p('moritz_wagner', 'Moritz Wagner', 'BKN', 'C', 29, { ppg: 12, rpg: 5.2, apg: 3.4, spg: 0.8, bpg: 0.9 }, 43, false),
  p('nolan_traore', 'Nolan Traore', 'BKN', 'PG', 20, { ppg: 10.9, rpg: 4.7, apg: 3.1, spg: 0.7, bpg: 0.8 }, 39, false),
  p('clowney', 'Noah Clowney', 'BKN', 'PF', 21, { ppg: 10.1, rpg: 4.5, apg: 1.2, spg: 0.4, bpg: 0.5 }, 40, false),
  p('drake_powell', 'Drake Powell', 'BKN', 'SF', 20, { ppg: 8.4, rpg: 3.6, apg: 2.4, spg: 0.5, bpg: 0.6 }, 30, false),

  // Charlotte Hornets
  p('reid', 'Naz Reid', 'CHA', 'C', 26, { ppg: 14.2, rpg: 6, apg: 2.3, spg: 0.7, bpg: 0.9 }, 66, true),
  p('allen', 'Grayson Allen', 'CHA', 'SG', 30, { ppg: 20.2, rpg: 8.6, apg: 5.8, spg: 1.3, bpg: 1.4 }, 72, true),
  p('grant_williams', 'Grant Williams', 'CHA', 'PF', 27, { ppg: 18.8, rpg: 8, apg: 5.4, spg: 1.2, bpg: 1.3 }, 67, true),
  p('white_c', 'Coby White', 'CHA', 'SG', 26, { ppg: 18.2, rpg: 3.8, apg: 4.5, spg: 0.7, bpg: 0.2 }, 63, true),
  p('finney', 'Dorian Finney-Smith', 'CHA', 'PF', 33, { ppg: 8.5, rpg: 4.2, apg: 1.5, spg: 0.7, bpg: 0.4 }, 40, true),
  p('miller', 'Brandon Miller', 'CHA', 'SF', 23, { ppg: 21, rpg: 4.9, apg: 3.5, spg: 0.9, bpg: 0.6 }, 68, false),
  p('royce_oneale', 'Royce O\'Neale', 'CHA', 'PF', 33, { ppg: 13.7, rpg: 5.9, apg: 3.9, spg: 0.9, bpg: 1 }, 49, false),
  p('knueppel', 'Kon Knueppel', 'CHA', 'PG', 20, { ppg: 11.5, rpg: 3.2, apg: 2.8, spg: 0.7, bpg: 0.2 }, 66, false),
  p('tre_mann', 'Tre Mann', 'CHA', 'SG', 25, { ppg: 7.6, rpg: 3.2, apg: 2.2, spg: 0.5, bpg: 0.5 }, 27, false),
  p('tidjane_salaun', 'Tidjane Salaun', 'CHA', 'SF', 20, { ppg: 9.2, rpg: 4, apg: 2.6, spg: 0.6, bpg: 0.7 }, 33, false),

  // Chicago Bulls
  p('claxton', 'Nic Claxton', 'CHI', 'C', 27, { ppg: 11.2, rpg: 9.6, apg: 2.2, spg: 0.8, bpg: 1.5 }, 63, true),
  p('giddey', 'Josh Giddey', 'CHI', 'PG', 23, { ppg: 16.2, rpg: 7.5, apg: 7.2, spg: 0.9, bpg: 0.4 }, 63, true),
  p('powell', 'Norman Powell', 'CHI', 'SG', 33, { ppg: 21.8, rpg: 3.1, apg: 2.1, spg: 1.1, bpg: 0.2 }, 63, true),
  p('collins', 'Zach Collins', 'CHI', 'C', 28, { ppg: 11.2, rpg: 6.8, apg: 2.5, spg: 0.5, bpg: 0.8 }, 40, true),
  p('williams_p', 'Patrick Williams', 'CHI', 'PF', 24, { ppg: 10.5, rpg: 4.2, apg: 1.8, spg: 0.7, bpg: 0.5 }, 42, true),
  p('isaac_okoro', 'Isaac Okoro', 'CHI', 'SF', 25, { ppg: 15.1, rpg: 6.5, apg: 4.3, spg: 1, bpg: 1.1 }, 54, false),
  p('jalen_smith', 'Jalen Smith', 'CHI', 'C', 26, { ppg: 12.9, rpg: 5.5, apg: 3.7, spg: 0.8, bpg: 0.9 }, 46, false),
  p('jones_was', 'Tre Jones', 'CHI', 'PG', 26, { ppg: 8.5, rpg: 2.5, apg: 4.8, spg: 0.8, bpg: 0.2 }, 36, false),
  p('dillingham', 'Rob Dillingham', 'CHI', 'PG', 21, { ppg: 14.6, rpg: 6.2, apg: 4.2, spg: 0.9, bpg: 1 }, 52, false),
  p('guerschon_yabusele', 'Guerschon Yabusele', 'CHI', 'PF', 30, { ppg: 9.2, rpg: 4, apg: 2.6, spg: 0.6, bpg: 0.7 }, 33, false),

  // Cleveland Cavaliers
  p('mobley', 'Evan Mobley', 'CLE', 'PF', 25, { ppg: 18.5, rpg: 9.3, apg: 3.2, spg: 0.9, bpg: 1.4 }, 80, true),
  p('mitchell', 'Donovan Mitchell', 'CLE', 'SG', 29, { ppg: 24, rpg: 4.5, apg: 5, spg: 1.3, bpg: 0.2 }, 84, true, true),
  p('harden', 'James Harden', 'CLE', 'SG', 36, { ppg: 22.8, rpg: 5.8, apg: 8.7, spg: 1.5, bpg: 0.7 }, 76, true),
  p('jarrett_allen', 'Jarrett Allen', 'CLE', 'C', 28, { ppg: 13.7, rpg: 9.4, apg: 2.1, spg: 0.7, bpg: 1 }, 62, true),
  p('strus', 'Max Strus', 'CLE', 'SG', 30, { ppg: 12.2, rpg: 4.5, apg: 4, spg: 0.6, bpg: 0.2 }, 53, true),
  p('dennis_schroder', 'Dennis Schroder', 'CLE', 'PG', 32, { ppg: 15.1, rpg: 6.5, apg: 4.3, spg: 1, bpg: 1.1 }, 54, false),
  p('merrill', 'Sam Merrill', 'CLE', 'SG', 30, { ppg: 10.5, rpg: 2.8, apg: 2.1, spg: 0.5, bpg: 0.1 }, 40, false),
  p('jaylon_tyson', 'Jaylon Tyson', 'CLE', 'SF', 23, { ppg: 10.9, rpg: 4.7, apg: 3.1, spg: 0.7, bpg: 0.8 }, 39, false),
  p('bryant', 'Thomas Bryant', 'CLE', 'C', 28, { ppg: 7.8, rpg: 5.5, apg: 0.8, spg: 0.4, bpg: 0.8 }, 40, false),
  p('craig_jr', 'Craig Porter Jr.', 'CLE', 'PG', 26, { ppg: 9, rpg: 3.8, apg: 2.6, spg: 0.6, bpg: 0.6 }, 32, false),

  // Detroit Pistons
  p('cade', 'Cade Cunningham', 'DET', 'PG', 24, { ppg: 26.1, rpg: 6.1, apg: 9.1, spg: 1, bpg: 0.8 }, 82, true, true),
  p('williams_jazz', 'John Collins', 'DET', 'PF', 28, { ppg: 13.5, rpg: 6.8, apg: 1.5, spg: 0.5, bpg: 0.5 }, 42, true),
  p('huerter', 'Kevin Huerter', 'DET', 'SG', 27, { ppg: 11.8, rpg: 5, apg: 3.4, spg: 0.8, bpg: 0.8 }, 42, true),
  p('duncan_robinson', 'Duncan Robinson', 'DET', 'SF', 32, { ppg: 17.6, rpg: 7.6, apg: 5, spg: 1.1, bpg: 1.3 }, 63, true),
  p('joe', 'Isaiah Joe', 'DET', 'SG', 27, { ppg: 9, rpg: 3.8, apg: 2.6, spg: 0.6, bpg: 0.6 }, 32, true),
  p('ausar_thompson', 'Ausar Thompson', 'DET', 'SF', 23, { ppg: 14.3, rpg: 6.1, apg: 4.1, spg: 0.9, bpg: 1 }, 66, false),
  p('ii', 'Ronald Holland II', 'DET', 'SF', 21, { ppg: 13.2, rpg: 5.6, apg: 3.8, spg: 0.8, bpg: 0.9 }, 47, false),
  p('duren', 'Jalen Duren', 'DET', 'C', 22, { ppg: 13.8, rpg: 11.6, apg: 2.4, spg: 0.6, bpg: 1.1 }, 62, false),
  p('paul_reed', 'Paul Reed', 'DET', 'C', 27, { ppg: 10.4, rpg: 4.4, apg: 3, spg: 0.7, bpg: 0.7 }, 37, false),
  p('daniss_jenkins', 'Daniss Jenkins', 'DET', 'PG', 24, { ppg: 10.4, rpg: 4.4, apg: 3, spg: 0.7, bpg: 0.7 }, 37, false),

  // Indiana Pacers
  p('haliburton', 'Tyrese Haliburton', 'IND', 'PG', 26, { ppg: 18.6, rpg: 3.5, apg: 9.2, spg: 1.4, bpg: 0.3 }, 88, true, true),
  p('siakam', 'Pascal Siakam', 'IND', 'PF', 32, { ppg: 20.2, rpg: 6.9, apg: 3.9, spg: 0.9, bpg: 0.3 }, 72, true),
  p('nembhard', 'Andrew Nembhard', 'IND', 'PG', 26, { ppg: 10.4, rpg: 4.4, apg: 3, spg: 0.7, bpg: 0.7 }, 63, true),
  p('zubac', 'Ivica Zubac', 'IND', 'C', 29, { ppg: 16.8, rpg: 12.7, apg: 2.8, spg: 0.6, bpg: 1 }, 62, true),
  p('toppin', 'Obi Toppin', 'IND', 'PF', 28, { ppg: 10.3, rpg: 3.9, apg: 1.5, spg: 0.5, bpg: 0.4 }, 55, true),
  p('nesmith', 'Aaron Nesmith', 'IND', 'SF', 26, { ppg: 12.2, rpg: 3.8, apg: 1.5, spg: 0.7, bpg: 0.3 }, 63, false),
  p('mcconnell', 'T.J. McConnell', 'IND', 'PG', 34, { ppg: 9.1, rpg: 3.2, apg: 5.5, spg: 1.2, bpg: 0.1 }, 57, false),
  p('oconnor', 'Kelly Oubre Jr.', 'IND', 'SF', 30, { ppg: 15.1, rpg: 5, apg: 1.5, spg: 1.1, bpg: 0.5 }, 48, false),
  p('jarace_walker', 'Jarace Walker', 'IND', 'PF', 22, { ppg: 10.4, rpg: 4.4, apg: 3, spg: 0.7, bpg: 0.7 }, 37, false),
  p('sheppard', 'Ben Sheppard', 'IND', 'SG', 24, { ppg: 6.5, rpg: 3, apg: 1.8, spg: 0.6, bpg: 0.2 }, 28, false),

  // Miami Heat
  p('giannis', 'Giannis Antetokounmpo', 'MIA', 'PF', 31, { ppg: 30.4, rpg: 11.9, apg: 6.5, spg: 0.9, bpg: 1.2 }, 97, true, true),
  p('adebayo', 'Bam Adebayo', 'MIA', 'C', 28, { ppg: 18.1, rpg: 9.6, apg: 4.7, spg: 1.1, bpg: 0.9 }, 78, true),
  p('wiggins', 'Andrew Wiggins', 'MIA', 'SF', 31, { ppg: 17.8, rpg: 4.5, apg: 2.5, spg: 0.9, bpg: 0.6 }, 63, true),
  p('portis', 'Bobby Portis', 'MIA', 'PF', 31, { ppg: 13.9, rpg: 7.4, apg: 1.3, spg: 0.6, bpg: 0.3 }, 54, true),
  p('davion_mitchell', 'Davion Mitchell', 'MIA', 'PG', 27, { ppg: 16.2, rpg: 7, apg: 4.6, spg: 1, bpg: 1.2 }, 58, true),
  p('fontecchio', 'Simone Fontecchio', 'MIA', 'SF', 30, { ppg: 10.5, rpg: 3.8, apg: 1.5, spg: 0.5, bpg: 0.2 }, 40, false),
  p('jovic', 'Nikola Jovic', 'MIA', 'PF', 23, { ppg: 10.8, rpg: 4.2, apg: 2.5, spg: 0.6, bpg: 0.3 }, 40, false),
  p('dru_smith', 'Dru Smith', 'MIA', 'PG', 28, { ppg: 10.9, rpg: 4.7, apg: 3.1, spg: 0.7, bpg: 0.8 }, 39, false),
  p('tim_jr', 'Tim Hardaway Jr.', 'MIA', 'SG', 34, { ppg: 10.4, rpg: 4.4, apg: 3, spg: 0.7, bpg: 0.7 }, 58, false),
  p('keshad_johnson', 'Keshad Johnson', 'MIA', 'SF', 25, { ppg: 9, rpg: 3.8, apg: 2.6, spg: 0.6, bpg: 0.6 }, 32, false),

  // Milwaukee Bucks
  p('herro', 'Tyler Herro', 'MIL', 'SG', 26, { ppg: 23.2, rpg: 5, apg: 5.5, spg: 0.9, bpg: 0.2 }, 72, true),
  p('turner', 'Myles Turner', 'MIL', 'C', 30, { ppg: 15.9, rpg: 6.9, apg: 1.3, spg: 0.6, bpg: 2 }, 63, true),
  p('kuzma_was', 'Kyle Kuzma', 'MIL', 'PF', 30, { ppg: 18.2, rpg: 6.6, apg: 4.2, spg: 0.6, bpg: 0.5 }, 54, true),
  p('caris_levert', 'Caris LeVert', 'MIL', 'SG', 31, { ppg: 17.6, rpg: 7.6, apg: 5, spg: 1.1, bpg: 1.3 }, 63, true),
  p('dieng', 'Ousmane Dieng', 'MIL', 'SF', 23, { ppg: 6.5, rpg: 3.5, apg: 1.5, spg: 0.5, bpg: 0.4 }, 40, true),
  p('porter_jr_mil', 'Kevin Porter Jr.', 'MIL', 'PG', 26, { ppg: 14.3, rpg: 6.1, apg: 4.1, spg: 0.9, bpg: 1 }, 51, false),
  p('ware', 'Kel\'el Ware', 'MIL', 'C', 22, { ppg: 9.8, rpg: 7.2, apg: 0.8, spg: 0.4, bpg: 1.2 }, 63, false),
  p('rollins', 'Ryan Rollins', 'MIL', 'PG', 24, { ppg: 8.2, rpg: 2.5, apg: 2.8, spg: 0.7, bpg: 0.2 }, 30, false),
  p('jaquez', 'Jaime Jaquez Jr.', 'MIL', 'SF', 25, { ppg: 12.5, rpg: 4.2, apg: 2.8, spg: 0.8, bpg: 0.3 }, 48, false),
  p('trent_jr', 'Gary Trent Jr.', 'MIL', 'SG', 27, { ppg: 8.4, rpg: 3.6, apg: 2.4, spg: 0.5, bpg: 0.6 }, 30, false),

  // New York Knicks
  p('towns', 'Karl-Anthony Towns', 'NYK', 'C', 30, { ppg: 24.4, rpg: 12.8, apg: 3.1, spg: 0.7, bpg: 0.7 }, 82, true),
  p('anunoby', 'OG Anunoby', 'NYK', 'SF', 28, { ppg: 15.6, rpg: 4.8, apg: 2, spg: 1.5, bpg: 0.5 }, 62, true),
  p('brunson', 'Jalen Brunson', 'NYK', 'PG', 29, { ppg: 26, rpg: 3.1, apg: 7.3, spg: 0.9, bpg: 0.1 }, 92, true, true),
  p('bridges_m', 'Mikal Bridges', 'NYK', 'SF', 29, { ppg: 17.6, rpg: 3.2, apg: 3.7, spg: 1, bpg: 0.5 }, 66, true),
  p('hart', 'Josh Hart', 'NYK', 'SF', 31, { ppg: 13.6, rpg: 9.6, apg: 5.5, spg: 1, bpg: 0.3 }, 63, true),
  p('drummond', 'Andre Drummond', 'NYK', 'C', 32, { ppg: 8.4, rpg: 10.2, apg: 1.5, spg: 0.7, bpg: 0.8 }, 50, false),
  p('murphy_bench', 'Jose Alvarado', 'NYK', 'PG', 28, { ppg: 7.5, rpg: 2.5, apg: 3.5, spg: 1.2, bpg: 0.2 }, 40, false),
  p('mcbride', 'Miles McBride', 'NYK', 'PG', 25, { ppg: 9.5, rpg: 2.5, apg: 2.8, spg: 0.7, bpg: 0.1 }, 63, false),
  p('dadiet', 'Pacome Dadiet', 'NYK', 'SF', 20, { ppg: 5.2, rpg: 2.8, apg: 0.8, spg: 0.4, bpg: 0.2 }, 28, false),
  p('dillon_jones', 'Dillon Jones', 'NYK', 'SF', 24, { ppg: 8.4, rpg: 3.6, apg: 2.4, spg: 0.5, bpg: 0.6 }, 30, false),

  // Orlando Magic
  p('wagner', 'Franz Wagner', 'ORL', 'SF', 24, { ppg: 24.2, rpg: 5.7, apg: 4.7, spg: 1.3, bpg: 0.4 }, 80, true),
  p('beaupre', 'Desmond Bane', 'ORL', 'SG', 28, { ppg: 19.2, rpg: 4.3, apg: 5.3, spg: 1, bpg: 0.4 }, 68, true),
  p('suggs', 'Jalen Suggs', 'ORL', 'PG', 25, { ppg: 12.6, rpg: 3.1, apg: 2.7, spg: 1.4, bpg: 0.3 }, 63, true),
  p('vucevic', 'Nikola Vucevic', 'ORL', 'C', 35, { ppg: 18.5, rpg: 10.1, apg: 3.2, spg: 0.7, bpg: 0.7 }, 60, true),
  p('banchero', 'Paolo Banchero', 'ORL', 'PF', 23, { ppg: 25.7, rpg: 7.5, apg: 4.8, spg: 0.9, bpg: 0.6 }, 86, true, true),
  p('isaac', 'Jonathan Isaac', 'ORL', 'PF', 28, { ppg: 6.1, rpg: 4.5, apg: 0.8, spg: 0.8, bpg: 1.2 }, 40, false),
  p('carter_w', 'Wendell Carter Jr.', 'ORL', 'C', 27, { ppg: 11.8, rpg: 8.5, apg: 2.1, spg: 0.6, bpg: 0.8 }, 52, false),
  p('bitadze', 'Goga Bitadze', 'ORL', 'C', 26, { ppg: 7.5, rpg: 5.8, apg: 1.2, spg: 0.5, bpg: 1 }, 40, false),
  p('black', 'Anthony Black', 'ORL', 'PG', 22, { ppg: 10.5, rpg: 3.2, apg: 3.5, spg: 1, bpg: 0.5 }, 63, false),
  p('howard', 'Jett Howard', 'ORL', 'SG', 22, { ppg: 7.6, rpg: 3.2, apg: 2.2, spg: 0.5, bpg: 0.5 }, 27, false),

  // Philadelphia 76ers
  p('embiid', 'Joel Embiid', 'PHI', 'C', 32, { ppg: 23.8, rpg: 8.2, apg: 4.5, spg: 0.7, bpg: 1.2 }, 90, true, true),
  p('lebron', 'LeBron James', 'PHI', 'SF', 41, { ppg: 24.4, rpg: 7.8, apg: 8.2, spg: 1.1, bpg: 0.6 }, 99, true, true),
  p('brown', 'Jaylen Brown', 'PHI', 'SF', 29, { ppg: 22.3, rpg: 5.8, apg: 4.5, spg: 1.1, bpg: 0.3 }, 89, true),
  p('maxey', 'Tyrese Maxey', 'PHI', 'PG', 25, { ppg: 26.3, rpg: 3.3, apg: 6.1, spg: 1, bpg: 0.3 }, 84, true),
  p('simons', 'Anfernee Simons', 'PHI', 'SG', 27, { ppg: 19.3, rpg: 2.8, apg: 4.8, spg: 0.8, bpg: 0.2 }, 63, true),
  p('edgecombe', 'VJ Edgecombe', 'PHI', 'SG', 20, { ppg: 9.5, rpg: 3.5, apg: 2, spg: 0.8, bpg: 0.3 }, 67, true),
  p('wade', 'Dean Wade', 'PHI', 'PF', 29, { ppg: 6.5, rpg: 4.8, apg: 1.5, spg: 0.6, bpg: 0.5 }, 48, false),
  p('barlow', 'Dominick Barlow', 'PHI', 'PF', 23, { ppg: 5.8, rpg: 4.2, apg: 1, spg: 0.5, bpg: 0.6 }, 40, false),
  p('trendon_watford', 'Trendon Watford', 'PHI', 'PF', 25, { ppg: 10.9, rpg: 4.7, apg: 3.1, spg: 0.7, bpg: 0.8 }, 39, false),
  p('lowry', 'Kyle Lowry', 'PHI', 'PG', 40, { ppg: 7.6, rpg: 3.2, apg: 2.2, spg: 0.5, bpg: 0.5 }, 27, false),
  p('edwards', 'Justin Edwards', 'PHI', 'SF', 22, { ppg: 13.2, rpg: 5.6, apg: 3.8, spg: 0.8, bpg: 0.9 }, 47, false),

  // Toronto Raptors
  p('barnes', 'Scottie Barnes', 'TOR', 'PF', 24, { ppg: 19.3, rpg: 7.7, apg: 5.8, spg: 1.1, bpg: 1 }, 78, true, true),
  p('quickley', 'Immanuel Quickley', 'TOR', 'PG', 27, { ppg: 17.1, rpg: 3.5, apg: 5.8, spg: 0.8, bpg: 0.1 }, 56, true),
  p('barrett', 'RJ Barrett', 'TOR', 'SF', 26, { ppg: 17, rpg: 5.5, apg: 3.2, spg: 0.7, bpg: 0.3 }, 54, true),
  p('poeltl', 'Jakob Poeltl', 'TOR', 'C', 30, { ppg: 11.1, rpg: 8.6, apg: 2.1, spg: 0.5, bpg: 1.4 }, 48, true),
  p('collin_murray-boyles', 'Collin Murray-Boyles', 'TOR', 'PF', 21, { ppg: 15.4, rpg: 6.6, apg: 4.4, spg: 1, bpg: 1.1 }, 55, true),
  p('bateman', 'Ja\'Kobe Walter', 'TOR', 'SG', 21, { ppg: 7.2, rpg: 2.8, apg: 1.5, spg: 0.6, bpg: 0.2 }, 30, false),
  p('garrett_temple', 'Garrett Temple', 'TOR', 'SG', 40, { ppg: 12, rpg: 5.2, apg: 3.4, spg: 0.8, bpg: 0.9 }, 43, false),
  p('lawson', 'A.J. Lawson', 'TOR', 'SG', 25, { ppg: 9, rpg: 3.8, apg: 2.6, spg: 0.6, bpg: 0.6 }, 32, false),
  p('jackson_d', 'Trayce Jackson-Davis', 'TOR', 'C', 26, { ppg: 7.5, rpg: 5.8, apg: 1.5, spg: 0.5, bpg: 0.8 }, 34, false),
  p('shead', 'Jamal Shead', 'TOR', 'PG', 23, { ppg: 8.5, rpg: 2.5, apg: 5.2, spg: 0.7, bpg: 0.1 }, 36, false),

  // Washington Wizards
  p('davis', 'Anthony Davis', 'WAS', 'PF', 33, { ppg: 22.5, rpg: 11.2, apg: 3.5, spg: 1.2, bpg: 2.1 }, 86, true, true),
  p('trae', 'Trae Young', 'WAS', 'PG', 27, { ppg: 24.2, rpg: 3.1, apg: 11.6, spg: 1, bpg: 0.2 }, 82, true, true),
  p('khris_middleton', 'Khris Middleton', 'WAS', 'SF', 34, { ppg: 13.7, rpg: 5.9, apg: 3.9, spg: 0.9, bpg: 1 }, 49, true),
  p('sarr', 'Alex Sarr', 'WAS', 'C', 21, { ppg: 13, rpg: 6.5, apg: 2.4, spg: 0.7, bpg: 1.8 }, 52, true),
  p('tre_johnson', 'Tre Johnson', 'WAS', 'SG', 20, { ppg: 15.4, rpg: 6.6, apg: 4.4, spg: 1, bpg: 1.1 }, 55, true),
  p('ayton_por', 'Deandre Ayton', 'WAS', 'C', 27, { ppg: 14.4, rpg: 10.2, apg: 1.5, spg: 0.6, bpg: 0.8 }, 52, false),
  p('coulibaly', 'Bilal Coulibaly', 'WAS', 'SF', 21, { ppg: 11.5, rpg: 4.5, apg: 2.5, spg: 1, bpg: 0.6 }, 46, false),
  p('johnson_bub', 'Bub Carrington', 'WAS', 'PG', 20, { ppg: 8.8, rpg: 3.5, apg: 4.2, spg: 0.6, bpg: 0.2 }, 40, false),
  p('whitmore_h', 'Cam Whitmore', 'WAS', 'SF', 22, { ppg: 9.8, rpg: 3.2, apg: 1, spg: 0.5, bpg: 0.2 }, 36, false),
  p('will_riley', 'Will Riley', 'WAS', 'SF', 20, { ppg: 8.4, rpg: 3.6, apg: 2.4, spg: 0.5, bpg: 0.6 }, 30, false),

  // Dallas Mavericks
  p('irving', 'Kyrie Irving', 'DAL', 'PG', 34, { ppg: 24.7, rpg: 4.8, apg: 4.6, spg: 1.3, bpg: 0.3 }, 78, true),
  p('aldama', 'Santi Aldama', 'DAL', 'PF', 25, { ppg: 12.7, rpg: 6.8, apg: 2.8, spg: 0.7, bpg: 0.8 }, 50, true),
  p('klay_thompson', 'Klay Thompson', 'DAL', 'SG', 36, { ppg: 18.8, rpg: 8, apg: 5.4, spg: 1.2, bpg: 1.3 }, 67, true),
  p('flagg', 'Cooper Flagg', 'DAL', 'SF', 19, { ppg: 14.8, rpg: 6.2, apg: 3.1, spg: 1, bpg: 0.9 }, 62, true),
  p('gafford', 'Daniel Gafford', 'DAL', 'C', 27, { ppg: 12.3, rpg: 6.8, apg: 1.5, spg: 0.5, bpg: 1.8 }, 65, true),
  p('washington', 'P.J. Washington', 'DAL', 'PF', 27, { ppg: 14.2, rpg: 7.8, apg: 2.5, spg: 0.8, bpg: 0.8 }, 52, false),
  p('caleb_martin', 'Caleb Martin', 'DAL', 'SF', 30, { ppg: 12.9, rpg: 5.5, apg: 3.7, spg: 0.8, bpg: 0.9 }, 46, false),
  p('naji_marshall', 'Naji Marshall', 'DAL', 'SF', 28, { ppg: 11.8, rpg: 5, apg: 3.4, spg: 0.8, bpg: 0.8 }, 42, false),
  p('christie', 'Max Christie', 'DAL', 'SG', 23, { ppg: 18.8, rpg: 8, apg: 5.4, spg: 1.2, bpg: 1.3 }, 67, false),
  p('lively_ii', 'Dereck Lively II', 'DAL', 'C', 22, { ppg: 9.2, rpg: 4, apg: 2.6, spg: 0.6, bpg: 0.7 }, 65, false),

  // Denver Nuggets
  p('jokic', 'Nikola Jokic', 'DEN', 'C', 31, { ppg: 29.6, rpg: 12.7, apg: 10.2, spg: 1.8, bpg: 0.6 }, 99, true, true),
  p('murray', 'Jamal Murray', 'DEN', 'PG', 29, { ppg: 21.4, rpg: 4, apg: 6.2, spg: 1, bpg: 0.3 }, 78, true),
  p('gordon', 'Aaron Gordon', 'DEN', 'PF', 30, { ppg: 14.6, rpg: 6.2, apg: 4.2, spg: 0.9, bpg: 1 }, 66, true),
  p('johnson_c', 'Cameron Johnson', 'DEN', 'SF', 30, { ppg: 14, rpg: 4.3, apg: 2.9, spg: 0.7, bpg: 0.3 }, 50, true),
  p('najee', 'Zeke Nnaji', 'DEN', 'PF', 25, { ppg: 5.5, rpg: 3.8, apg: 0.5, spg: 0.3, bpg: 0.5 }, 26, true),
  p('braun', 'Christian Braun', 'DEN', 'SG', 25, { ppg: 15.4, rpg: 5.2, apg: 2.6, spg: 0.8, bpg: 0.4 }, 54, false),
  p('watson', 'Peyton Watson', 'DEN', 'SF', 23, { ppg: 8.5, rpg: 3.8, apg: 1.2, spg: 0.7, bpg: 1 }, 40, false),
  p('daron_ii', 'DaRon Holmes II', 'DEN', 'PF', 23, { ppg: 13.2, rpg: 5.6, apg: 3.8, spg: 0.8, bpg: 0.9 }, 47, false),
  p('strawther', 'Julian Strawther', 'DEN', 'SG', 24, { ppg: 7.5, rpg: 2.5, apg: 1.5, spg: 0.4, bpg: 0.2 }, 49, false),
  p('bagley', 'Marvin Bagley III', 'DEN', 'C', 27, { ppg: 10.5, rpg: 6.8, apg: 1.2, spg: 0.5, bpg: 0.5 }, 40, false),

  // Golden State Warriors
  p('curry', 'Stephen Curry', 'GSW', 'PG', 38, { ppg: 24.5, rpg: 4.4, apg: 6, spg: 0.9, bpg: 0.4 }, 92, true, true),
  p('jimmy_iii', 'Jimmy Butler III', 'GSW', 'SF', 36, { ppg: 20.2, rpg: 8.6, apg: 5.8, spg: 1.3, bpg: 1.4 }, 72, true),
  p('porzingis', 'Kristaps Porzingis', 'GSW', 'C', 30, { ppg: 19.5, rpg: 6.8, apg: 2.1, spg: 0.7, bpg: 1.5 }, 74, true),
  p('green', 'Draymond Green', 'GSW', 'PF', 36, { ppg: 8.6, rpg: 6.1, apg: 6, spg: 1, bpg: 1.2 }, 63, true),
  p('moses_moody', 'Moses Moody', 'GSW', 'SG', 24, { ppg: 16.2, rpg: 7, apg: 4.6, spg: 1, bpg: 1.2 }, 58, true),
  p('horford', 'Al Horford', 'GSW', 'C', 40, { ppg: 9, rpg: 6.4, apg: 2.6, spg: 0.6, bpg: 1 }, 63, false),
  p('podz', 'Brandin Podziemski', 'GSW', 'SG', 23, { ppg: 11.7, rpg: 5.1, apg: 3.4, spg: 0.8, bpg: 0.2 }, 46, false),
  p('melton', 'De\'Anthony Melton', 'GSW', 'SG', 28, { ppg: 10.2, rpg: 3.5, apg: 2.5, spg: 1.2, bpg: 0.3 }, 38, false),
  p('payton_ii', 'Gary Payton II', 'GSW', 'SG', 33, { ppg: 9.5, rpg: 4.1, apg: 2.7, spg: 0.6, bpg: 0.7 }, 34, false),
  p('gui_santos', 'Gui Santos', 'GSW', 'SF', 24, { ppg: 8.4, rpg: 3.6, apg: 2.4, spg: 0.5, bpg: 0.6 }, 30, false),

  // Houston Rockets
  p('durant', 'Kevin Durant', 'HOU', 'SF', 37, { ppg: 26.6, rpg: 6, apg: 4.2, spg: 0.8, bpg: 1.2 }, 84, true),
  p('sengun', 'Alperen Sengun', 'HOU', 'C', 23, { ppg: 19.1, rpg: 10.3, apg: 4.9, spg: 1.1, bpg: 0.7 }, 78, true, true),
  p('vanvleet', 'Fred VanVleet', 'HOU', 'PG', 32, { ppg: 14.1, rpg: 3.8, apg: 5.6, spg: 1.4, bpg: 0.3 }, 52, true),
  p('bogdanovic', 'Bogdan Bogdanovic', 'HOU', 'SG', 33, { ppg: 18.8, rpg: 8, apg: 5.4, spg: 1.2, bpg: 1.3 }, 67, true),
  p('adams', 'Steven Adams', 'HOU', 'C', 32, { ppg: 6.5, rpg: 8.5, apg: 1.5, spg: 0.5, bpg: 0.8 }, 40, true),
  p('smith', 'Jabari Smith Jr.', 'HOU', 'PF', 23, { ppg: 13.7, rpg: 8.1, apg: 1.6, spg: 0.6, bpg: 0.9 }, 63, false),
  p('reed_sheppard', 'Reed Sheppard', 'HOU', 'SG', 22, { ppg: 13.7, rpg: 5.9, apg: 3.9, spg: 0.9, bpg: 1 }, 49, false),
  p('thompson', 'Amen Thompson', 'HOU', 'PG', 23, { ppg: 14.1, rpg: 8.2, apg: 3.8, spg: 1.4, bpg: 0.6 }, 68, false),
  p('capela', 'Clint Capela', 'HOU', 'C', 32, { ppg: 11.5, rpg: 10.6, apg: 1.2, spg: 0.7, bpg: 1.5 }, 52, false),
  p('eason', 'Tari Eason', 'HOU', 'PF', 25, { ppg: 12, rpg: 6.5, apg: 1.5, spg: 1.2, bpg: 0.8 }, 48, false),

  // LA Clippers
  p('leonard', 'Kawhi Leonard', 'LAC', 'SF', 35, { ppg: 21.5, rpg: 5.9, apg: 4, spg: 1.6, bpg: 0.5 }, 82, true, true),
  p('garland', 'Darius Garland', 'LAC', 'PG', 26, { ppg: 20.6, rpg: 2.7, apg: 6.6, spg: 1, bpg: 0.1 }, 76, true),
  p('ingram', 'Brandon Ingram', 'LAC', 'SF', 28, { ppg: 22.2, rpg: 5.6, apg: 5.2, spg: 0.8, bpg: 0.6 }, 72, true),
  p('hachimura', 'Rui Hachimura', 'LAC', 'PF', 28, { ppg: 13, rpg: 5.2, apg: 1.5, spg: 0.5, bpg: 0.3 }, 63, true),
  p('jones', 'Derrick Jones Jr.', 'LAC', 'SF', 29, { ppg: 10.5, rpg: 3.8, apg: 1.2, spg: 0.7, bpg: 0.8 }, 40, true),
  p('mathurin', 'Bennedict Mathurin', 'LAC', 'SG', 24, { ppg: 16.1, rpg: 5.3, apg: 1.9, spg: 0.7, bpg: 0.2 }, 63, false),
  p('lopez', 'Brook Lopez', 'LAC', 'C', 38, { ppg: 12.5, rpg: 5.2, apg: 1.6, spg: 0.5, bpg: 1.9 }, 48, false),
  p('isaiah_jackson', 'Isaiah Jackson', 'LAC', 'C', 24, { ppg: 11.8, rpg: 5, apg: 3.4, spg: 0.8, bpg: 0.8 }, 42, false),
  p('dunn', 'Kris Dunn', 'LAC', 'PG', 32, { ppg: 8.1, rpg: 3.5, apg: 2.8, spg: 1.2, bpg: 0.3 }, 40, false),
  p('dick', 'Gradey Dick', 'LAC', 'SG', 22, { ppg: 14.5, rpg: 2.8, apg: 1.8, spg: 0.6, bpg: 0.1 }, 63, false),

  // Los Angeles Lakers
  p('doncic', 'Luka Doncic', 'LAL', 'PG', 27, { ppg: 28.2, rpg: 8.2, apg: 7.7, spg: 1.8, bpg: 0.4 }, 97, true, true),
  p('sexton', 'Collin Sexton', 'LAL', 'PG', 27, { ppg: 18.7, rpg: 2.6, apg: 4.9, spg: 0.8, bpg: 0.1 }, 52, true),
  p('reaves', 'Austin Reaves', 'LAL', 'SG', 28, { ppg: 16.1, rpg: 4.1, apg: 5.2, spg: 0.8, bpg: 0.1 }, 72, true),
  p('vanderbilt', 'Jarred Vanderbilt', 'LAL', 'PF', 27, { ppg: 5.2, rpg: 5.8, apg: 1.5, spg: 0.8, bpg: 0.3 }, 34, true),
  p('kleber', 'Maxi Kleber', 'LAL', 'PF', 34, { ppg: 5.5, rpg: 4.2, apg: 1.2, spg: 0.4, bpg: 0.8 }, 32, true),
  p('grimes', 'Quentin Grimes', 'LAL', 'SG', 26, { ppg: 14, rpg: 4.5, apg: 2.8, spg: 0.9, bpg: 0.3 }, 48, false),
  p('looney', 'Kevon Looney', 'LAL', 'C', 30, { ppg: 7.6, rpg: 3.2, apg: 2.2, spg: 0.5, bpg: 0.5 }, 27, false),
  p('hardy', 'Jaden Hardy', 'LAL', 'SG', 24, { ppg: 9.5, rpg: 2.2, apg: 2, spg: 0.5, bpg: 0.1 }, 40, false),
  p('laravia', 'Jake LaRavia', 'LAL', 'PF', 24, { ppg: 9, rpg: 3.8, apg: 2.6, spg: 0.6, bpg: 0.6 }, 32, false),
  p('kessler', 'Walker Kessler', 'LAL', 'C', 24, { ppg: 8.5, rpg: 7.2, apg: 1, spg: 0.5, bpg: 2 }, 64, false),

  // Memphis Grizzlies
  p('grant', 'Jerami Grant', 'MEM', 'PF', 32, { ppg: 10.4, rpg: 4.4, apg: 3, spg: 0.7, bpg: 0.7 }, 37, true),
  p('caldwell-pope', 'Kentavious Caldwell-Pope', 'MEM', 'SG', 33, { ppg: 17.4, rpg: 7.4, apg: 5, spg: 1.1, bpg: 1.2 }, 62, true),
  p('isaiah_stewart', 'Isaiah Stewart', 'MEM', 'C', 25, { ppg: 18.8, rpg: 8, apg: 5.4, spg: 1.2, bpg: 1.3 }, 67, true),
  p('jerome', 'Ty Jerome', 'MEM', 'PG', 29, { ppg: 12.5, rpg: 2.5, apg: 3.8, spg: 0.9, bpg: 0.2 }, 42, true),
  p('hendricks', 'Taylor Hendricks', 'MEM', 'PF', 22, { ppg: 7.2, rpg: 5.8, apg: 1, spg: 0.5, bpg: 0.8 }, 38, true),
  p('edey', 'Zach Edey', 'MEM', 'C', 24, { ppg: 13.2, rpg: 5.6, apg: 3.8, spg: 0.8, bpg: 0.9 }, 47, false),
  p('coward', 'Cedric Coward', 'MEM', 'SF', 22, { ppg: 14.6, rpg: 6.2, apg: 4.2, spg: 0.9, bpg: 1 }, 52, false),
  p('dangelo_russell', 'D\'Angelo Russell', 'MEM', 'PG', 30, { ppg: 11.8, rpg: 5, apg: 3.4, spg: 0.8, bpg: 0.8 }, 42, false),
  p('walter_jr', 'Walter Clayton Jr.', 'MEM', 'PG', 23, { ppg: 16, rpg: 6.8, apg: 4.6, spg: 1, bpg: 1.1 }, 57, false),
  p('dariq_whitehead', 'Dariq Whitehead', 'MEM', 'SF', 21, { ppg: 8.4, rpg: 3.6, apg: 2.4, spg: 0.5, bpg: 0.6 }, 30, false),

  // Minnesota Timberwolves
  p('anthony_edwards', 'Anthony Edwards', 'MIN', 'SG', 24, { ppg: 27.6, rpg: 5.7, apg: 4.5, spg: 1.2, bpg: 0.6 }, 94, true, true),
  p('ball', 'LaMelo Ball', 'MIN', 'PG', 24, { ppg: 25.2, rpg: 5.1, apg: 7.4, spg: 1.1, bpg: 0.3 }, 78, true, true),
  p('gobert', 'Rudy Gobert', 'MIN', 'C', 34, { ppg: 14, rpg: 12.7, apg: 1.8, spg: 0.6, bpg: 2.1 }, 62, true),
  p('mcdaniels', 'Jaden McDaniels', 'MIN', 'SF', 25, { ppg: 12.2, rpg: 5.7, apg: 2, spg: 0.9, bpg: 0.8 }, 66, true),
  p('green_j', 'Josh Green', 'MIN', 'SG', 25, { ppg: 8.2, rpg: 3.1, apg: 2, spg: 0.8, bpg: 0.3 }, 34, true),
  p('divincenzo', 'Donte DiVincenzo', 'MIN', 'SG', 29, { ppg: 16, rpg: 6.8, apg: 4.6, spg: 1, bpg: 1.1 }, 63, false),
  p('dosunmu', 'Ayo Dosunmu', 'MIN', 'SG', 26, { ppg: 12.2, rpg: 3.1, apg: 3.5, spg: 0.8, bpg: 0.3 }, 68, false),
  p('beringer', 'Joan Beringer', 'MIN', 'C', 19, { ppg: 18.8, rpg: 8, apg: 5.4, spg: 1.2, bpg: 1.3 }, 67, false),
  p('shannon', 'Terrence Shannon Jr.', 'MIN', 'SG', 25, { ppg: 7.5, rpg: 2.5, apg: 1.2, spg: 0.5, bpg: 0.1 }, 28, false),
  p('hyland', 'Bones Hyland', 'MIN', 'PG', 25, { ppg: 8.2, rpg: 2, apg: 3.5, spg: 0.6, bpg: 0.2 }, 32, false),

  // New Orleans Pelicans
  p('williamson', 'Zion Williamson', 'NOP', 'PF', 26, { ppg: 24.6, rpg: 7.2, apg: 5.3, spg: 1.2, bpg: 0.6 }, 82, true, true),
  p('poole', 'Jordan Poole', 'NOP', 'SG', 27, { ppg: 20.1, rpg: 3, apg: 4.5, spg: 1, bpg: 0.3 }, 52, true),
  p('murray_dej', 'Dejounte Murray', 'NOP', 'PG', 29, { ppg: 20.5, rpg: 5.3, apg: 6.1, spg: 1.4, bpg: 0.3 }, 68, true),
  p('murphy', 'Trey Murphy III', 'NOP', 'SF', 26, { ppg: 21.2, rpg: 5.1, apg: 3.5, spg: 1.1, bpg: 0.5 }, 68, true),
  p('jones_h', 'Herbert Jones', 'NOP', 'SF', 27, { ppg: 10.2, rpg: 3.8, apg: 2.5, spg: 1.4, bpg: 0.5 }, 63, true),
  p('fears', 'Jeremiah Fears', 'NOP', 'PG', 19, { ppg: 17.4, rpg: 7.4, apg: 5, spg: 1.1, bpg: 1.2 }, 62, false),
  p('bey', 'Saddiq Bey', 'NOP', 'SF', 27, { ppg: 20.2, rpg: 8.6, apg: 5.8, spg: 1.3, bpg: 1.4 }, 72, false),
  p('derik_queen', 'Derik Queen', 'NOP', 'C', 21, { ppg: 11.8, rpg: 5, apg: 3.4, spg: 0.8, bpg: 0.8 }, 63, false),
  p('hawkins', 'Jordan Hawkins', 'NOP', 'SG', 24, { ppg: 11.5, rpg: 3.2, apg: 1.8, spg: 0.6, bpg: 0.2 }, 40, false),
  p('missi', 'Yves Missi', 'NOP', 'C', 22, { ppg: 9, rpg: 3.8, apg: 2.6, spg: 0.6, bpg: 0.6 }, 32, false),

  // Oklahoma City Thunder
  p('sga', 'Shai Gilgeous-Alexander', 'OKC', 'PG', 27, { ppg: 32.7, rpg: 5, apg: 6.4, spg: 1.7, bpg: 1 }, 96, true, true),
  p('hartenstein', 'Isaiah Hartenstein', 'OKC', 'C', 28, { ppg: 11.2, rpg: 10.7, apg: 3.8, spg: 0.8, bpg: 1.1 }, 66, true),
  p('dort', 'Luguentz Dort', 'OKC', 'SG', 27, { ppg: 10.9, rpg: 4, apg: 1.6, spg: 1.1, bpg: 0.3 }, 63, true),
  p('caruso', 'Alex Caruso', 'OKC', 'SG', 32, { ppg: 7.8, rpg: 3.5, apg: 2.8, spg: 1.5, bpg: 0.5 }, 63, true),
  p('holmgren', 'Chet Holmgren', 'OKC', 'C', 24, { ppg: 15.7, rpg: 8, apg: 2.4, spg: 0.6, bpg: 2.2 }, 78, true),
  p('jaylin_williams', 'Jaylin Williams', 'OKC', 'C', 24, { ppg: 14.3, rpg: 6.1, apg: 4.1, spg: 0.9, bpg: 1 }, 51, false),
  p('kenrich_williams', 'Kenrich Williams', 'OKC', 'PF', 31, { ppg: 12.9, rpg: 5.5, apg: 3.7, spg: 0.8, bpg: 0.9 }, 46, false),
  p('williams_j', 'Jalen Williams', 'OKC', 'SF', 25, { ppg: 21.6, rpg: 5.3, apg: 5.1, spg: 1.3, bpg: 0.5 }, 80, false),
  p('wallace', 'Cason Wallace', 'OKC', 'SG', 22, { ppg: 8.5, rpg: 3.2, apg: 2.5, spg: 1, bpg: 0.3 }, 74, false),
  p('nikola_topic', 'Nikola Topic', 'OKC', 'PG', 20, { ppg: 9.2, rpg: 4, apg: 2.6, spg: 0.6, bpg: 0.7 }, 33, false),

  // Phoenix Suns
  p('booker', 'Devin Booker', 'PHX', 'SG', 29, { ppg: 25.6, rpg: 4.1, apg: 7.1, spg: 0.9, bpg: 0.2 }, 86, true, true),
  p('green_jalen', 'Jalen Green', 'PHX', 'SG', 24, { ppg: 21, rpg: 4.6, apg: 3.4, spg: 0.8, bpg: 0.2 }, 72, true),
  p('bridges_miles', 'Miles Bridges', 'PHX', 'SF', 28, { ppg: 20.3, rpg: 7.5, apg: 3.9, spg: 0.7, bpg: 0.5 }, 64, true),
  p('brooks', 'Dillon Brooks', 'PHX', 'SF', 30, { ppg: 14, rpg: 3.4, apg: 1.8, spg: 0.9, bpg: 0.2 }, 69, true),
  p('luke_kennard', 'Luke Kennard', 'PHX', 'SG', 30, { ppg: 16.2, rpg: 7, apg: 4.6, spg: 1, bpg: 1.2 }, 58, true),
  p('williams_m', 'Mark Williams', 'PHX', 'C', 24, { ppg: 12.7, rpg: 9.7, apg: 1.2, spg: 0.5, bpg: 1.1 }, 52, false),
  p('khaman_maluach', 'Khaman Maluach', 'PHX', 'C', 19, { ppg: 12.9, rpg: 5.5, apg: 3.7, spg: 0.8, bpg: 0.9 }, 46, false),
  p('ryan_dunn', 'Ryan Dunn', 'PHX', 'PF', 23, { ppg: 11.8, rpg: 5, apg: 3.4, spg: 0.8, bpg: 0.8 }, 42, false),
  p('goodwin', 'Jordan Goodwin', 'PHX', 'PG', 27, { ppg: 8.2, rpg: 3.5, apg: 2.8, spg: 0.9, bpg: 0.2 }, 30, false),
  p('gillespie', 'Collin Gillespie', 'PHX', 'PG', 27, { ppg: 5.5, rpg: 2, apg: 2.5, spg: 0.5, bpg: 0.1 }, 22, false),

  // Portland Trail Blazers
  p('morant', 'Ja Morant', 'POR', 'PG', 26, { ppg: 23.2, rpg: 4.1, apg: 7.3, spg: 1, bpg: 0.3 }, 84, true, true),
  p('holiday', 'Jrue Holiday', 'POR', 'SG', 36, { ppg: 12.5, rpg: 5.4, apg: 6.1, spg: 1.2, bpg: 0.4 }, 62, true),
  p('avdija', 'Deni Avdija', 'POR', 'SF', 25, { ppg: 16.2, rpg: 7.2, apg: 3.8, spg: 0.8, bpg: 0.5 }, 63, true),
  p('lillard', 'Damian Lillard', 'POR', 'PG', 35, { ppg: 24.3, rpg: 4.4, apg: 7, spg: 1, bpg: 0.2 }, 78, true),
  p('williams_iii', 'Robert Williams III', 'POR', 'C', 28, { ppg: 16.2, rpg: 7, apg: 4.6, spg: 1, bpg: 1.2 }, 58, true),
  p('thybulle', 'Matisse Thybulle', 'POR', 'SG', 29, { ppg: 5.5, rpg: 2.8, apg: 1.2, spg: 1.5, bpg: 0.5 }, 34, false),
  p('henderson', 'Scoot Henderson', 'POR', 'PG', 22, { ppg: 14.7, rpg: 3.2, apg: 5.4, spg: 0.8, bpg: 0.2 }, 60, false),
  p('shaedon_sharpe', 'Shaedon Sharpe', 'POR', 'SG', 23, { ppg: 18.5, rpg: 4.5, apg: 2.8, spg: 0.8, bpg: 0.3 }, 63, false),
  p('clingan', 'Donovan Clingan', 'POR', 'C', 22, { ppg: 6.5, rpg: 7.8, apg: 1, spg: 0.4, bpg: 1.5 }, 40, false),
  p('branham', 'Blake Wesley', 'POR', 'SG', 23, { ppg: 5.5, rpg: 1.8, apg: 2.5, spg: 0.5, bpg: 0.1 }, 26, false),

  // Sacramento Kings
  p('lavine', 'Zach LaVine', 'SAC', 'SG', 31, { ppg: 23.1, rpg: 4.3, apg: 4, spg: 0.8, bpg: 0.2 }, 72, true),
  p('sabonis', 'Domantas Sabonis', 'SAC', 'C', 30, { ppg: 19.1, rpg: 13.9, apg: 7.8, spg: 0.7, bpg: 0.4 }, 78, true),
  p('deandre_hunter', 'De\'Andre Hunter', 'SAC', 'SF', 28, { ppg: 19.9, rpg: 8.5, apg: 5.7, spg: 1.3, bpg: 1.4 }, 71, true),
  p('monk', 'Malik Monk', 'SAC', 'SG', 28, { ppg: 15.4, rpg: 3.5, apg: 5.1, spg: 0.6, bpg: 0.3 }, 50, true),
  p('murray_k', 'Keegan Murray', 'SAC', 'PF', 25, { ppg: 15.2, rpg: 6, apg: 1.4, spg: 0.8, bpg: 0.6 }, 54, true),
  p('clifford', 'Nique Clifford', 'SAC', 'PG', 24, { ppg: 16, rpg: 6.8, apg: 4.6, spg: 1, bpg: 1.1 }, 57, false),
  p('eubanks', 'Drew Eubanks', 'SAC', 'C', 29, { ppg: 14.6, rpg: 6.2, apg: 4.2, spg: 0.9, bpg: 1 }, 52, false),
  p('mcdermott', 'Doug McDermott', 'SAC', 'SF', 34, { ppg: 8.2, rpg: 2.5, apg: 1, spg: 0.3, bpg: 0.1 }, 28, false),
  p('westbrook', 'Russell Westbrook', 'SAC', 'PG', 37, { ppg: 13.3, rpg: 4.9, apg: 6.1, spg: 1.1, bpg: 0.4 }, 42, false),
  p('achiuwa', 'Precious Achiuwa', 'SAC', 'PF', 26, { ppg: 20.2, rpg: 8.6, apg: 5.8, spg: 1.3, bpg: 1.4 }, 72, false),

  // San Antonio Spurs
  p('fox', 'De\'Aaron Fox', 'SAS', 'PG', 28, { ppg: 23.5, rpg: 4.8, apg: 5.6, spg: 1.5, bpg: 0.3 }, 82, true, true),
  p('vassell', 'Devin Vassell', 'SAS', 'SG', 25, { ppg: 16.3, rpg: 3.9, apg: 2.8, spg: 1, bpg: 0.3 }, 63, true),
  p('harris_t', 'Tobias Harris', 'SAS', 'PF', 33, { ppg: 13.7, rpg: 5.9, apg: 2.5, spg: 0.7, bpg: 0.5 }, 48, true),
  p('harrison_barnes', 'Harrison Barnes', 'SAS', 'PF', 34, { ppg: 20.2, rpg: 8.6, apg: 5.8, spg: 1.3, bpg: 1.4 }, 72, true),
  p('johnson_k', 'Keldon Johnson', 'SAS', 'SF', 26, { ppg: 12.8, rpg: 5.5, apg: 1.8, spg: 0.7, bpg: 0.3 }, 67, true),
  p('kelly_olynyk', 'Kelly Olynyk', 'SAS', 'C', 35, { ppg: 15.1, rpg: 6.5, apg: 4.3, spg: 1, bpg: 1.1 }, 54, false),
  p('wemby', 'Victor Wembanyama', 'SAS', 'C', 22, { ppg: 24.3, rpg: 11, apg: 3.7, spg: 1.1, bpg: 3.8 }, 94, false, true),
  p('harper', 'Dylan Harper', 'SAS', 'PG', 20, { ppg: 9, rpg: 3.8, apg: 2.6, spg: 0.6, bpg: 0.6 }, 75, false),
  p('luke_kornet', 'Luke Kornet', 'SAS', 'C', 30, { ppg: 11.2, rpg: 4.8, apg: 3.2, spg: 0.7, bpg: 0.8 }, 40, false),
  p('castle', 'Stephon Castle', 'SAS', 'PG', 21, { ppg: 14.5, rpg: 3.8, apg: 4.2, spg: 0.9, bpg: 0.3 }, 72, false),

  // Utah Jazz
  p('markkanen', 'Lauri Markkanen', 'UTA', 'PF', 29, { ppg: 19, rpg: 5.9, apg: 1.5, spg: 0.6, bpg: 0.3 }, 64, true, true),
  p('jackson', 'Jaren Jackson Jr.', 'UTA', 'PF', 26, { ppg: 22.2, rpg: 5.6, apg: 2, spg: 1.2, bpg: 1.5 }, 82, true),
  p('jusuf_nurkic', 'Jusuf Nurkic', 'UTA', 'C', 31, { ppg: 18.8, rpg: 8, apg: 5.4, spg: 1.2, bpg: 1.3 }, 67, true),
  p('bailey', 'Ace Bailey', 'UTA', 'SF', 19, { ppg: 18.8, rpg: 8, apg: 5.4, spg: 1.2, bpg: 1.3 }, 67, true),
  p('okogie', 'Josh Okogie', 'UTA', 'SG', 27, { ppg: 6.5, rpg: 3.2, apg: 1.2, spg: 1, bpg: 0.3 }, 32, true),
  p('konchar', 'John Konchar', 'UTA', 'SF', 30, { ppg: 6.5, rpg: 4.8, apg: 1.5, spg: 0.8, bpg: 0.4 }, 30, false),
  p('cody_williams', 'Cody Williams', 'UTA', 'SF', 21, { ppg: 12.9, rpg: 5.5, apg: 3.7, spg: 0.8, bpg: 0.9 }, 46, false),
  p('george_k', 'Keyonte George', 'UTA', 'PG', 22, { ppg: 16.8, rpg: 3.2, apg: 5.2, spg: 0.7, bpg: 0.1 }, 66, false),
  p('kevin_love', 'Kevin Love', 'UTA', 'PF', 37, { ppg: 9.5, rpg: 4.1, apg: 2.7, spg: 0.6, bpg: 0.7 }, 34, false),
  p('svi_mykhailiuk', 'Svi Mykhailiuk', 'UTA', 'SG', 29, { ppg: 8.4, rpg: 3.6, apg: 2.4, spg: 0.5, bpg: 0.6 }, 30, false),

];

export const ALL_PLAYERS: TradePlayer[] = ROSTER;

const TRADE_POOL_MIN_VALUE = 22;

export function getPlayersByTeam(teamId: string): TradePlayer[] {
  return ALL_PLAYERS.filter((pl) => pl.teamId === teamId);
}

export function getTeamTradePool(teamId: string): TradePlayer[] {
  const roster = getPlayersByTeam(teamId);
  const starters = roster
    .filter((pl) => pl.isStarter)
    .sort((a, b) => b.tradeValue - a.tradeValue)
    .slice(0, 5);

  const starterIds = new Set(starters.map((pl) => pl.id));
  const rotation = roster
    .filter((pl) => !starterIds.has(pl.id) && pl.tradeValue >= TRADE_POOL_MIN_VALUE)
    .sort((a, b) => b.tradeValue - a.tradeValue);

  let bench = rotation.slice(0, 5);
  if (starters.length + bench.length < 10) {
    const extra = roster
      .filter((pl) => !starterIds.has(pl.id) && !bench.some((b) => b.id === pl.id))
      .sort((a, b) => b.tradeValue - a.tradeValue);
    bench = [...bench, ...extra].slice(0, 10 - starters.length);
  }

  return [...starters, ...bench].slice(0, 10);
}

export function getPlayerById(id: string): TradePlayer | undefined {
  return ALL_PLAYERS.find((pl) => pl.id === id);
}

export function getLowValueStarters(): TradePlayer[] {
  return ALL_PLAYERS.filter((pl) => pl.tradeValue >= 18 && pl.tradeValue <= 32);
}
