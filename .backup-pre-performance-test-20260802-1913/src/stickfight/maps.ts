import type { MapId, Platform } from './types';
import { KILL_Y, WORLD_W } from './constants';

export interface MapDef {
  id: MapId;
  name: string;
  platforms: Platform[];
  weaponSpawns: { x: number; y: number }[];
  playerSpawn: { x: number; y: number };
  aiSpawn: { x: number; y: number };
  bgColor: string;
  floorColor: string;
  accentColor: string;
}

function borderWalls(): Platform[] {
  return [
    { x: -40, y: 0, w: 40, h: KILL_Y + 200 },
    { x: WORLD_W, y: 0, w: 40, h: KILL_Y + 200 },
  ];
}

export const MAPS: Record<MapId, MapDef> = {
  warehouse: {
    id: 'warehouse',
    name: 'Warehouse',
    bgColor: '#1a1520',
    floorColor: '#5c4033',
    accentColor: '#8b6914',
    playerSpawn: { x: 220, y: 520 },
    aiSpawn: { x: 1180, y: 520 },
    weaponSpawns: [
      { x: 700, y: 420 },
      { x: 350, y: 320 },
      { x: 1050, y: 320 },
      { x: 700, y: 220 },
    ],
    platforms: [
      ...borderWalls(),
      { x: 0, y: 620, w: WORLD_W, h: 40 },
      { x: 120, y: 500, w: 200, h: 24, crate: true },
      { x: 1080, y: 500, w: 200, h: 24, crate: true },
      { x: 420, y: 400, w: 160, h: 24, crate: true, destructible: true, health: 60, maxHealth: 60 },
      { x: 820, y: 400, w: 160, h: 24, crate: true, destructible: true, health: 60, maxHealth: 60 },
      { x: 580, y: 300, w: 240, h: 24, crate: true },
      { x: 280, y: 220, w: 140, h: 24, crate: true, destructible: true, health: 40, maxHealth: 40 },
      { x: 980, y: 220, w: 140, h: 24, crate: true, destructible: true, health: 40, maxHealth: 40 },
      { x: 620, y: 160, w: 160, h: 24, crate: true },
    ],
  },
  spikes: {
    id: 'spikes',
    name: 'Spike Pit',
    bgColor: '#121820',
    floorColor: '#4a5568',
    accentColor: '#718096',
    playerSpawn: { x: 180, y: 480 },
    aiSpawn: { x: 1220, y: 480 },
    weaponSpawns: [
      { x: 700, y: 380 },
      { x: 450, y: 280 },
      { x: 950, y: 280 },
    ],
    platforms: [
      ...borderWalls(),
      { x: 0, y: 580, w: 280, h: 32 },
      { x: 1120, y: 580, w: 280, h: 32 },
      { x: 380, y: 480, w: 200, h: 24 },
      { x: 820, y: 480, w: 200, h: 24 },
      { x: 560, y: 380, w: 280, h: 24 },
      { x: 200, y: 300, w: 160, h: 24, destructible: true, health: 50, maxHealth: 50 },
      { x: 1040, y: 300, w: 160, h: 24, destructible: true, health: 50, maxHealth: 50 },
      { x: 620, y: 240, w: 160, h: 24 },
      { x: 660, y: 578, w: 80, h: 8, spike: true },
      { x: 540, y: 578, w: 80, h: 8, spike: true },
      { x: 780, y: 578, w: 80, h: 8, spike: true },
    ],
  },
  lava: {
    id: 'lava',
    name: 'Lava Floor',
    bgColor: '#1a0a08',
    floorColor: '#8b2500',
    accentColor: '#ff4500',
    playerSpawn: { x: 200, y: 400 },
    aiSpawn: { x: 1200, y: 400 },
    weaponSpawns: [
      { x: 700, y: 340 },
      { x: 400, y: 240 },
      { x: 1000, y: 240 },
      { x: 700, y: 140 },
    ],
    platforms: [
      ...borderWalls(),
      { x: 0, y: 640, w: WORLD_W, h: 40, lava: true },
      { x: 80, y: 500, w: 180, h: 24, sinkSpeed: 0.015, initialY: 500 },
      { x: 1140, y: 500, w: 180, h: 24, sinkSpeed: 0.015, initialY: 500 },
      { x: 340, y: 400, w: 160, h: 24, sinkSpeed: 0.012, initialY: 400 },
      { x: 900, y: 400, w: 160, h: 24, sinkSpeed: 0.012, initialY: 400 },
      { x: 560, y: 320, w: 280, h: 24 },
      { x: 280, y: 220, w: 140, h: 24, sinkSpeed: 0.01, initialY: 220 },
      { x: 980, y: 220, w: 140, h: 24, sinkSpeed: 0.01, initialY: 220 },
      { x: 620, y: 140, w: 160, h: 24 },
    ],
  },
  lasers: {
    id: 'lasers',
    name: 'Laser Grid',
    bgColor: '#0a0a14',
    floorColor: '#2d3748',
    accentColor: '#e53e3e',
    playerSpawn: { x: 200, y: 520 },
    aiSpawn: { x: 1200, y: 520 },
    weaponSpawns: [
      { x: 700, y: 420 },
      { x: 500, y: 320 },
      { x: 900, y: 320 },
    ],
    platforms: [
      ...borderWalls(),
      { x: 0, y: 620, w: WORLD_W, h: 40 },
      { x: 200, y: 480, w: 160, h: 24 },
      { x: 1040, y: 480, w: 160, h: 24 },
      { x: 480, y: 380, w: 120, h: 24 },
      { x: 800, y: 380, w: 120, h: 24 },
      { x: 620, y: 280, w: 160, h: 24 },
      { x: 340, y: 200, w: 100, h: 24 },
      { x: 960, y: 200, w: 100, h: 24 },
    ],
  },
};

export const MAP_ORDER: MapId[] = ['warehouse', 'spikes', 'lava', 'lasers'];

export function clonePlatforms(map: MapDef): Platform[] {
  return map.platforms.map((p) => ({
    ...p,
    health: p.health ?? p.maxHealth,
    initialY: p.initialY ?? p.y,
  }));
}

export function getMapForRound(round: number): MapDef {
  return MAPS[MAP_ORDER[(round - 1) % MAP_ORDER.length]];
}
