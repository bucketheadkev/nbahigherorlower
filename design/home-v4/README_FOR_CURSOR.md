# 1B RUN Home v4 — isolated art layers

## Files
- `home-arena-bg@3x.webp`: 1290×2796, full-screen text-free navy stadium environment, original programmatically drawn high-resolution artwork.
- `home-jersey-stage@3x.webp` / `.png`: 1170×700, RGBA five-jersey court with transparent surroundings, faithful to the APPROVED reference and no rectangular crop edges.
- `home-pg-glow@3x.png`: optional transparent effect to pulse behind PG pedestal.
- `ART_ONLY_PREVIEW.jpg`: positioning reference (not a production full-screen UI asset).

## Critical source-quality disclosure
The stage is an alpha-matted isolate from the approved 787×1536 flattened image and resized to 1170×700. It has **NOT** gained native 4K jersey detail. The court art is closer to the approved look than a redesigned image, but true source-resolution recreation will still be required for perfect Retina quality. The background is newly authored at 1290×2796 and does not contain UI.

## Cursor instructions
1. Place the `.webp` files into `public/images/home-v4/`.
2. Replace the `home-stage-art--awaiting` placeholder with `home-jersey-stage@3x.webp` in the existing stage slot. Use `object-fit:contain` and scale proportional to the stage. Never use screenshot crops, `cover`, or CSS recreation of the jerseys.
3. Use `home-arena-bg@3x.webp` as the background plate (full bleed). No double background; no gaussian blur.
4. Render all title, XP, coin count, buttons and nav using **existing live UI**. Do not mount `ART_ONLY_PREVIEW.jpg` in the app.
5. Preserve Leaderboard / Play / Shop, Play→Classic, Modes→existing sheet, coin+, menu, profile and all XP/coin handlers. Do not restore My Runs or Achievements tabs. Do not alter Classic evaluation.
6. For PLAY add subtle CSS shimmer/sparkle and tasteful pulse (reduced-motion support), but keep existing functional button and theme.
7. Capture a browser screenshot at iPhone 430×932 and compare with approved screenshot. Confirm all buttons routes and no errors.

Do not declare 4K native stage quality. If the extracted-stage visual is insufficient, request a fully re-rendered independent stage instead of further enlarging it.

## Optional realistic arena background
`home-arena-bg-realistic@3x.webp` is a photo-style alternative. It uses previously generated arena artwork color-graded into navy with the floor dimmed to avoid a competing second court. It is **resampled from an 852×1847 source**, not native 4K. Preview: `ART_ONLY_PREVIEW_REALISTIC.jpg`. Choose one background visually; do not layer both.
