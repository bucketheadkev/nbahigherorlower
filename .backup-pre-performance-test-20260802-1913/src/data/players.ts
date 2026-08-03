import type { Player, Position, Decade } from '../types';

function p(
  id: string,
  name: string,
  team: string,
  teams: string[],
  decade: Decade,
  primaryPosition: Position,
  positions: Position[],
  stats: { ppg: number; rpg: number; apg: number; spg: number; bpg: number },
  active = false,
): Player {
  return { id, name, team, teams, decade, primaryPosition, positions, stats, active };
}

export const PLAYERS: Player[] = [
  // 1960s Legends
  p('wilt', 'Wilt Chamberlain', 'GSW', ['GSW', 'PHI', 'LAL'], '1960s', 'C', ['C'], { ppg: 37.6, rpg: 27.0, apg: 2.5, spg: 0.0, bpg: 0.0 }),
  p('russell', 'Bill Russell', 'BOS', ['BOS'], '1960s', 'C', ['C'], { ppg: 16.6, rpg: 22.5, apg: 4.3, spg: 0.0, bpg: 0.0 }),
  p('west', 'Jerry West', 'LAL', ['LAL'], '1960s', 'SG', ['PG', 'SG'], { ppg: 31.3, rpg: 7.9, apg: 9.7, spg: 0.0, bpg: 0.0 }),
  p('oscar', 'Oscar Robertson', 'CIN', ['CIN', 'MIL'], '1960s', 'PG', ['PG'], { ppg: 30.8, rpg: 12.5, apg: 11.4, spg: 0.0, bpg: 0.0 }),
  p('baylor', 'Elgin Baylor', 'LAL', ['LAL'], '1960s', 'SF', ['SF', 'PF'], { ppg: 34.8, rpg: 14.8, apg: 5.6, spg: 0.0, bpg: 0.0 }),
  p('havlicek', 'John Havlicek', 'BOS', ['BOS'], '1960s', 'SF', ['SG', 'SF'], { ppg: 28.9, rpg: 9.0, apg: 7.5, spg: 0.0, bpg: 0.0 }),
  p('barry', 'Rick Barry', 'GSW', ['GSW', 'HOU'], '1960s', 'SF', ['SF'], { ppg: 35.6, rpg: 9.2, apg: 4.1, spg: 0.0, bpg: 0.0 }),
  p('unseld', 'Wes Unseld', 'WAS', ['WAS'], '1960s', 'C', ['C'], { ppg: 13.8, rpg: 18.2, apg: 2.6, spg: 0.0, bpg: 0.0 }),

  // 1970s Legends
  p('kareem70', 'Kareem Abdul-Jabbar', 'LAL', ['MIL', 'LAL'], '1970s', 'C', ['C'], { ppg: 28.0, rpg: 14.1, apg: 4.8, spg: 1.4, bpg: 3.5 }),
  p('drj', 'Julius Erving', 'PHI', ['PHI'], '1970s', 'SF', ['SF'], { ppg: 27.4, rpg: 10.7, apg: 5.0, spg: 2.2, bpg: 1.9 }),
  p('gervin', 'George Gervin', 'SAS', ['SAS'], '1970s', 'SG', ['SG'], { ppg: 33.1, rpg: 5.2, apg: 2.6, spg: 1.2, bpg: 1.0 }),
  p('malone_moses', 'Moses Malone', 'HOU', ['HOU', 'PHI'], '1970s', 'C', ['C', 'PF'], { ppg: 25.8, rpg: 14.5, apg: 1.8, spg: 0.9, bpg: 1.3 }),
  p('frazier', 'Walt Frazier', 'NYK', ['NYK'], '1970s', 'PG', ['PG'], { ppg: 21.7, rpg: 7.3, apg: 8.2, spg: 1.9, bpg: 0.2 }),
  p('cowens', 'Dave Cowens', 'BOS', ['BOS'], '1970s', 'C', ['C', 'PF'], { ppg: 20.5, rpg: 16.2, apg: 4.1, spg: 1.2, bpg: 0.9 }),
  p('hayes', 'Elvin Hayes', 'WAS', ['WAS', 'HOU'], '1970s', 'PF', ['PF', 'C'], { ppg: 23.2, rpg: 12.5, apg: 1.4, spg: 1.0, bpg: 2.0 }),
  p('maravich', 'Pete Maravich', 'NOP', ['ATL', 'NOP', 'BOS'], '1970s', 'SG', ['SG', 'PG'], { ppg: 31.1, rpg: 5.4, apg: 5.4, spg: 1.5, bpg: 0.2 }),
  p('lanier', 'Bob Lanier', 'DET', ['DET', 'MIL'], '1970s', 'C', ['C'], { ppg: 25.1, rpg: 11.5, apg: 3.4, spg: 0.9, bpg: 1.5 }),
  p('mcadoo', 'Bob McAdoo', 'BUF', ['BUF', 'LAL'], '1970s', 'PF', ['PF', 'C'], { ppg: 34.5, rpg: 14.1, apg: 3.2, spg: 1.2, bpg: 2.1 }),

  // 1980s Legends
  p('magic', 'Magic Johnson', 'LAL', ['LAL'], '1980s', 'PG', ['PG'], { ppg: 23.9, rpg: 7.3, apg: 12.2, spg: 1.7, bpg: 0.5 }),
  p('bird', 'Larry Bird', 'BOS', ['BOS'], '1980s', 'SF', ['SF', 'PF'], { ppg: 28.7, rpg: 10.0, apg: 6.8, spg: 1.7, bpg: 0.9 }),
  p('jordan80', 'Michael Jordan', 'CHI', ['CHI'], '1980s', 'SG', ['SG'], { ppg: 33.2, rpg: 6.3, apg: 5.9, spg: 2.7, bpg: 1.0 }),
  p('hakeem80', 'Hakeem Olajuwon', 'HOU', ['HOU'], '1980s', 'C', ['C'], { ppg: 23.4, rpg: 11.4, apg: 2.9, spg: 1.6, bpg: 3.4 }),
  p('isiah', 'Isiah Thomas', 'DET', ['DET'], '1980s', 'PG', ['PG'], { ppg: 21.3, rpg: 3.6, apg: 10.6, spg: 1.9, bpg: 0.3 }),
  p('malone_karl', 'Karl Malone', 'UTA', ['UTA'], '1980s', 'PF', ['PF'], { ppg: 29.1, rpg: 10.7, apg: 3.2, spg: 1.4, bpg: 0.8 }),
  p('stockton80', 'John Stockton', 'UTA', ['UTA'], '1980s', 'PG', ['PG'], { ppg: 17.2, rpg: 3.4, apg: 13.6, spg: 2.8, bpg: 0.2 }),
  p('ewing', 'Patrick Ewing', 'NYK', ['NYK'], '1980s', 'C', ['C'], { ppg: 24.3, rpg: 11.0, apg: 2.0, spg: 1.0, bpg: 3.5 }),
  p('wilkins', 'Dominique Wilkins', 'ATL', ['ATL'], '1980s', 'SF', ['SF'], { ppg: 30.3, rpg: 7.9, apg: 2.6, spg: 1.4, bpg: 0.6 }),
  p('parish', 'Robert Parish', 'BOS', ['BOS'], '1980s', 'C', ['C'], { ppg: 18.9, rpg: 12.5, apg: 2.1, spg: 0.8, bpg: 2.1 }),
  p('mchale', 'Kevin McHale', 'BOS', ['BOS'], '1980s', 'PF', ['PF', 'C'], { ppg: 26.1, rpg: 9.9, apg: 2.6, spg: 0.5, bpg: 1.5 }),
  p('drexler', 'Clyde Drexler', 'POR', ['POR'], '1980s', 'SG', ['SG', 'SF'], { ppg: 27.2, rpg: 7.7, apg: 6.0, spg: 2.5, bpg: 0.7 }),
  p('english', 'Alex English', 'DEN', ['DEN'], '1980s', 'SF', ['SF'], { ppg: 29.8, rpg: 5.5, apg: 4.0, spg: 1.3, bpg: 0.7 }),
  p('nance', 'Larry Nance', 'PHX', ['PHX', 'CLE'], '1980s', 'PF', ['PF', 'C'], { ppg: 20.1, rpg: 10.6, apg: 3.3, spg: 1.4, bpg: 2.2 }),

  // 1990s Legends
  p('jordan90', 'Michael Jordan', 'CHI', ['CHI'], '1990s', 'SG', ['SG'], { ppg: 30.4, rpg: 6.4, apg: 4.5, spg: 2.3, bpg: 0.5 }),
  p('shaq90', 'Shaquille O\'Neal', 'LAL', ['ORL', 'LAL'], '1990s', 'C', ['C'], { ppg: 29.7, rpg: 13.6, apg: 3.8, spg: 0.6, bpg: 3.0 }),
  p('hakeem90', 'Hakeem Olajuwon', 'HOU', ['HOU'], '1990s', 'C', ['C'], { ppg: 27.8, rpg: 11.1, apg: 3.5, spg: 1.6, bpg: 3.4 }),
  p('malone_karl90', 'Karl Malone', 'UTA', ['UTA'], '1990s', 'PF', ['PF'], { ppg: 27.0, rpg: 10.6, apg: 3.9, spg: 1.4, bpg: 0.8 }),
  p('stockton90', 'John Stockton', 'UTA', ['UTA'], '1990s', 'PG', ['PG'], { ppg: 15.8, rpg: 3.3, apg: 12.3, spg: 2.0, bpg: 0.2 }),
  p('pippen', 'Scottie Pippen', 'CHI', ['CHI'], '1990s', 'SF', ['SF', 'PF'], { ppg: 21.0, rpg: 8.0, apg: 5.4, spg: 2.9, bpg: 0.8 }),
  p('robinson', 'David Robinson', 'SAS', ['SAS'], '1990s', 'C', ['C'], { ppg: 25.6, rpg: 10.8, apg: 3.0, spg: 1.7, bpg: 3.3 }),
  p('barkley', 'Charles Barkley', 'PHX', ['PHI', 'PHX'], '1990s', 'PF', ['PF'], { ppg: 25.6, rpg: 11.7, apg: 4.1, spg: 1.6, bpg: 0.8 }),
  p('ewing90', 'Patrick Ewing', 'NYK', ['NYK'], '1990s', 'C', ['C'], { ppg: 24.5, rpg: 11.2, apg: 2.4, spg: 1.0, bpg: 2.7 }),
  p('miller', 'Reggie Miller', 'IND', ['IND'], '1990s', 'SG', ['SG'], { ppg: 22.6, rpg: 3.3, apg: 3.3, spg: 1.3, bpg: 0.2 }),
  p('payton', 'Gary Payton', 'SEA', ['SEA'], '1990s', 'PG', ['PG'], { ppg: 19.6, rpg: 4.2, apg: 8.2, spg: 2.5, bpg: 0.2 }),
  p('kemp', 'Shawn Kemp', 'SEA', ['SEA'], '1990s', 'PF', ['PF', 'C'], { ppg: 20.5, rpg: 11.0, apg: 2.3, spg: 1.4, bpg: 1.8 }),
  p('hardaway', 'Anfernee Hardaway', 'ORL', ['ORL', 'PHX'], '1990s', 'PG', ['PG', 'SG'], { ppg: 21.7, rpg: 4.7, apg: 7.1, spg: 1.7, bpg: 0.2 }),
  p('hill', 'Grant Hill', 'DET', ['DET'], '1990s', 'SF', ['SF'], { ppg: 25.8, rpg: 9.7, apg: 6.8, spg: 1.4, bpg: 0.6 }),
  p('stoudamire', 'Damon Stoudamire', 'TOR', ['TOR', 'POR'], '1990s', 'PG', ['PG'], { ppg: 19.0, rpg: 4.0, apg: 9.3, spg: 1.4, bpg: 0.2 }),
  p('iverson90', 'Allen Iverson', 'PHI', ['PHI'], '1990s', 'SG', ['PG', 'SG'], { ppg: 26.4, rpg: 4.4, apg: 4.4, spg: 2.0, bpg: 0.2 }),

  // 2000s Legends
  p('kobe', 'Kobe Bryant', 'LAL', ['LAL'], '2000s', 'SG', ['SG'], { ppg: 28.3, rpg: 5.4, apg: 5.1, spg: 1.5, bpg: 0.5 }),
  p('shaq00', 'Shaquille O\'Neal', 'LAL', ['LAL', 'MIA'], '2000s', 'C', ['C'], { ppg: 27.2, rpg: 11.1, apg: 3.1, spg: 0.6, bpg: 2.1 }),
  p('duncan', 'Tim Duncan', 'SAS', ['SAS'], '2000s', 'PF', ['PF', 'C'], { ppg: 22.1, rpg: 12.0, apg: 3.0, spg: 0.8, bpg: 2.3 }),
  p('garnett', 'Kevin Garnett', 'MIN', ['MIN', 'BOS'], '2000s', 'PF', ['PF', 'C'], { ppg: 22.4, rpg: 12.8, apg: 5.0, spg: 1.4, bpg: 1.7 }),
  p('iverson00', 'Allen Iverson', 'PHI', ['PHI', 'DEN'], '2000s', 'SG', ['PG', 'SG'], { ppg: 31.4, rpg: 3.8, apg: 7.4, spg: 2.1, bpg: 0.2 }),
  p('mcgrady', 'Tracy McGrady', 'ORL', ['ORL', 'HOU'], '2000s', 'SG', ['SG', 'SF'], { ppg: 28.1, rpg: 7.1, apg: 5.4, spg: 1.2, bpg: 0.8 }),
  p('dirk', 'Dirk Nowitzki', 'DAL', ['DAL'], '2000s', 'PF', ['PF', 'C'], { ppg: 25.9, rpg: 8.4, apg: 2.4, spg: 0.8, bpg: 0.8 }),
  p('nash', 'Steve Nash', 'PHX', ['PHX', 'DAL'], '2000s', 'PG', ['PG'], { ppg: 18.6, rpg: 3.5, apg: 11.5, spg: 0.8, bpg: 0.1 }),
  p('wade', 'Dwyane Wade', 'MIA', ['MIA'], '2000s', 'SG', ['SG'], { ppg: 27.2, rpg: 5.0, apg: 6.7, spg: 1.9, bpg: 1.0 }),
  p('pierce', 'Paul Pierce', 'BOS', ['BOS'], '2000s', 'SF', ['SF', 'SG'], { ppg: 25.8, rpg: 6.9, apg: 4.4, spg: 1.5, bpg: 0.5 }),
  p('carter', 'Vince Carter', 'TOR', ['TOR', 'NJN'], '2000s', 'SG', ['SG', 'SF'], { ppg: 27.6, rpg: 5.5, apg: 4.1, spg: 1.5, bpg: 0.6 }),
  p('yao', 'Yao Ming', 'HOU', ['HOU'], '2000s', 'C', ['C'], { ppg: 22.3, rpg: 10.4, apg: 1.6, spg: 0.5, bpg: 2.0 }),
  p('bosh', 'Chris Bosh', 'TOR', ['TOR', 'MIA'], '2000s', 'PF', ['PF', 'C'], { ppg: 24.0, rpg: 10.8, apg: 2.4, spg: 0.6, bpg: 1.0 }),
  p('pau', 'Pau Gasol', 'MEM', ['MEM', 'LAL'], '2000s', 'PF', ['PF', 'C'], { ppg: 20.8, rpg: 11.4, apg: 3.5, spg: 0.7, bpg: 2.1 }),
  p('melo', 'Carmelo Anthony', 'DEN', ['DEN', 'NYK'], '2000s', 'SF', ['SF', 'PF'], { ppg: 28.7, rpg: 6.2, apg: 3.0, spg: 1.0, bpg: 0.5 }),
  p('parker', 'Tony Parker', 'SAS', ['SAS'], '2000s', 'PG', ['PG'], { ppg: 18.9, rpg: 3.1, apg: 6.9, spg: 0.8, bpg: 0.1 }),
  p('billups', 'Chauncey Billups', 'DET', ['DET', 'DEN'], '2000s', 'PG', ['PG'], { ppg: 19.5, rpg: 3.1, apg: 6.6, spg: 1.0, bpg: 0.2 }),
  p('marion', 'Shawn Marion', 'PHX', ['PHX', 'MIA'], '2000s', 'SF', ['SF', 'PF'], { ppg: 21.3, rpg: 11.3, apg: 2.0, spg: 2.0, bpg: 1.5 }),

  // 2010s Legends
  p('lebron10', 'LeBron James', 'MIA', ['CLE', 'MIA'], '2010s', 'SF', ['SF', 'PF'], { ppg: 27.1, rpg: 7.9, apg: 7.4, spg: 1.6, bpg: 0.7 }),
  p('curry10', 'Stephen Curry', 'GSW', ['GSW'], '2010s', 'PG', ['PG'], { ppg: 27.3, rpg: 4.4, apg: 6.6, spg: 1.6, bpg: 0.2 }),
  p('kd10', 'Kevin Durant', 'OKC', ['OKC', 'GSW'], '2010s', 'SF', ['SF', 'PF'], { ppg: 28.8, rpg: 7.3, apg: 4.3, spg: 1.1, bpg: 1.2 }),
  p('harden10', 'James Harden', 'HOU', ['OKC', 'HOU'], '2010s', 'SG', ['SG', 'PG'], { ppg: 30.4, rpg: 6.1, apg: 7.5, spg: 1.6, bpg: 0.5 }),
  p('kawhi10', 'Kawhi Leonard', 'SAS', ['SAS', 'TOR'], '2010s', 'SF', ['SF'], { ppg: 25.5, rpg: 6.4, apg: 3.3, spg: 1.8, bpg: 0.7 }),
  p('cp3', 'Chris Paul', 'LAC', ['NOH', 'LAC', 'HOU'], '2010s', 'PG', ['PG'], { ppg: 18.9, rpg: 4.4, apg: 10.2, spg: 2.4, bpg: 0.1 }),
  p('westbrook10', 'Russell Westbrook', 'OKC', ['OKC'], '2010s', 'PG', ['PG'], { ppg: 28.1, rpg: 8.6, apg: 8.8, spg: 1.7, bpg: 0.3 }),
  p('davis10', 'Anthony Davis', 'NOP', ['NOP', 'LAL'], '2010s', 'PF', ['PF', 'C'], { ppg: 27.7, rpg: 11.1, apg: 2.3, spg: 1.5, bpg: 2.4 }),
  p('draymond', 'Draymond Green', 'GSW', ['GSW'], '2010s', 'PF', ['PF', 'C'], { ppg: 11.0, rpg: 7.9, apg: 7.4, spg: 1.4, bpg: 1.3 }),
  p('kyrie10', 'Kyrie Irving', 'CLE', ['CLE', 'BOS'], '2010s', 'PG', ['PG', 'SG'], { ppg: 25.2, rpg: 3.2, apg: 5.8, spg: 1.1, bpg: 0.3 }),
  p('dame', 'Damian Lillard', 'POR', ['POR'], '2010s', 'PG', ['PG'], { ppg: 27.8, rpg: 4.2, apg: 6.4, spg: 1.0, bpg: 0.3 }),
  p('kobe10', 'Kobe Bryant', 'LAL', ['LAL'], '2010s', 'SG', ['SG'], { ppg: 27.3, rpg: 5.6, apg: 5.0, spg: 1.4, bpg: 0.3 }),
  p('howard10', 'Dwight Howard', 'ORL', ['ORL', 'LAL'], '2010s', 'C', ['C'], { ppg: 22.9, rpg: 13.2, apg: 1.4, spg: 1.0, bpg: 2.4 }),
  p('paul_george10', 'Paul George', 'IND', ['IND', 'OKC'], '2010s', 'SF', ['SF', 'SG'], { ppg: 23.7, rpg: 6.6, apg: 3.3, spg: 1.4, bpg: 0.4 }),
  p('butler10', 'Jimmy Butler', 'CHI', ['CHI', 'MIN', 'PHI'], '2010s', 'SF', ['SF', 'SG'], { ppg: 22.2, rpg: 5.9, apg: 5.3, spg: 1.8, bpg: 0.5 }),

  // 2020s (recent peak / active)
  p('jokic', 'Nikola Jokić', 'DEN', ['DEN'], '2020s', 'C', ['C'], { ppg: 27.1, rpg: 12.5, apg: 9.8, spg: 1.3, bpg: 0.7 }, true),
  p('giannis', 'Giannis Antetokounmpo', 'MIL', ['MIL'], '2020s', 'PF', ['PF', 'C'], { ppg: 31.1, rpg: 11.8, apg: 5.7, spg: 1.0, bpg: 1.2 }, true),
  p('luka', 'Luka Dončić', 'DAL', ['DAL'], '2020s', 'PG', ['PG', 'SG'], { ppg: 32.4, rpg: 8.6, apg: 9.1, spg: 1.4, bpg: 0.5 }, true),
  p('embiid', 'Joel Embiid', 'PHI', ['PHI'], '2020s', 'C', ['C'], { ppg: 33.1, rpg: 10.2, apg: 4.2, spg: 1.0, bpg: 1.7 }, true),
  p('tatum', 'Jayson Tatum', 'BOS', ['BOS'], '2020s', 'SF', ['SF', 'PF'], { ppg: 30.1, rpg: 8.8, apg: 4.6, spg: 1.0, bpg: 0.6 }, true),
  p('curry20', 'Stephen Curry', 'GSW', ['GSW'], '2020s', 'PG', ['PG'], { ppg: 29.4, rpg: 5.1, apg: 6.3, spg: 0.9, bpg: 0.4 }, true),
  p('kd20', 'Kevin Durant', 'PHX', ['BKN', 'PHX'], '2020s', 'SF', ['SF', 'PF'], { ppg: 29.1, rpg: 7.0, apg: 5.5, spg: 0.8, bpg: 1.2 }, true),
  p('lebron20', 'LeBron James', 'LAL', ['LAL'], '2020s', 'SF', ['SF', 'PF'], { ppg: 27.0, rpg: 7.5, apg: 7.9, spg: 1.1, bpg: 0.6 }, true),
  p('sga', 'Shai Gilgeous-Alexander', 'OKC', ['OKC'], '2020s', 'PG', ['PG', 'SG'], { ppg: 31.4, rpg: 5.5, apg: 6.4, spg: 1.6, bpg: 1.0 }, true),
  p('booker', 'Devin Booker', 'PHX', ['PHX'], '2020s', 'SG', ['SG'], { ppg: 27.8, rpg: 4.5, apg: 6.9, spg: 0.9, bpg: 0.3 }, true),
  p('ant', 'Anthony Edwards', 'MIN', ['MIN'], '2020s', 'SG', ['SG', 'SF'], { ppg: 27.6, rpg: 5.7, apg: 5.5, spg: 1.2, bpg: 0.5 }, true),
  p('haliburton', 'Tyrese Haliburton', 'IND', ['SAC', 'IND'], '2020s', 'PG', ['PG'], { ppg: 20.1, rpg: 3.9, apg: 10.9, spg: 1.2, bpg: 0.7 }, true),
  p('bam', 'Bam Adebayo', 'MIA', ['MIA'], '2020s', 'C', ['C', 'PF'], { ppg: 20.4, rpg: 9.2, apg: 5.0, spg: 1.2, bpg: 0.9 }, true),
  p('ja', 'Ja Morant', 'MEM', ['MEM'], '2020s', 'PG', ['PG'], { ppg: 27.1, rpg: 5.9, apg: 8.2, spg: 1.0, bpg: 0.3 }, true),
  p('brunson', 'Jalen Brunson', 'NYK', ['DAL', 'NYK'], '2020s', 'PG', ['PG'], { ppg: 28.7, rpg: 3.6, apg: 6.7, spg: 0.9, bpg: 0.2 }, true),
  p('fox', 'De\'Aaron Fox', 'SAC', ['SAC'], '2020s', 'PG', ['PG'], { ppg: 26.6, rpg: 4.6, apg: 5.6, spg: 1.5, bpg: 0.4 }, true),
  p('mitchell', 'Donovan Mitchell', 'CLE', ['UTA', 'CLE'], '2020s', 'SG', ['SG'], { ppg: 28.3, rpg: 4.4, apg: 5.1, spg: 1.5, bpg: 0.4 }, true),
  p('zion', 'Zion Williamson', 'NOP', ['NOP'], '2020s', 'PF', ['PF'], { ppg: 26.0, rpg: 7.0, apg: 4.6, spg: 1.1, bpg: 0.6 }, true),
  p('kawhi20', 'Kawhi Leonard', 'LAC', ['LAC'], '2020s', 'SF', ['SF'], { ppg: 25.6, rpg: 6.1, apg: 5.2, spg: 1.6, bpg: 0.4 }, true),
  p('harden20', 'James Harden', 'LAC', ['HOU', 'BKN', 'PHI', 'LAC'], '2020s', 'SG', ['SG', 'PG'], { ppg: 24.1, rpg: 5.6, apg: 8.5, spg: 1.1, bpg: 0.5 }, true),
  p('ad20', 'Anthony Davis', 'LAL', ['LAL'], '2020s', 'PF', ['PF', 'C'], { ppg: 24.7, rpg: 12.6, apg: 3.5, spg: 1.2, bpg: 2.3 }, true),
  p('wemby', 'Victor Wembanyama', 'SAS', ['SAS'], '2020s', 'C', ['C', 'PF'], { ppg: 21.4, rpg: 10.6, apg: 3.9, spg: 1.1, bpg: 3.6 }, true),
  p('chet', 'Chet Holmgren', 'OKC', ['OKC'], '2020s', 'C', ['C', 'PF'], { ppg: 16.5, rpg: 7.9, apg: 2.4, spg: 0.6, bpg: 2.4 }, true),
  p('maxey', 'Tyrese Maxey', 'PHI', ['PHI'], '2020s', 'PG', ['PG', 'SG'], { ppg: 26.8, rpg: 3.3, apg: 6.1, spg: 1.0, bpg: 0.5 }, true),
  p('lamelo', 'LaMelo Ball', 'CHA', ['CHA'], '2020s', 'PG', ['PG'], { ppg: 23.9, rpg: 6.4, apg: 8.0, spg: 1.8, bpg: 0.2 }, true),
  p('trae', 'Trae Young', 'ATL', ['ATL'], '2020s', 'PG', ['PG'], { ppg: 26.4, rpg: 3.1, apg: 10.8, spg: 1.1, bpg: 0.2 }, true),
  p('siakam', 'Pascal Siakam', 'IND', ['TOR', 'IND'], '2020s', 'PF', ['PF', 'SF'], { ppg: 22.2, rpg: 7.8, apg: 4.9, spg: 0.9, bpg: 0.5 }, true),
  p('markkanen', 'Lauri Markkanen', 'UTA', ['CHI', 'CLE', 'UTA'], '2020s', 'PF', ['PF', 'SF'], { ppg: 25.6, rpg: 8.6, apg: 1.9, spg: 0.6, bpg: 0.6 }, true),
  p('holiday', 'Jrue Holiday', 'BOS', ['NOP', 'MIL', 'BOS'], '2020s', 'PG', ['PG', 'SG'], { ppg: 17.1, rpg: 4.1, apg: 6.4, spg: 1.2, bpg: 0.4 }, true),
  p('murray', 'Jamal Murray', 'DEN', ['DEN'], '2020s', 'PG', ['PG', 'SG'], { ppg: 21.4, rpg: 4.0, apg: 6.5, spg: 1.0, bpg: 0.3 }, true),

  // Additional franchise depth for draft variety
  p('kidd', 'Jason Kidd', 'DAL', ['PHX', 'NJN', 'DAL'], '2000s', 'PG', ['PG'], { ppg: 14.6, rpg: 7.3, apg: 9.9, spg: 2.0, bpg: 0.3 }),
  p('allen_ray', 'Ray Allen', 'BOS', ['MIL', 'SEA', 'BOS', 'MIA'], '2000s', 'SG', ['SG'], { ppg: 21.4, rpg: 4.5, apg: 3.5, spg: 1.2, bpg: 0.2 }),
  p('artest', 'Metta World Peace', 'LAL', ['CHI', 'IND', 'SAC', 'LAL'], '2000s', 'SF', ['SF'], { ppg: 18.3, rpg: 5.3, apg: 3.2, spg: 2.0, bpg: 0.5 }),
  p('wallace', 'Ben Wallace', 'DET', ['WAS', 'ORL', 'DET', 'CHI'], '2000s', 'C', ['C', 'PF'], { ppg: 9.6, rpg: 12.3, apg: 1.7, spg: 1.3, bpg: 2.2 }),
  p('mutombo', 'Dikembe Mutombo', 'ATL', ['DEN', 'ATL', 'PHI', 'NJN', 'NYK', 'HOU'], '1990s', 'C', ['C'], { ppg: 11.8, rpg: 12.5, apg: 1.0, spg: 0.5, bpg: 3.9 }),
  p('stoudemire00', 'Amar\'e Stoudemire', 'PHX', ['PHX', 'NYK'], '2000s', 'PF', ['PF', 'C'], { ppg: 26.0, rpg: 9.6, apg: 1.5, spg: 0.7, bpg: 1.5 }),
  p('randolph', 'Zach Randolph', 'MEM', ['POR', 'NYK', 'LAC', 'MEM'], '2000s', 'PF', ['PF', 'C'], { ppg: 20.8, rpg: 10.1, apg: 2.2, spg: 0.8, bpg: 0.3 }),
  p('gasol_marc', 'Marc Gasol', 'MEM', ['MEM', 'TOR'], '2010s', 'C', ['C'], { ppg: 17.2, rpg: 7.9, apg: 4.4, spg: 1.0, bpg: 1.5 }),
  p('conley', 'Mike Conley', 'MEM', ['MEM', 'UTA', 'MIN'], '2010s', 'PG', ['PG'], { ppg: 18.4, rpg: 3.1, apg: 6.4, spg: 1.3, bpg: 0.2 }),
  p('lowry', 'Kyle Lowry', 'TOR', ['MEM', 'HOU', 'TOR', 'MIA'], '2010s', 'PG', ['PG'], { ppg: 17.7, rpg: 4.9, apg: 7.3, spg: 1.4, bpg: 0.2 }),
  p('derozan', 'DeMar DeRozan', 'CHI', ['TOR', 'SAS', 'CHI', 'SAC'], '2010s', 'SG', ['SG', 'SF'], { ppg: 27.9, rpg: 5.2, apg: 5.0, spg: 0.9, bpg: 0.3 }),
  p('blake', 'Blake Griffin', 'LAC', ['LAC', 'DET', 'BKN'], '2010s', 'PF', ['PF'], { ppg: 24.1, rpg: 9.5, apg: 4.9, spg: 0.8, bpg: 0.6 }),
  p('horford', 'Al Horford', 'BOS', ['ATL', 'BOS', 'PHI'], '2010s', 'C', ['C', 'PF'], { ppg: 14.3, rpg: 8.2, apg: 3.4, spg: 0.8, bpg: 1.2 }),
  p('horford20', 'Al Horford', 'BOS', ['BOS', 'PHI', 'GSW'], '2020s', 'C', ['C', 'PF'], { ppg: 10.2, rpg: 7.0, apg: 3.3, spg: 0.7, bpg: 1.2 }, true),
  p('rondo', 'Rajon Rondo', 'BOS', ['BOS', 'DAL', 'SAC', 'CHI', 'NOP', 'LAL'], '2010s', 'PG', ['PG'], { ppg: 11.6, rpg: 4.7, apg: 11.1, spg: 2.0, bpg: 0.2 }),
  p('rose', 'Derrick Rose', 'CHI', ['CHI', 'NYK', 'MIN', 'DET'], '2010s', 'PG', ['PG'], { ppg: 25.0, rpg: 4.1, apg: 7.7, spg: 1.0, bpg: 0.6 }),
  p('wall', 'John Wall', 'WAS', ['WAS', 'LAC'], '2010s', 'PG', ['PG'], { ppg: 23.1, rpg: 4.5, apg: 10.7, spg: 1.7, bpg: 0.8 }),
  p('beal', 'Bradley Beal', 'WAS', ['WAS', 'PHX'], '2010s', 'SG', ['SG'], { ppg: 25.6, rpg: 4.2, apg: 5.5, spg: 1.1, bpg: 0.4 }),
  p('beal20', 'Bradley Beal', 'PHX', ['WAS', 'PHX'], '2020s', 'SG', ['SG'], { ppg: 18.2, rpg: 4.4, apg: 5.0, spg: 0.9, bpg: 0.5 }, true),
  p('towns', 'Karl-Anthony Towns', 'MIN', ['MIN', 'NYK'], '2020s', 'C', ['C', 'PF'], { ppg: 24.8, rpg: 10.7, apg: 3.2, spg: 0.7, bpg: 1.2 }, true),
  p('rudy', 'Rudy Gobert', 'MIN', ['UTA', 'MIN'], '2020s', 'C', ['C'], { ppg: 14.7, rpg: 12.9, apg: 1.3, spg: 0.7, bpg: 2.1 }, true),
  p('porzingis', 'Kristaps Porziņģis', 'BOS', ['NYK', 'DAL', 'WAS', 'BOS'], '2020s', 'C', ['C', 'PF'], { ppg: 20.1, rpg: 6.7, apg: 1.9, spg: 0.7, bpg: 1.9 }, true),
  p('cj', 'CJ McCollum', 'NOP', ['POR', 'NOP'], '2020s', 'SG', ['SG'], { ppg: 22.7, rpg: 4.1, apg: 4.7, spg: 0.9, bpg: 0.3 }, true),
  p('ingram', 'Brandon Ingram', 'NOP', ['LAL', 'NOP', 'TOR'], '2020s', 'SF', ['SF'], { ppg: 23.6, rpg: 5.8, apg: 5.2, spg: 0.8, bpg: 0.6 }, true),
  p('garland', 'Darius Garland', 'CLE', ['CLE'], '2020s', 'PG', ['PG'], { ppg: 21.6, rpg: 2.7, apg: 8.0, spg: 1.0, bpg: 0.1 }, true),
  p('brown', 'Jaylen Brown', 'BOS', ['BOS'], '2020s', 'SG', ['SG', 'SF'], { ppg: 26.6, rpg: 6.9, apg: 3.5, spg: 1.1, bpg: 0.5 }, true),
  p('reaves', 'Austin Reaves', 'LAL', ['LAL'], '2020s', 'SG', ['SG'], { ppg: 15.9, rpg: 4.3, apg: 5.5, spg: 0.8, bpg: 0.1 }, true),
  p('ayton', 'Deandre Ayton', 'POR', ['PHX', 'POR'], '2020s', 'C', ['C'], { ppg: 16.7, rpg: 11.1, apg: 1.6, spg: 0.7, bpg: 0.9 }, true),
  p('lavine', 'Zach LaVine', 'CHI', ['MIN', 'CHI', 'SAC'], '2020s', 'SG', ['SG', 'SF'], { ppg: 25.5, rpg: 4.8, apg: 4.2, spg: 0.9, bpg: 0.3 }, true),
  p('vucevic', 'Nikola Vučević', 'CHI', ['ORL', 'NOP', 'CHI'], '2020s', 'C', ['C'], { ppg: 20.0, rpg: 10.5, apg: 3.2, spg: 0.7, bpg: 0.7 }, true),
  p('dejounte', 'Dejounte Murray', 'NOP', ['SAS', 'ATL', 'NOP'], '2020s', 'PG', ['PG'], { ppg: 20.5, rpg: 5.3, apg: 6.1, spg: 1.4, bpg: 0.3 }, true),
  p('capela', 'Clint Capela', 'ATL', ['HOU', 'ATL'], '2020s', 'C', ['C'], { ppg: 15.2, rpg: 14.3, apg: 1.3, spg: 0.7, bpg: 2.0 }, true),
  p('turner', 'Myles Turner', 'IND', ['IND'], '2020s', 'C', ['C'], { ppg: 17.1, rpg: 6.9, apg: 1.3, spg: 0.7, bpg: 2.3 }, true),
  p('sabonis', 'Domantas Sabonis', 'SAC', ['OKC', 'IND', 'SAC'], '2020s', 'PF', ['PF', 'C'], { ppg: 19.4, rpg: 12.1, apg: 7.3, spg: 0.8, bpg: 0.4 }, true),
  p('bridges_m', 'Mikal Bridges', 'NYK', ['PHX', 'BKN', 'NYK'], '2020s', 'SF', ['SF', 'SG'], { ppg: 17.6, rpg: 3.2, apg: 3.7, spg: 1.0, bpg: 0.5 }, true),
  p('poeltl', 'Jakob Poeltl', 'TOR', ['SAS', 'TOR'], '2020s', 'C', ['C'], { ppg: 11.1, rpg: 8.6, apg: 2.1, spg: 0.5, bpg: 1.4 }, true),
  p('anunoby', 'OG Anunoby', 'NYK', ['TOR', 'NYK'], '2020s', 'SF', ['SF', 'PF'], { ppg: 16.2, rpg: 4.8, apg: 2.0, spg: 1.4, bpg: 0.5 }, true),
  p('cade', 'Cade Cunningham', 'DET', ['DET'], '2020s', 'PG', ['PG', 'SG'], { ppg: 22.7, rpg: 4.3, apg: 7.9, spg: 0.9, bpg: 0.8 }, true),
  p('scottie', 'Scottie Barnes', 'TOR', ['TOR'], '2020s', 'SF', ['SF', 'PF'], { ppg: 19.3, rpg: 7.7, apg: 5.8, spg: 1.1, bpg: 1.0 }, true),
  p('paolo', 'Paolo Banchero', 'ORL', ['ORL'], '2020s', 'PF', ['PF', 'SF'], { ppg: 22.6, rpg: 6.9, apg: 5.4, spg: 0.9, bpg: 0.5 }, true),
  p('franz', 'Franz Wagner', 'ORL', ['ORL'], '2020s', 'SF', ['SF', 'PF'], { ppg: 19.7, rpg: 5.3, apg: 3.7, spg: 1.1, bpg: 0.4 }, true),
  p('mobley', 'Evan Mobley', 'CLE', ['CLE'], '2020s', 'PF', ['PF', 'C'], { ppg: 16.0, rpg: 9.0, apg: 2.8, spg: 0.8, bpg: 1.5 }, true),
];

export function getAvailablePlayers(usedIds: Set<string>): Player[] {
  return PLAYERS.filter((player) => !usedIds.has(player.id));
}

export function getPlayerById(id: string): Player | undefined {
  return PLAYERS.find((p) => p.id === id);
}

export function normalizeTeamId(team: string): string {
  const aliases: Record<string, string> = {
    CIN: 'BOS',
    BUF: 'LAC',
    SEA: 'OKC',
    NJN: 'BKN',
    NOH: 'NOP',
    CHO: 'CHA',
  };
  return aliases[team] ?? team;
}

export function playerMatchesTeam(player: Player, teamId: string): boolean {
  const normalized = normalizeTeamId(teamId);
  return player.teams.some((t) => normalizeTeamId(t) === normalized) || normalizeTeamId(player.team) === normalized;
}
