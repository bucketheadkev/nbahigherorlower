import type {
  InputState,
  MatchState,
  Particle,
  Platform,
  Projectile,
  StickmanState,
  WeaponPickup,
  WeaponType,
} from './types';
import {
  GRAVITY,
  GROUND_FRICTION,
  KILL_Y,
  MAX_PARTICLES,
  PUNCH_KNOCKBACK,
  ROUND_RESET_MS,
  ROUNDS_TO_WIN,
  WEAPON_RESPAWN_MS,
  WORLD_W,
} from './constants';
import { randRange, randInt } from './math';
import { clonePlatforms, getMapForRound, type MapDef } from './maps';
import {
  applyInputForces,
  createStickman,
  damageStickman,
  emptyInput,
  getHandPosition,
  moveStickman,
  tickStickmanCooldowns,
  updateSinkingPlatforms,
} from './stickman';
import { updateAI, throwWeaponFromStickman } from './ai';
import { randomWeaponType, WEAPONS, type WeaponDef } from './weapons';
import {
  AI_ACCENT,
  AI_COLOR,
  PLAYER_ACCENT,
  PLAYER_COLOR,
} from './constants';

type Listener = (snapshot: EngineSnapshot) => void;

export interface EngineSnapshot {
  player: StickmanState;
  ai: StickmanState;
  platforms: Platform[];
  weapons: WeaponPickup[];
  projectiles: Projectile[];
  particles: Particle[];
  match: MatchState;
  map: MapDef;
  cameraShake: number;
  screenFlash: number;
  laserPhase: number;
}

export class StickFightEngine {
  private map!: MapDef;
  private platforms: Platform[] = [];
  private player!: StickmanState;
  private ai!: StickmanState;
  private weapons: WeaponPickup[] = [];
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private match!: MatchState;
  private playerInput = emptyInput();
  private aiInput = emptyInput();
  private nextEntityId = 1;
  private cameraShake = 0;
  private screenFlash = 0;
  private laserPhase = 0;
  private weaponSpawnTimers: number[] = [];
  private running = false;
  private lastTime = 0;
  private rafId = 0;
  private listeners: Listener[] = [];
  private mouseX = 700;
  private mouseY = 400;
  private attackHeld = false;

  constructor() {
    this.resetMatch();
  }

  onUpdate(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  getSnapshot(): EngineSnapshot {
    return {
      player: this.player,
      ai: this.ai,
      platforms: this.platforms,
      weapons: this.weapons,
      projectiles: this.projectiles,
      particles: this.particles,
      match: this.match,
      map: this.map,
      cameraShake: this.cameraShake,
      screenFlash: this.screenFlash,
      laserPhase: this.laserPhase,
    };
  }

  resetMatch(): void {
    this.match = {
      playerWins: 0,
      aiWins: 0,
      round: 1,
      mapId: 'warehouse',
      phase: 'menu',
      roundWinner: null,
      roundMessage: '',
      roundTimer: 0,
    };
  }

  startMatch(): void {
    this.match.playerWins = 0;
    this.match.aiWins = 0;
    this.match.round = 1;
    this.startRound();
    this.match.phase = 'playing';
  }

  startRound(): void {
    this.map = getMapForRound(this.match.round);
    this.match.mapId = this.map.id;
    this.platforms = clonePlatforms(this.map);
    this.player = createStickman('player', this.map.playerSpawn.x, this.map.playerSpawn.y, PLAYER_COLOR, PLAYER_ACCENT);
    this.ai = createStickman('ai', this.map.aiSpawn.x, this.map.aiSpawn.y, AI_COLOR, AI_ACCENT);
    this.weapons = [];
    this.projectiles = [];
    this.particles = [];
    this.cameraShake = 0;
    this.screenFlash = 0;
    this.match.roundWinner = null;
    this.match.roundMessage = '';
    this.match.roundTimer = 0;
    this.match.phase = 'playing';

    for (const spawn of this.map.weaponSpawns) {
      this.weapons.push(this.createWeaponPickup(spawn.x, spawn.y - 20, randomWeaponType()));
    }
    this.weaponSpawnTimers = this.map.weaponSpawns.map(() => 0);
  }

  setPlayerInput(input: Partial<InputState>): void {
    Object.assign(this.playerInput, input);
  }

  setMouse(x: number, y: number): void {
    this.mouseX = x;
    this.mouseY = y;
    this.playerInput.aimX = x;
    this.playerInput.aimY = y;
  }

  setAttackHeld(held: boolean): void {
    this.attackHeld = held;
    this.playerInput.attack = held;
  }

  setBlockHeld(held: boolean): void {
    this.playerInput.block = held;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private loop = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(32, now - this.lastTime);
    this.lastTime = now;
    this.update(dt, now);
    for (const fn of this.listeners) fn(this.getSnapshot());
    this.rafId = requestAnimationFrame(this.loop);
  };

  private update(dt: number, now: number): void {
    this.laserPhase += dt * 0.002;

    if (this.match.phase === 'roundEnd') {
      this.match.roundTimer -= dt;
      this.updateParticles(dt);
      this.cameraShake *= 0.9;
      if (this.match.roundTimer <= 0) {
        if (this.match.playerWins >= ROUNDS_TO_WIN || this.match.aiWins >= ROUNDS_TO_WIN) {
          this.match.phase = 'matchEnd';
        } else {
          this.match.round += 1;
          this.startRound();
        }
      }
      return;
    }

    if (this.match.phase !== 'playing') return;

    updateSinkingPlatforms(this.platforms, dt);

    if (this.map.id === 'lasers') {
      this.updateLasers(dt);
    }

    this.playerInput.aimX = this.mouseX;
    this.playerInput.aimY = this.mouseY;
    this.playerInput.attack = this.attackHeld;

    updateAI(this.ai, this.player, this.platforms, this.weapons, this.aiInput, now);

    applyInputForces(this.player, this.playerInput, dt);
    applyInputForces(this.ai, this.aiInput, dt);

    this.handleCombat(this.player, this.playerInput, now);
    this.handleCombat(this.ai, this.aiInput, now);

    moveStickman(this.player, this.platforms, dt);
    moveStickman(this.ai, this.platforms, dt);

    tickStickmanCooldowns(this.player, dt);
    tickStickmanCooldowns(this.ai, dt);

    this.handleWeaponPickup(this.player);
    this.handleWeaponPickup(this.ai);
    this.handleThrow(this.player, this.playerInput);
    this.handleThrow(this.ai, this.aiInput);

    this.updateWeapons(dt);
    this.updateProjectiles(dt);
    this.updateParticles(dt);
    this.respawnWeapons(dt);

    this.playerInput.jump = false;
    this.aiInput.jump = false;

    this.cameraShake *= 0.88;
    this.screenFlash *= 0.85;

    this.checkRoundEnd();
  }

  private updateLasers(_dt: number): void {
    const active = Math.sin(this.laserPhase * 3) > 0.3;
    if (!active) return;
    const laserX = 700 + Math.sin(this.laserPhase * 1.5) * 200;
    for (const s of [this.player, this.ai]) {
      if (!s.alive) continue;
      if (Math.abs(s.x - laserX) < 8 && s.y < 580) {
        damageStickman(s, 100, randRange(-3, 3), -2);
        this.spawnBlood(s.x, s.y, 12);
        this.cameraShake = 8;
      }
    }
  }

  private handleCombat(s: StickmanState, input: InputState, now: number): void {
    if (!s.alive || !input.attack) return;

    if (s.weapon) {
      const def = WEAPONS[s.weapon];
      if (def.melee) {
        if (s.fireCooldown <= 0) {
          this.meleeAttack(s, def);
          s.fireCooldown = def.fireRate;
        }
      } else if (s.ammo > 0 && s.fireCooldown <= 0) {
        this.fireWeapon(s, def, input);
        s.fireCooldown = def.fireRate;
        s.ammo -= 1;
        if (s.ammo <= 0) {
          s.weapon = null;
        }
      }
    } else if (s.punchCooldown <= 0) {
      this.punchAttack(s);
      s.punchCooldown = 280;
    }

    void now;
  }

  private punchAttack(s: StickmanState): void {
    const target = s.id === 'player' ? this.ai : this.player;
    const range = 42;
    const dx = target.x - s.x;
    if (Math.abs(dx) > range) {
      s.vy -= 2.5;
      return;
    }
    if (!target.alive) return;
    if (Math.sign(dx) !== s.facing && Math.abs(dx) > 10) return;

    const killed = damageStickman(target, 18, s.facing * PUNCH_KNOCKBACK, -3);
    this.spawnBlood(target.x, target.y, killed ? 20 : 8);
    this.cameraShake = killed ? 10 : 4;
    s.vx += s.facing * 1.5;
    if (!s.onGround) s.vy -= 1.5;
  }

  private meleeAttack(s: StickmanState, def: WeaponDef): void {
    const target = s.id === 'player' ? this.ai : this.player;
    const dx = target.x - s.x;
    if (Math.abs(dx) > def.meleeRange) return;
    if (!target.alive) return;

    const killed = damageStickman(target, def.damage, s.facing * (def.recoil + 4), -4);
    this.spawnBlood(target.x, target.y, killed ? 24 : 10);
    this.cameraShake = killed ? 12 : 5;
    s.vx += -s.facing * def.recoil * 0.3;
  }

  private fireWeapon(s: StickmanState, def: WeaponDef, input: InputState): void {
    const hand = getHandPosition(s);
    let aimAngle: number;
    if (s.id === 'player') {
      aimAngle = Math.atan2(input.aimY - hand.y, input.aimX - hand.x);
    } else {
      const target = this.player;
      aimAngle = Math.atan2(target.y - hand.y, target.x - hand.x);
    }

    for (let i = 0; i < def.pellets; i++) {
      const spread = (Math.random() - 0.5) * def.spread * 2;
      const angle = aimAngle + spread;
      const speed = def.projectileSpeed;
      this.projectiles.push({
        id: this.nextEntityId++,
        x: hand.x + Math.cos(angle) * 12,
        y: hand.y + Math.sin(angle) * 12,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage: def.damage,
        radius: def.explosive ? 6 : 3,
        owner: s.id,
        weaponType: def.type,
        life: def.explosive ? 120 : 90,
        explosive: def.explosive,
        explosionRadius: def.explosionRadius,
      });
    }

    s.vx -= Math.cos(aimAngle) * def.recoil * 0.35;
    s.vy -= Math.sin(aimAngle) * def.recoil * 0.15;
    this.cameraShake = Math.min(this.cameraShake + def.recoil * 0.15, 6);
  }

  private handleThrow(s: StickmanState, input: InputState): void {
    if (!input.throw || !s.weapon) return;
    throwWeaponFromStickman(s, this.weapons, this.nextEntityId++);
    input.throw = false;
    s.blockCooldown = 200;
  }

  private handleWeaponPickup(s: StickmanState): void {
    if (!s.alive || s.weapon) return;
    for (let i = this.weapons.length - 1; i >= 0; i--) {
      const w = this.weapons[i];
      if (w.throwCooldown > 0 && w.thrownBy === s.id) continue;
      const dx = Math.abs(s.x - w.x);
      const dy = Math.abs(s.y - w.y);
      if (dx < 36 && dy < 40) {
        s.weapon = w.type;
        s.ammo = WEAPONS[w.type].ammo;
        this.weapons.splice(i, 1);
        return;
      }
    }
  }

  private updateWeapons(dt: number): void {
    for (const w of this.weapons) {
      w.throwCooldown = Math.max(0, w.throwCooldown - dt);
      if (w.onGround) continue;
      w.vy += GRAVITY * dt;
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      w.vx *= GROUND_FRICTION;

      for (const p of this.platforms) {
        if (p.health !== undefined && p.health <= 0) continue;
        if (w.x > p.x && w.x < p.x + p.w && w.y + w.h / 2 > p.y && w.y < p.y + p.h) {
          w.y = p.y - w.h / 2;
          w.vy = 0;
          w.onGround = true;
          w.vx *= 0.5;
        }
      }

      if (w.y > KILL_Y) {
        w.y = KILL_Y - 40;
        w.onGround = true;
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.explosive) this.explode(p.x, p.y, p.explosionRadius ?? 100, p.owner, p.damage);
        this.projectiles.splice(i, 1);
        continue;
      }

      p.vy += GRAVITY * 0.15 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.x < -50 || p.x > WORLD_W + 50 || p.y > KILL_Y) {
        if (p.explosive) this.explode(p.x, p.y, p.explosionRadius ?? 100, p.owner, p.damage);
        this.projectiles.splice(i, 1);
        continue;
      }

      let hit = false;
      for (const plat of this.platforms) {
        if (plat.health !== undefined && plat.health <= 0) continue;
        if (p.x >= plat.x && p.x <= plat.x + plat.w && p.y >= plat.y && p.y <= plat.y + plat.h) {
          if (plat.destructible && plat.health !== undefined) {
            plat.health -= p.damage;
            this.spawnDebris(p.x, p.y, 4);
            if (plat.health <= 0) this.cameraShake = 6;
          }
          if (p.explosive) this.explode(p.x, p.y, p.explosionRadius ?? 100, p.owner, p.damage);
          hit = true;
          break;
        }
      }
      if (hit) {
        this.projectiles.splice(i, 1);
        continue;
      }

      for (const w of this.weapons) {
        if (dist2(p.x, p.y, w.x, w.y) < 20) {
          w.vx += p.vx * 0.3;
          w.vy += p.vy * 0.3 - 2;
          w.onGround = false;
          hit = true;
          break;
        }
      }
      if (hit) {
        this.projectiles.splice(i, 1);
        continue;
      }

      for (const s of [this.player, this.ai]) {
        if (!s.alive || s.id === p.owner) continue;
        if (Math.abs(p.x - s.x) < 18 && Math.abs(p.y - s.y) < 36) {
          const kb = p.vx > 0 ? 5 : -5;
          const killed = damageStickman(s, p.damage, kb, -2);
          this.spawnBlood(s.x, s.y, killed ? 18 : 6);
          this.cameraShake = killed ? 10 : 4;
          if (p.explosive) this.explode(p.x, p.y, p.explosionRadius ?? 100, p.owner, p.damage);
          this.projectiles.splice(i, 1);
          break;
        }
      }
    }
  }

  private explode(x: number, y: number, radius: number, owner: 'player' | 'ai', damage: number): void {
    this.screenFlash = 0.6;
    this.cameraShake = 14;
    this.spawnDebris(x, y, 20);
    for (const s of [this.player, this.ai]) {
      if (!s.alive) continue;
      const d = dist2(x, y, s.x, s.y);
      if (d < radius) {
        const falloff = 1 - d / radius;
        const kbX = (s.x - x) / Math.max(d, 1) * 10 * falloff;
        const kbY = -6 * falloff;
        damageStickman(s, damage * falloff, kbX, kbY);
        this.spawnBlood(s.x, s.y, 14);
      }
    }
    for (const w of this.weapons) {
      const d = dist2(x, y, w.x, w.y);
      if (d < radius) {
        w.vx += (w.x - x) / Math.max(d, 1) * 12;
        w.vy -= 8;
        w.onGround = false;
      }
    }
    void owner;
  }

  private respawnWeapons(dt: number): void {
    this.map.weaponSpawns.forEach((spawn, i) => {
      const occupied = this.weapons.some(
        (w) => Math.abs(w.x - spawn.x) < 40 && Math.abs(w.y - spawn.y) < 60,
      );
      if (!occupied) {
        this.weaponSpawnTimers[i] += dt;
        if (this.weaponSpawnTimers[i] >= WEAPON_RESPAWN_MS) {
          this.weapons.push(this.createWeaponPickup(spawn.x, spawn.y - 20, randomWeaponType()));
          this.weaponSpawnTimers[i] = 0;
        }
      } else {
        this.weaponSpawnTimers[i] = 0;
      }
    });
  }

  private createWeaponPickup(x: number, y: number, type: WeaponType): WeaponPickup {
    return {
      id: this.nextEntityId++,
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      w: 32,
      h: 16,
      onGround: true,
      throwCooldown: 0,
    };
  }

  private checkRoundEnd(): void {
    if (this.match.phase !== 'playing') return;
    let winner: 'player' | 'ai' | null = null;
    if (!this.player.alive && this.ai.alive) winner = 'ai';
    else if (this.player.alive && !this.ai.alive) winner = 'player';
    else if (!this.player.alive && !this.ai.alive) winner = Math.random() > 0.5 ? 'player' : 'ai';

    if (winner) {
      if (winner === 'player') this.match.playerWins++;
      else this.match.aiWins++;
      this.match.roundWinner = winner;
      this.match.phase = 'roundEnd';
      this.match.roundTimer = ROUND_RESET_MS;
      this.match.roundMessage =
        winner === 'player'
          ? `YOU WIN ROUND ${this.match.round}!`
          : `AI WINS ROUND ${this.match.round}!`;
      this.screenFlash = 0.4;
    }
  }

  private spawnBlood(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) break;
      this.particles.push({
        x,
        y,
        vx: randRange(-6, 6),
        vy: randRange(-8, 2),
        life: randRange(300, 700),
        maxLife: 700,
        color: i % 3 === 0 ? '#fff' : '#ddd',
        size: randRange(2, 5),
      });
    }
  }

  private spawnDebris(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) break;
      this.particles.push({
        x,
        y,
        vx: randRange(-8, 8),
        vy: randRange(-10, 4),
        life: randRange(400, 900),
        maxLife: 900,
        color: randInt(0, 1) ? '#8b6914' : '#5c4033',
        size: randRange(3, 7),
      });
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vy += 0.3 * dt;
      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}
