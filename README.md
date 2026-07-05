# NBA Higher or Lower

A fast, addictive NBA stats guessing game. Compare two players side-by-side — one stat is revealed, one is hidden. Guess **Higher** or **Lower** and build your streak.

Built for NBA Twitter/X: screenshot your streak and challenge friends.

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Game Modes

- Career Points, Assists, Rebounds, Blocks, Steals
- Championships, All-Star Appearances, MVP Awards
- Draft Pick, Height, Age
- Career Earnings, Instagram Followers
- Random Mode (new category every round)

## Build

```bash
npm run build
npm start
```

## Leaderboard

1. On the home page, type your X username in the leaderboard card (no login or linking required)
2. Play a game — your best streak is submitted automatically when a run ends
3. The global leaderboard appears right on the home page

Leaderboard data is stored in `data/leaderboard.json` locally. For persistent global storage on Vercel, set:

```
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```


## Data

Player stats live in [`data/players.ts`](data/players.ts). Update numbers there — the game engine reads from that file only.

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS v4
- localStorage for best streak (no backend)
