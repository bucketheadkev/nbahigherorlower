# Room 306 — Audio Asset Guide

All audio should be **royalty-free** during development. Replace with licensed/composed tracks before Steam release.

---

## Folder Placement

```
Assets/_Project/Audio/
├── Ambient/
│   ├── ambient_rain_loop.wav
│   ├── ambient_motel_hum.wav
│   ├── ambient_wind.wav
│   └── ambient_basement_drip.wav
├── Music/
│   ├── music_main_menu_piano.wav
│   ├── music_chapter1_tension.wav
│   ├── music_chapter2_investigation.wav
│   ├── music_chapter3_distortion.wav
│   ├── music_chapter4_revelation.wav
│   └── music_chapter5_confrontation.wav
└── SFX/
    ├── sfx_door_open.wav
    ├── sfx_door_locked.wav
    ├── sfx_door_unlock.wav
    ├── sfx_footstep_carpet.wav
    ├── sfx_footstep_tile.wav
    ├── sfx_knock_slow.wav          # 3 knocks — story critical
    ├── sfx_thunder_distant.wav
    ├── sfx_thunder_close.wav
    ├── sfx_lightning_crack.wav
    ├── sfx_power_flicker.wav
    ├── sfx_item_pickup.wav
    ├── sfx_typing.wav
    ├── sfx_clock_tick.wav
    ├── sfx_tape_recorder_play.wav
    ├── sfx_floor_creak.wav
    └── sfx_wind_gust.wav
```

---

## SfxLibrary Configuration

Create `Assets/_Project/Data/Audio/SfxLibrary.asset` and map IDs:

| ID | Clip | Trigger |
|----|------|---------|
| `footstep` | sfx_footstep_carpet.wav | Player movement (future) |
| `door_open` | sfx_door_open.wav | `Door.OpenAndTransition` |
| `door_locked` | sfx_door_locked.wav | Locked door interact |
| `door_unlock` | sfx_door_unlock.wav | Key used |
| `knock_slow` | sfx_knock_slow.wav | 3:06 AM story trigger |
| `item_pickup` | sfx_item_pickup.wav | Inventory add |
| `power_flicker` | sfx_power_flicker.wav | Chapter 1 outage |
| `floor_creak` | sfx_floor_creak.wav | Random hallway ambient |

---

## Audio Mixer Setup

Create `Room306_Master.mixer` with groups:

```
Master
├── Music      (expose: MusicVolume)
├── SFX        (expose: SFXVolume)
├── Ambient    (ducked by Music -6dB)
└── Voice      (for future VO)
```

Assign to `AudioManager` prefab:
- `musicSource` → Music group
- `ambientSource` → Ambient group
- `sfxSource` → SFX group
- `voiceSource` → Voice group

---

## Music Direction

**Style:** Soft solo piano with sparse reverb. Minor key. Think "lonely motel at 3 AM."

| Track | Mood | BPM | Key |
|-------|------|-----|-----|
| Main Menu | Melancholy, inviting | 60 | Am |
| Chapter 1 | Unease building | 70 | Dm |
| Chapter 2 | Investigative | 75 | Em |
| Chapter 3 | Distorted/wrong | 65 | Bbm (detuned) |
| Chapter 4 | Revelation shock | 80 | Cm |
| Chapter 5 | Confrontation | 90 | Dm → Am |

**Loop:** All music tracks seamless loop, 2–4 minutes.

---

## Ambient Layers

Stack in `AmbientSoundZone`:

| Zone | Layers |
|------|--------|
| Exterior/Parking | rain + wind |
| Lobby/Hallway | rain (muffled) + motel hum + occasional creak |
| Room 306 | rain on window + clock tick + faint hum |
| Basement | drip + low rumble, no rain |

---

## Critical SFX Moments

### 3:06 Knock (`sfx_knock_slow.wav`)
- Exactly **3 knocks**, evenly spaced (~0.8s apart)
- Heavy wood door texture
- Triggers `ScreenShake` + `StoryTrigger`
- Must be instantly recognizable by player on repeat playthroughs

### Thunder
- `LightningController` plays thunder **0.5–3s after flash** (random delay)
- Close thunder shakes camera harder than distant

### Typing (`sfx_typing.wav`)
- Short click, played per character in `DialogueManager.TypeTextRoutine`
- Volume 0.3 to avoid fatigue

---

## Royalty-Free Sources (Development Placeholders)

- [Kenney.nl](https://kenney.nl/assets?q=audio) — UI and generic SFX
- [OpenGameArt.org](https://opengameart.org) — ambient loops
- [Freesound.org](https://freesound.org) — rain, thunder, creaks (check CC license)
- [Incompetech](https://incompetech.com) — piano placeholders (credit required)

**Before Steam release:** Replace ALL placeholders with original or properly licensed assets. Document licenses in `Docs/AUDIO_LICENSES.md`.

---

## Import Settings (Unity)

| Type | Load Type | Compression | Quality |
|------|-----------|-------------|---------|
| Music | Streaming | Vorbis | 70% |
| Ambient loops | Streaming | Vorbis | 80% |
| SFX | Decompress on Load | PCM (short) / Vorbis (long) | 100% |

**Sample Rate:** 44100 Hz  
**Force To Mono:** Yes (SFX and ambient), Stereo (music)

---

## Implementation Checklist

- [ ] Create Audio Mixer with exposed parameters
- [ ] Populate SfxLibrary asset
- [ ] Assign clips to AudioManager prefab
- [ ] Place AmbientSoundZone colliders per scene
- [ ] Hook `music_chapter*` to ChapterManager transitions
- [ ] Test volume sliders in Settings menu
