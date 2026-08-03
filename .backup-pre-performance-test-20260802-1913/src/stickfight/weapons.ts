import type { WeaponType } from './types';

export interface WeaponDef {
  type: WeaponType;
  label: string;
  damage: number;
  fireRate: number;
  recoil: number;
  spread: number;
  pellets: number;
  projectileSpeed: number;
  ammo: number;
  melee: boolean;
  meleeRange: number;
  punchRange: number;
  color: string;
  auto: boolean;
  explosive?: boolean;
  explosionRadius?: number;
}

export const WEAPONS: Record<WeaponType, WeaponDef> = {
  pistol: {
    type: 'pistol',
    label: 'Pistol',
    damage: 34,
    fireRate: 350,
    recoil: 2.5,
    spread: 0.04,
    pellets: 1,
    projectileSpeed: 22,
    ammo: 12,
    melee: false,
    meleeRange: 0,
    punchRange: 38,
    color: '#888',
    auto: false,
  },
  shotgun: {
    type: 'shotgun',
    label: 'Shotgun',
    damage: 18,
    fireRate: 700,
    recoil: 8,
    spread: 0.35,
    pellets: 6,
    projectileSpeed: 18,
    ammo: 4,
    melee: false,
    meleeRange: 0,
    punchRange: 38,
    color: '#654',
    auto: false,
  },
  uzi: {
    type: 'uzi',
    label: 'Uzi',
    damage: 12,
    fireRate: 90,
    recoil: 1.2,
    spread: 0.12,
    pellets: 1,
    projectileSpeed: 20,
    ammo: 30,
    melee: false,
    meleeRange: 0,
    punchRange: 38,
    color: '#555',
    auto: true,
  },
  sniper: {
    type: 'sniper',
    label: 'Sniper',
    damage: 100,
    fireRate: 900,
    recoil: 6,
    spread: 0,
    pellets: 1,
    projectileSpeed: 35,
    ammo: 3,
    melee: false,
    meleeRange: 0,
    punchRange: 38,
    color: '#3a5',
    auto: false,
  },
  sword: {
    type: 'sword',
    label: 'Sword',
    damage: 55,
    fireRate: 450,
    recoil: 3,
    spread: 0,
    pellets: 0,
    projectileSpeed: 0,
    ammo: 999,
    melee: true,
    meleeRange: 62,
    punchRange: 38,
    color: '#ccc',
    auto: false,
  },
  spear: {
    type: 'spear',
    label: 'Spear',
    damage: 45,
    fireRate: 500,
    recoil: 2,
    spread: 0,
    pellets: 0,
    projectileSpeed: 0,
    ammo: 999,
    melee: true,
    meleeRange: 88,
    punchRange: 38,
    color: '#a86',
    auto: false,
  },
  rocket: {
    type: 'rocket',
    label: 'Rocket',
    damage: 100,
    fireRate: 1100,
    recoil: 10,
    spread: 0,
    pellets: 1,
    projectileSpeed: 14,
    ammo: 2,
    melee: false,
    meleeRange: 0,
    punchRange: 38,
    color: '#f84',
    auto: false,
    explosive: true,
    explosionRadius: 110,
  },
  minigun: {
    type: 'minigun',
    label: 'Minigun',
    damage: 10,
    fireRate: 55,
    recoil: 2.8,
    spread: 0.18,
    pellets: 1,
    projectileSpeed: 24,
    ammo: 80,
    melee: false,
    meleeRange: 0,
    punchRange: 38,
    color: '#666',
    auto: true,
  },
};

export const WEAPON_POOL: WeaponType[] = [
  'pistol',
  'shotgun',
  'uzi',
  'sniper',
  'sword',
  'spear',
  'rocket',
  'minigun',
];

export function randomWeaponType(): WeaponType {
  return WEAPON_POOL[Math.floor(Math.random() * WEAPON_POOL.length)];
}
