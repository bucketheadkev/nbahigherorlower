# Windows → Mac development workflow

**Windows PC** is the primary development machine (code, UI, localhost, commits, pushes).
**MacBook + Xcode + physical iPhone** are the source of truth for native iOS testing.
Both machines work on the same branch (currently `feature/home-xp-progression`) through GitHub.

```
Windows: edit → check → commit → push      Mac: type "iOS" in Cursor
                                            → safe pull → npm ci (if needed)
                                            → build:ios (export + cap sync) → Xcode → Run on iPhone
```

## On Windows

1. Run the game: `npm run dev` → http://localhost:3000 (or type `300` in Cursor).
2. Before pushing, run the regression checks:
   ```bash
   npx tsc --noEmit
   npm run check:gameplay
   npm run check:xp
   npm run check:secure
   npm run build            # stop `npm run dev` first; both use .next
   ```
3. Commit only intended files and push the current branch:
   ```bash
   git add <files>
   git commit -m "..."
   git push origin feature/home-xp-progression
   ```
   Or ask Cursor to "run checks, commit and push". Typing `iOS` on Windows only reports
   status and reminds you to build on the Mac; Windows never runs `build:ios`.

## On the Mac

Open the project in Cursor and type **`iOS`**. Cursor runs `npm run ios` (`scripts/ios-mac.mjs`):

1. Stops if the Mac has uncommitted changes to tracked files (nothing is stashed or discarded).
2. Fetches and **fast-forwards the current branch only**. Stops if the Mac and GitHub have diverged.
3. Runs `npm ci` only when `package.json` / `package-lock.json` changed, or `node_modules` is missing.
4. Prints which Supabase project the build will use, from the Mac's `.env.local` (host only).
5. Runs `npm run build:ios` (static export with `CAPACITOR_BUILD=1`, then `npx cap sync ios`).
6. Opens Xcode (`npx cap open ios`). Select your iPhone as the run destination and press **Cmd+R**.

Without Cursor, run `npm run ios` in the Mac terminal from the project folder.

### First run after this workflow was added

The Mac's checkout predates the new rule, so pull once by hand:

```bash
git pull --ff-only origin feature/home-xp-progression
```

If that refuses because `tsconfig.tsbuildinfo` has local changes, restore it
(`git checkout -- tsconfig.tsbuildinfo`); it is a TypeScript build cache that is no longer
tracked. Anything else listed as changed is real work: commit it or ask Cursor before pulling.
After that, `iOS` works on its own.

## Safety rules (both machines)

- Never merge into `main`, rebase, or switch branches automatically.
- Never `reset`, `stash`, `clean` or otherwise discard local changes automatically.
- Never force-push, deploy the website, upload to App Store Connect, or run Supabase migrations
  as part of this workflow.
- Credentials stay out of git: `.env`, `.env.local`, `.env.*.local`, `*.pem` and `.cursor/mcp.json`
  are ignored. Each machine keeps its own `.env.local`.

## Environment files

| Machine | File | Points at |
|---------|------|-----------|
| Windows | `.env.local` | Staging (`wxifsgypdyrruxybcrcw`). Needs the staging publishable key. |
| Mac | `.env.local` | Whatever the Mac already uses. `npm run ios` prints it before building. |

`NEXT_PUBLIC_*` values are baked in at build time, so the iPhone build talks to whatever project the
Mac's `.env.local` names. Change it deliberately; see `docs/STAGING_AND_RELEASE.md`.

## When something stops

| Message | What it means | What to do |
|---------|---------------|------------|
| uncommitted changes to tracked files | The Mac has edits git doesn't have | Commit them (and push), or ask Cursor to help decide |
| branch has diverged | Both machines committed separately | Ask Cursor to help reconcile; nothing was changed |
| only `tsconfig.tsbuildinfo` changed | Build cache from an older build | Approve `git checkout -- tsconfig.tsbuildinfo` |
| `npm run build:ios` failed | Build or Capacitor error | Read the output; Xcode is not opened |
