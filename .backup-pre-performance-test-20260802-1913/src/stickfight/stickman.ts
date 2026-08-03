import type { InputState, Platform, StickmanState } from './types';
import {
  AIR_FRICTION,
  BLOCK_SLOW,
  GRAVITY,
  GROUND_FRICTION,
  JUMP_VELOCITY,
  KILL_Y,
  MAX_RUN_SPEED,
  MOVE_ACCEL,
  STICK_H,
  STICK_W,
} from './constants';
import { clamp } from './math';

export function createStickman(
  id: 'player' | 'ai',
  x: number,
  y: number,
  color: string,
  accent: string,
): StickmanState {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    w: STICK_W,
    h: STICK_H,
    facing: id === 'player' ? 1 : -1,
    onGround: false,
    health: 100,
    maxHealth: 100,
    alive: true,
    blocking: false,
    weapon: null,
    ammo: 0,
    fireCooldown: 0,
    punchCooldown: 0,
    blockCooldown: 0,
    color,
    accent,
    animTime: 0,
    hitFlash: 0,
    deathTimer: 0,
    limbAngles: [0, 0, 0, 0],
    jumpsRemaining: 2,
  };
}

export function stickFeetY(s: StickmanState): number {
  return s.y + s.h / 2;
}

export function stickHeadY(s: StickmanState): number {
  return s.y - s.h / 2 + 8;
}

export function applyInputForces(s: StickmanState, input: InputState, dt: number): void {
  if (!s.alive) return;

  const slow = s.blocking ? BLOCK_SLOW : 1;
  if (input.left) s.vx -= MOVE_ACCEL * slow;
  if (input.right) s.vx += MOVE_ACCEL * slow;

  if (input.jump && s.jumpsRemaining > 0) {
    s.vy = JUMP_VELOCITY;
    s.onGround = false;
    s.jumpsRemaining -= 1;
  }

  s.blocking = input.block && s.blockCooldown <= 0;
  s.facing = input.aimX >= s.x ? 1 : -1;
  if (Math.abs(s.vx) > 0.3 && !input.block) {
    s.facing = s.vx > 0 ? 1 : -1;
  }

  s.vy += GRAVITY * dt;
  s.vx = clamp(s.vx, -MAX_RUN_SPEED, MAX_RUN_SPEED);
  s.vx *= s.onGround ? GROUND_FRICTION : AIR_FRICTION;
  s.animTime += dt;
}

export function moveStickman(s: StickmanState, platforms: Platform[], dt: number): void {
  if (!s.alive) {
    s.vy += GRAVITY * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.deathTimer += dt;
    s.limbAngles = s.limbAngles.map((a, i) => a + (0.08 + i * 0.02) * dt);
    return;
  }

  s.x += s.vx * dt;
  resolveAxis(s, platforms, 'x');
  s.y += s.vy * dt;
  const wasOnGround = s.onGround;
  resolveAxis(s, platforms, 'y');
  if (s.onGround && !wasOnGround) s.jumpsRemaining = 2;

  if (stickFeetY(s) > KILL_Y) {
    s.health = 0;
    s.alive = false;
    s.deathTimer = 0;
  }
}

function resolveAxis(s: StickmanState, platforms: Platform[], axis: 'x' | 'y'): void {
  s.onGround = false;
  const halfW = s.w / 2;
  const halfH = s.h / 2;

  for (const p of platforms) {
    if (p.health !== undefined && p.health <= 0) continue;

    const left = s.x - halfW;
    const right = s.x + halfW;
    const top = s.y - halfH;
    const bottom = s.y + halfH;

    if (right <= p.x || left >= p.x + p.w || bottom <= p.y || top >= p.y + p.h) continue;

    if (axis === 'x') {
      if (s.vx > 0) s.x = p.x - halfW - 0.01;
      else if (s.vx < 0) s.x = p.x + p.w + halfW + 0.01;
      s.vx = 0;
    } else {
      if (s.vy > 0) {
        s.y = p.y - halfH - 0.01;
        s.onGround = true;
        s.vy = 0;
        if (p.spike) {
          s.health = 0;
          s.alive = false;
          s.deathTimer = 0;
        }
        if (p.lava) {
          s.health = 0;
          s.alive = false;
          s.deathTimer = 0;
        }
      } else if (s.vy < 0) {
        s.y = p.y + p.h + halfH + 0.01;
        s.vy = 0;
      }
    }
  }
}

export function updateSinkingPlatforms(platforms: Platform[], dt: number): void {
  for (const p of platforms) {
    if (p.sinkSpeed && p.initialY !== undefined) {
      p.y = Math.min(p.initialY + 80, p.y + p.sinkSpeed * dt);
    }
  }
}

export function getHandPosition(s: StickmanState): { x: number; y: number } {
  const shoulderY = s.y - s.h / 2 + 18;
  const reach = s.weapon ? 22 : 16;
  return {
    x: s.x + s.facing * reach,
    y: shoulderY + 8,
  };
}

export function damageStickman(s: StickmanState, amount: number, knockbackX: number, knockbackY: number): boolean {
  if (!s.alive) return false;
  if (s.blocking && Math.random() < 0.35) {
    s.vx = -knockbackX * 0.3;
    s.vy = knockbackY * 0.2;
    s.hitFlash = 8;
    return false;
  }
  s.health -= amount;
  s.hitFlash = 12;
  s.vx += knockbackX;
  s.vy += knockbackY;
  if (s.health <= 0) {
    s.alive = false;
    s.deathTimer = 0;
    s.weapon = null;
    return true;
  }
  return false;
}

export function tickStickmanCooldowns(s: StickmanState, dt: number): void {
  s.fireCooldown = Math.max(0, s.fireCooldown - dt);
  s.punchCooldown = Math.max(0, s.punchCooldown - dt);
  s.blockCooldown = Math.max(0, s.blockCooldown - dt);
  s.hitFlash = Math.max(0, s.hitFlash - dt);
}

export function emptyInput(): InputState {
  return {
    left: false,
    right: false,
    jump: false,
    attack: false,
    block: false,
    throw: false,
    aimX: 0,
    aimY: 0,
  };
}
