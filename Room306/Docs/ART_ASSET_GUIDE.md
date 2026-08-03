# Room 306 — Art Asset Guide

All art is **2D pixel art**, top-down RPG Maker-style perspective with **URP 2D dynamic lighting**. No 3D assets.

---

## Technical Specs

| Asset Type | Resolution | Format | Notes |
|------------|------------|--------|-------|
| Character sprites | 48×48 per frame | PNG, transparent | 4-dir walk cycles, 4 frames each |
| Tilesets | 16×16 tiles | PNG | Motel carpet, tile, wood, asphalt |
| Portraits | 128×128 | PNG | 7 emotions per character |
| Props | 16×16 to 64×64 | PNG | Keys, clocks, newspapers |
| UI | 9-slice PNG | PNG | Dark warm palette (#1a1410 bg, #c4a882 text) |
| VFX | 32×32 spritesheets | PNG | Rain drops, lightning flash, fog puffs |

**Pixels Per Unit:** 16 (consistent across all sprites)

**Filter Mode:** Point (no filter)

**Compression:** None for pixel art

---

## Folder Placement

```
Assets/_Project/Art/
├── Characters/
│   ├── Player/
│   │   ├── player_walk_down.png
│   │   ├── player_walk_up.png
│   │   ├── player_walk_left.png
│   │   └── player_walk_right.png
│   ├── MotelOwner/
│   ├── VisitorOne_Maya/
│   ├── VisitorTwo_Officer/
│   ├── VisitorThree_Girl/
│   ├── VisitorFour_Businessman/
│   └── UnknownFigure/          # Silhouette only, partial visibility
├── Environment/
│   ├── Tilesets/
│   │   ├── motel_carpet.png
│   │   ├── motel_wall.png
│   │   ├── parking_asphalt.png
│   │   └── basement_concrete.png
│   ├── Props/
│   │   ├── bed.png, desk.png, lamp.png
│   │   ├── broken_clock.png
│   │   ├── tape_recorder.png
│   │   └── door_variants.png
│   └── Maps/                   # Pre-composed room layouts (optional)
├── Portraits/
│   ├── motel_owner_neutral.png ... cryptic.png
│   ├── visitor_one_neutral.png ... cryptic.png
│   └── (repeat for each character)
├── UI/
│   ├── menu_background.png
│   ├── dialogue_box_9slice.png
│   ├── inventory_slot.png
│   ├── button_normal.png
│   └── cursor.png
└── VFX/
    ├── rain_particle.png
    ├── lightning_flash.png
    ├── fog_puff.png
    └── shadow_blob.png
```

---

## Color Palette

**Outdoor (night/storm):**
- Sky: `#0d1117`
- Rain: `#6b7c8a` at 60% opacity
- Lightning flash: `#e8e4d9` full screen overlay

**Indoor (warm):**
- Wall: `#3d2e24`
- Carpet: `#5c4033`
- Lamp light (2D Light): `#ffcc88` warm, intensity 0.8–1.2
- Shadow areas: `#1a1410`

**UI:**
- Background: `#1a1410` at 90% alpha
- Text: `#c4a882`
- Choice highlight: `#8b2500`
- Important choice border: `#cc0000`

---

## Character Design Notes

### Player
- Gender-neutral silhouette, travel clothes, wet hair option
- No face visible in top-down (hat/hood shadow)

### Motel Owner (Harold)
- 70s, cardigan, keys on belt, always smiling

### Visitor One (Maya)
- Young woman, soaked clothes, looking over shoulder

### Visitor Two (Officer Reed)
- Uniform but badge number obscured, too-clean shoes

### Visitor Three (Girl)
- ~8 years old, white nightgown, appears ONLY during lightning flash frames

### Visitor Four (Mr. Ashford)
- Suit, briefcase, unnaturally calm expression

### Unknown Figure
- Tall silhouette, static glitch effect, never more than 60% visible

---

## Animation Requirements

| Object | Animation | Frames | FPS |
|--------|-----------|--------|-----|
| Player walk | 4 directions | 4 each | 8 |
| Door open | swing | 4 | 6 |
| Clock tick | hand jitter | 2 | 1 |
| Lamp flicker | via Light2D script | — | — |
| Rain | particle system | — | — |
| Fog | scroll + particle | 4 | 4 |

---

## Lighting Setup (URP 2D)

1. Global Light 2D: cool blue `#8090a0`, intensity 0.15 (moonlight through windows)
2. Point Light 2D on each lamp: warm `#ffcc88`
3. Player carries faint Point Light 2D: `#ffaa66`, radius 2 units
4. Lightning: spike Global Light to 1.5 for 0.15s via `LightningController`

---

## Placeholder Workflow

Until final art is ready:
1. Use colored 16×16 squares for tiles (match palette above)
2. Use single-frame characters with `Animator` bool `IsMoving`
3. Use grey boxes for portraits with character name text
4. Generate placeholder via **Room306 → Generate Placeholder Data**

---

## Recommended Tools

- **Aseprite** — pixel art + spritesheets (Unity Aseprite importer included)
- **Tiled** — map layout export to Unity Tilemap
- **Lospec** — palette reference

---

## Steam Screenshot Targets

Capture at 1920×1080 with pixel-perfect camera:
1. Room 306 with rain on window + warm lamp
2. Dialogue with Maya portrait + choices visible
3. Lightning flash with girl silhouette
4. Basement discovery moment
5. Main menu with motel sign in rain
