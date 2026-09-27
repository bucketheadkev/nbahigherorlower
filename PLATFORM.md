# 1B Run platforms

This is **one shared Next.js game**, delivered two ways. Do not split it into separate repositories or duplicate the game screens.

1. **Website** — the same game deployed to [1brun.com](https://1brun.com).
2. **iOS app** — that same game exported through Capacitor and copied into the Xcode project.

The Git branch name `web-responsive` does **not** mean the code on it is website-only. That branch currently holds the shared source used by both platforms.

Editing **shared** code changes both products. The website picks the change up on the next website deploy. The iOS app does **not** receive it until a new iOS build is created (`npm run build:ios`, then build or archive in Xcode).

## Website only

- `app/web-responsive.css` rules under `html[data-platform='web']`. Native iOS never sets that attribute, so those rules do not change the app.
- Website-specific Next.js behavior, including `/join/CODE` rewrites in `next.config.ts`. Those rewrites are skipped when `CAPACITOR_BUILD=1`.
- Behavior explicitly guarded so it runs only when `isNativeApp()` is false (for example the web 1v1 entry that skips the native mode picker).

Website build:

```bash
npm run build
```

Local play: `npm run dev` at http://localhost:3000.

## iOS only

- `ios/` (Xcode project, icons, splash, `Info.plist`)
- `capacitor.config.ts`
- `scripts/build-ios.mjs`
- Capacitor / native functionality (haptics, share, in-app browser, filesystem, app links)
- Behavior explicitly guarded by `isNativeApp()` or `Capacitor.isNativePlatform()` (for example Bounty, which is marked native-only)

iOS build:

```bash
npm run build:ios
```

Then build or archive through Xcode. `npm run build:ios` statically exports the game (`CAPACITOR_BUILD=1`) and runs `npx cap sync ios`, which copies the export into the Xcode project. Editing React or CSS does nothing on a phone until that sync and a new Xcode build.

## Shared by both

- `app/page.tsx`
- `app/layout.tsx`
- `components/tradeup/`
- `lib/tradeup/`
- `lib/multiplayer/`
- `lib/account/`
- `lib/supabase/`
- `hooks/`
- Shared CSS: `app/oneb-theme.css`, `app/globals.css`, `app/game-ui.css`
- `public/`
- Supabase accounts, leaderboard, multiplayer, and other backend logic

Platform checks belong in `lib/platform/isNativeApp.ts`. Use that instead of inventing a second detection method.

Shared Supabase or backend changes affect the website **and** already-released iOS users, because both talk to the same backend. Do not add or run SQL migrations unless that backend change was explicitly approved.

`legal-site/` is a small privacy/support/join site, not the game. `Room306/` is an unused Unity project and is not part of either product.
