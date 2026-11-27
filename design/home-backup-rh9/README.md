# Home rh9 backup ("Center Stage" v1)

Snapshot before the rh10 system pass (clean court, ringless ball, Modes/Shop/Perks/Leaderboard restyle).
Restore by copying files back to their original paths:
- TradeUpHome.tsx, HomeModesSheet.tsx, ShopScreen.tsx, LeaderboardScreen.tsx -> components/tradeup/
- HomeVault.tsx -> components/tradeup/home/
- PerkIcon.tsx -> components/tradeup/perks/
- ShopPerkIcon.tsx -> components/tradeup/shop/
- *.css -> app/ (and remove app/rh10-system.css import from app/layout.tsx)
