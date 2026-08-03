export type WeaponType =
  | 'pistol'
  | 'shotgun'
  | 'uzi'
  | 'sniper'
  | 'sword'
  | 'spear'
  | 'rocket'
  | 'minigun';

export type MapId = 'warehouse' | 'spikes' | 'lava' | 'lasers';

export type GamePhase = 'menu' | 'playing' | 'roundEnd' | 'matchEnd';

export interface Platform {
  x: number;
  y: number;
  w: number;
  h: number;
  destructible?: boolean;
  health?: number;
  maxHealth?: number;
  crate?: boolean;
  spike?: boolean;
  lava?: boolean;
  sinkSpeed?: number;
  initialY?: number;
}

export interface WeaponPickup {
  id: number;
  type: WeaponType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  onGround: boolean;
  thrownBy?: 'player' | 'ai';
  throwCooldown: number;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  owner: 'player' | 'ai';
  weaponType: WeaponType;
  life: number;
  explosive?: boolean;
  explosionRadius?: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  attack: boolean;
  block: boolean;
  throw: boolean;
  aimX: number;
  aimY: number;
}

export interface StickmanState {
  id: 'player' | 'ai';
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  facing: 1 | -1;
  onGround: boolean;
  health: number;
  maxHealth: number;
  alive: boolean;
  blocking: boolean;
  weapon: WeaponType | null;
  ammo: number;
  fireCooldown: number;
  punchCooldown: number;
  blockCooldown: number;
  color: string;
  accent: string;
  animTime: number;
  hitFlash: number;
  deathTimer: number;
  limbAngles: number[];
  jumpsRemaining: number;
}

export interface MatchState {
  playerWins: number;
  aiWins: number;
  round: number;
  mapId: MapId;
  phase: GamePhase;
  roundWinner: 'player' | 'ai' | null;
  roundMessage: string;
  roundTimer: number;
}

export interface GameSnapshot {
  stickmen: StickmanState[];
  platforms: Platform[];
  weapons: WeaponPickup[];
  projectiles: Projectile[];
  particles: Particle[];
  match: MatchState;
  cameraShake: number;
  screenFlash: number;
}
