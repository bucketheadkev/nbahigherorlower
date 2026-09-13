# 1B Run — Sound credits
## Version 1.0 (Build 3)

App: 1B Run  
Bundle ID: `com.kova.pickfive`  
Developer: KovA Studios  
Date: September 11, 2026

This note covers the two Pixabay sound effects added for this build. Both files are copied into the iOS app bundle. They are not streamed from Pixabay at runtime.

License for both files: Pixabay Content License.  
Summary: https://pixabay.com/service/license-summary/  
Full terms: https://pixabay.com/service/terms/

That license allows commercial use, modification, and use without required attribution. These clips are mixed into the game; they are not sold or distributed as standalone audio. Attribution below is provided for App Review.

---

## 1. Wheel spin

| | |
|---|---|
| Filename | `wheel-spin.mp3` |
| Title on Pixabay | Spin |
| Creator | victorabdo |
| Source | https://pixabay.com/sound-effects/film-special-effects-spin-232536/ |
| License | Pixabay Content License (commercial use allowed; attribution not required) |
| Suggested credit | Spin by victorabdo via Pixabay |

**Where it plays.** Classic and 1v1 team and era wheels, including one-sided rerolls. One sample plays for the first spin of both wheels and again when only the team wheel or only the era wheel is rerolled. Playback is started from a user gesture and stops if the player leaves the screen.

**Code.**  
- File path: `lib/tradeup/gameAudio.ts` (`WHEEL_SPIN_SOUND_PATH`, `startWheelSpinSound`)  
- Trigger: `components/tradeup/BallionTicketMachine.tsx` (`beginSpin`, used by the first roll and by team/era rerolls)  
- Classic screen: `components/tradeup/BillionTradeEngine.tsx`  
- 1v1 screens: `components/tradeup/h2h/H2HPositionPicker.tsx`, `components/tradeup/h2h/H2HTradeUpMatch.tsx`

**Bundled in the iOS app.** Yes.  
`ios/App/App/public/sounds/wheel-spin.mp3` (117,864 bytes). Byte-for-byte match of `public/sounds/wheel-spin.mp3`.

---

## 2. Cash register (“cha-ching”)

| | |
|---|---|
| Filename | `cash-register.mp3` |
| Title on Pixabay | Cash Register 1 |
| Creator | ksjsbwuil |
| Source | https://pixabay.com/sound-effects/film-special-effects-cash-register-1-481216/ |
| License | Pixabay Content License (commercial use allowed; attribution not required) |
| Suggested credit | Cash Register 1 by ksjsbwuil via Pixabay |

**Where it plays.** Once, after the final roster money total finishes counting and is revealed. That is the Classic result and the 1v1 value reveal, which uses the same reveal screen. The same file also plays once when a 1v1 player wins the match.

**Code.**  
- File path: `lib/tradeup/gameAudio.ts` (`CASH_REGISTER_SOUND_PATH`, `playFinalTotalSettleSound`)  
- Final total: `components/tradeup/ClassicRosterReveal.tsx`  
- Classic: `components/tradeup/BillionTradeEngine.tsx`  
- 1v1 value reveal: `components/tradeup/h2h/H2HClassicValueReveal.tsx`  
- 1v1 win: `components/tradeup/h2h/H2HMatchScreen.tsx`

**Bundled in the iOS app.** Yes.  
`ios/App/App/public/sounds/cash-register.mp3` (89,443 bytes). Byte-for-byte match of `public/sounds/cash-register.mp3`.
