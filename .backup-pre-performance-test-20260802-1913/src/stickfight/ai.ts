import type { InputState, Platform, StickmanState, WeaponPickup } from './types';
import { KILL_Y, WEAPON_THROW_FORCE } from './constants';
import { dist } from './math';
import { getHandPosition, stickFeetY } from './stickman';

export function updateAI(
  ai: StickmanState,
  player: StickmanState,
  platforms: Platform[],
  weapons: WeaponPickup[],
  input: InputState,
  now: number,
): void {
  if (!ai.alive || !player.alive) return;

  const dx = player.x - ai.x;
  const absDx = Math.abs(dx);
  const dir = dx > 0 ? 1 : -1;

  input.left = false;
  input.right = false;
  input.jump = false;
  input.attack = false;
  input.block = false;
  input.throw = false;
  input.aimX = player.x;
  input.aimY = player.y;

  const edgeSafe = isEdgeSafe(ai, platforms, dir);

  if (ai.weapon) {
    ai.facing = dir;

    if (absDx > 320) {
      if (edgeSafe) {
        input.left = dir < 0;
        input.right = dir > 0;
      }
    } else if (absDx < 120 && player.weapon) {
      if (edgeSafe) {
        input.left = dir > 0;
        input.right = dir < 0;
      }
      if (Math.random() < 0.04) input.block = true;
    } else if (absDx < 80 && !player.weapon) {
      input.left = dir < 0;
      input.right = dir > 0;
    }

    const los = hasLineOfSight(ai, player, platforms);
    if (los && absDx < 500) {
      input.attack = true;
    }

    if (!edgeSafe && ai.onGround) {
      input.jump = true;
    }

    if (stickFeetY(ai) > KILL_Y - 80 && ai.onGround) {
      input.jump = true;
    }
  } else {
    const targetWeapon = findNearestWeapon(ai, weapons);
    const targetX = targetWeapon ? targetWeapon.x : player.x;

    if (Math.abs(targetX - ai.x) > 40) {
      const moveDir = targetX > ai.x ? 1 : -1;
      if (isEdgeSafe(ai, platforms, moveDir as 1 | -1)) {
        input.left = moveDir < 0;
        input.right = moveDir > 0;
      } else if (ai.onGround) {
        input.jump = true;
      }
    }

    if (targetWeapon && dist(ai.x, ai.y, targetWeapon.x, targetWeapon.y) < 50) {
      // walk over weapon to pick up
    } else if (!targetWeapon && absDx < 55) {
      input.attack = true;
    }

    if (player.weapon && absDx < 200 && Math.random() < 0.03) {
      input.block = true;
    }
  }

  // Occasional aggressive jump toward player
  if (ai.onGround && absDx < 180 && absDx > 60 && edgeSafe && Math.random() < 0.008) {
    input.jump = true;
  }

  // React to player shooting
  if (player.weapon && absDx < 350 && Math.random() < 0.025) {
    input.block = true;
  }

  void now;
}

function findNearestWeapon(ai: StickmanState, weapons: WeaponPickup[]): WeaponPickup | null {
  let best: WeaponPickup | null = null;
  let bestDist = Infinity;
  for (const w of weapons) {
    if (w.throwCooldown > 0 && w.thrownBy === 'ai') continue;
    const d = dist(ai.x, ai.y, w.x, w.y);
    if (d < bestDist) {
      bestDist = d;
      best = w;
    }
  }
  return bestDist < 600 ? best : null;
}

function isEdgeSafe(s: StickmanState, platforms: Platform[], dir: 1 | -1): boolean {
  const footY = stickFeetY(s);
  const probeX = s.x + dir * 36;
  for (const p of platforms) {
    if (p.health !== undefined && p.health <= 0) continue;
    if (probeX >= p.x && probeX <= p.x + p.w && footY >= p.y - 4 && footY <= p.y + p.h + 8) {
      return true;
    }
  }
  return false;
}

function hasLineOfSight(
  from: StickmanState,
  to: StickmanState,
  platforms: Platform[],
): boolean {
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = from.x + (to.x - from.x) * t;
    const py = from.y + (to.y - from.y) * t - 10;
    for (const p of platforms) {
      if (p.health !== undefined && p.health <= 0) continue;
      if (px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h) {
        return false;
      }
    }
  }
  return true;
}

export function throwWeaponFromStickman(
  s: StickmanState,
  weapons: WeaponPickup[],
  nextId: number,
): WeaponPickup | null {
  if (!s.weapon || !s.alive) return null;
  const hand = getHandPosition(s);
  const w: WeaponPickup = {
    id: nextId,
    type: s.weapon,
    x: hand.x,
    y: hand.y,
    vx: s.facing * WEAPON_THROW_FORCE,
    vy: -4,
    w: 32,
    h: 16,
    onGround: false,
    thrownBy: s.id,
    throwCooldown: 30,
  };
  s.weapon = null;
  s.ammo = 0;
  weapons.push(w);
  return w;
}
