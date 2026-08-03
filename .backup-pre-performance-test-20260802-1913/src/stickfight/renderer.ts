import type { EngineSnapshot } from './engine';
import { VIEW_H, VIEW_W, WORLD_H, WORLD_W } from './constants';
import { WEAPONS } from './weapons';
import { getHandPosition, stickHeadY } from './stickman';

export function renderGame(ctx: CanvasRenderingContext2D, snap: EngineSnapshot): void {
  const { map, player, ai, platforms, weapons, projectiles, particles, cameraShake, screenFlash, laserPhase } = snap;

  const camX = clampCamera(
    (player.x + ai.x) / 2 - VIEW_W / 2,
    0,
    WORLD_W - VIEW_W,
  );
  const shakeX = (Math.random() - 0.5) * cameraShake;
  const shakeY = (Math.random() - 0.5) * cameraShake;

  ctx.save();
  ctx.fillStyle = map.bgColor;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  drawBackground(ctx, map.bgColor, map.accentColor);

  ctx.translate(-camX + shakeX, shakeY);

  for (const p of platforms) {
    if (p.health !== undefined && p.health <= 0) continue;
    drawPlatform(ctx, p, map);
  }

  if (map.id === 'lasers') {
    drawLasers(ctx, laserPhase);
  }

  for (const w of weapons) drawWeaponPickup(ctx, w);
  for (const p of projectiles) drawProjectile(ctx, p);
  drawStickman(ctx, player);
  drawStickman(ctx, ai);
  for (const p of particles) drawParticle(ctx, p);

  ctx.restore();

  if (screenFlash > 0.05) {
    ctx.fillStyle = `rgba(255,200,100,${screenFlash * 0.35})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  drawHUD(ctx, snap, camX);
}

function clampCamera(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

function drawBackground(ctx: CanvasRenderingContext2D, bg: string, accent: string): void {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, bg);
  grad.addColorStop(1, '#0a0a0f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.strokeStyle = accent + '22';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 180, 0);
    ctx.lineTo(i * 180 - 100, VIEW_H);
    ctx.stroke();
  }
}

function drawPlatform(
  ctx: CanvasRenderingContext2D,
  p: import('./types').Platform,
  map: import('./maps').MapDef,
): void {
  if (p.lava) {
    const pulse = 0.7 + Math.sin(Date.now() * 0.004) * 0.3;
    ctx.fillStyle = `rgba(255,69,0,${pulse})`;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#ffaa00';
    for (let i = 0; i < p.w; i += 24) {
      ctx.fillRect(p.x + i, p.y, 12, 4);
    }
    return;
  }

  if (p.spike) {
    ctx.fillStyle = '#888';
    for (let i = 0; i < p.w; i += 12) {
      ctx.beginPath();
      ctx.moveTo(p.x + i, p.y + p.h);
      ctx.lineTo(p.x + i + 6, p.y);
      ctx.lineTo(p.x + i + 12, p.y + p.h);
      ctx.fill();
    }
    return;
  }

  const color = p.crate ? '#6b4c30' : map.floorColor;
  ctx.fillStyle = color;
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.strokeStyle = p.crate ? '#8b6914' : '#555';
  ctx.lineWidth = 2;
  ctx.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);

  if (p.crate) {
    ctx.strokeStyle = '#4a3520';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x + 4, p.y + 4);
    ctx.lineTo(p.x + p.w - 4, p.y + p.h - 4);
    ctx.moveTo(p.x + p.w - 4, p.y + 4);
    ctx.lineTo(p.x + 4, p.y + p.h - 4);
    ctx.stroke();
  }

  if (p.destructible && p.health !== undefined && p.maxHealth !== undefined) {
    const ratio = p.health / p.maxHealth;
    if (ratio < 1) {
      ctx.fillStyle = `rgba(0,0,0,${0.3 * (1 - ratio)})`;
      ctx.fillRect(p.x, p.y, p.w, p.h);
    }
  }
}

function drawLasers(ctx: CanvasRenderingContext2D, phase: number): void {
  const active = Math.sin(phase * 3) > 0.3;
  if (!active) return;
  const x = 700 + Math.sin(phase * 1.5) * 200;
  ctx.save();
  ctx.shadowColor = '#f00';
  ctx.shadowBlur = 20;
  ctx.strokeStyle = '#ff2244';
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, WORLD_H);
  ctx.stroke();
  ctx.restore();
}

function drawStickman(ctx: CanvasRenderingContext2D, s: import('./types').StickmanState): void {
  const headY = stickHeadY(s);
  const shoulderY = s.y - s.h / 2 + 18;
  const hipY = s.y + s.h / 2 - 14;
  const footY = s.y + s.h / 2;

  const walk = s.onGround && s.alive ? Math.sin(s.animTime * 0.015) * 8 : 0;
  const armSwing = s.alive ? Math.sin(s.animTime * 0.02) * 0.5 : s.limbAngles[0];

  ctx.save();
  ctx.strokeStyle = s.hitFlash > 0 ? '#fff' : s.color;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (!s.alive) {
    ctx.globalAlpha = 0.85;
    ctx.translate(s.x, s.y);
    ctx.rotate(s.limbAngles[0]);
    ctx.translate(-s.x, -s.y);
  }

  // Head
  ctx.beginPath();
  ctx.arc(s.x, headY, 11, 0, Math.PI * 2);
  ctx.stroke();

  // Body
  ctx.beginPath();
  ctx.moveTo(s.x, shoulderY);
  ctx.lineTo(s.x, hipY);
  ctx.stroke();

  const hand = getHandPosition(s);

  // Arms
  if (s.blocking && s.alive) {
    ctx.beginPath();
    ctx.moveTo(s.x, shoulderY + 4);
    ctx.lineTo(s.x + s.facing * 18, shoulderY - 4);
    ctx.lineTo(s.x + s.facing * 14, shoulderY + 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x, shoulderY + 4);
    ctx.lineTo(s.x - s.facing * 10, shoulderY + 12);
    ctx.stroke();
  } else if (s.weapon) {
    ctx.beginPath();
    ctx.moveTo(s.x, shoulderY + 4);
    ctx.lineTo(hand.x, hand.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x, shoulderY + 4);
    ctx.lineTo(s.x - s.facing * 14, shoulderY + 16 + armSwing * 4);
    ctx.stroke();
    drawHeldWeapon(ctx, s, hand.x, hand.y);
  } else {
    const punchExtend = s.punchCooldown > 200 ? 14 : 0;
    ctx.beginPath();
    ctx.moveTo(s.x, shoulderY + 4);
    ctx.lineTo(s.x + s.facing * (16 + punchExtend), shoulderY + 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x, shoulderY + 4);
    ctx.lineTo(s.x - s.facing * 14, shoulderY + 16 + armSwing * 4);
    ctx.stroke();
  }

  // Legs
  if (s.alive) {
    ctx.beginPath();
    ctx.moveTo(s.x, hipY);
    ctx.lineTo(s.x - 10 + walk * 0.3, footY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x, hipY);
    ctx.lineTo(s.x + 10 - walk * 0.3, footY);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(s.x, hipY);
    ctx.lineTo(s.x - 18, footY + 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x, hipY);
    ctx.lineTo(s.x + 22, footY + 6);
    ctx.stroke();
  }

  // Health bar
  if (s.alive && s.health < s.maxHealth) {
    const barW = 36;
    ctx.fillStyle = '#333';
    ctx.fillRect(s.x - barW / 2, headY - 22, barW, 5);
    ctx.fillStyle = s.accent;
    ctx.fillRect(s.x - barW / 2, headY - 22, barW * (s.health / s.maxHealth), 5);
  }

  ctx.restore();
}

function drawHeldWeapon(
  ctx: CanvasRenderingContext2D,
  s: import('./types').StickmanState,
  hx: number,
  hy: number,
): void {
  if (!s.weapon) return;
  const def = WEAPONS[s.weapon];
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(s.facing === 1 ? 0 : Math.PI);
  ctx.fillStyle = def.color;
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;

  if (def.melee) {
    if (s.weapon === 'sword') {
      ctx.fillRect(-4, -3, 40, 6);
      ctx.fillStyle = '#654';
      ctx.fillRect(-8, -5, 8, 10);
    } else {
      ctx.fillRect(-4, -2, 56, 4);
      ctx.fillStyle = '#543';
      ctx.fillRect(-10, -4, 10, 8);
    }
  } else if (s.weapon === 'rocket') {
    ctx.fillRect(-6, -5, 28, 10);
    ctx.fillStyle = '#333';
    ctx.fillRect(18, -3, 8, 6);
  } else if (s.weapon === 'minigun') {
    ctx.fillRect(-8, -6, 36, 12);
    for (let i = 0; i < 4; i++) ctx.fillRect(20 + i * 4, -2, 8, 4);
  } else if (s.weapon === 'shotgun') {
    ctx.fillRect(-6, -4, 32, 8);
  } else if (s.weapon === 'sniper') {
    ctx.fillRect(-8, -3, 48, 6);
    ctx.fillStyle = '#2a4';
    ctx.fillRect(10, -6, 16, 4);
  } else {
    ctx.fillRect(-4, -3, 22, 6);
  }
  ctx.restore();
}

function drawWeaponPickup(ctx: CanvasRenderingContext2D, w: import('./types').WeaponPickup): void {
  const def = WEAPONS[w.type];
  ctx.save();
  ctx.translate(w.x, w.y);
  ctx.fillStyle = def.color;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 6;

  if (def.melee) {
    ctx.fillRect(-16, -3, 32, 6);
  } else {
    ctx.fillRect(-12, -4, 24, 8);
  }

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowBlur = 0;
  ctx.fillText(def.label.slice(0, 3).toUpperCase(), 0, -10);
  ctx.restore();
}

function drawProjectile(ctx: CanvasRenderingContext2D, p: import('./types').Projectile): void {
  ctx.save();
  if (p.explosive) {
    ctx.fillStyle = '#f84';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff0';
    ctx.fillRect(p.x - 8, p.y - 2, 12, 4);
  } else {
    ctx.fillStyle = '#ff0';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticle(ctx: CanvasRenderingContext2D, p: import('./types').Particle): void {
  ctx.globalAlpha = p.life / p.maxLife;
  ctx.fillStyle = p.color;
  ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  ctx.globalAlpha = 1;
}

function drawHUD(ctx: CanvasRenderingContext2D, snap: EngineSnapshot, camX: number): void {
  const { match, player, map } = snap;

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, VIEW_W, 52);

  ctx.font = 'bold 22px "Bebas Neue", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = player.color;
  ctx.fillText(`${match.playerWins}`, 24, 36);

  ctx.textAlign = 'right';
  ctx.fillStyle = snap.ai.color;
  ctx.fillText(`${match.aiWins}`, VIEW_W - 24, 36);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(`ROUND ${match.round}  ·  ${map.name.toUpperCase()}`, VIEW_W / 2, 36);

  if (player.weapon) {
    const def = WEAPONS[player.weapon];
    ctx.font = '14px Inter, sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.textAlign = 'left';
    ctx.fillText(`${def.label}${def.melee ? '' : ` (${player.ammo})`}`, 60, 36);
  }

  if (match.phase === 'roundEnd') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, VIEW_H / 2 - 50, VIEW_W, 100);
    ctx.font = 'bold 48px "Bebas Neue", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = match.roundWinner === 'player' ? player.color : snap.ai.color;
    ctx.fillText(match.roundMessage, VIEW_W / 2, VIEW_H / 2 + 10);
  }

  ctx.font = '12px Inter, sans-serif';
  ctx.fillStyle = '#666';
  ctx.textAlign = 'center';
  ctx.fillText('WASD move · Space jump · LMB attack · RMB block · F throw', VIEW_W / 2, VIEW_H - 12);

  void camX;
}

export function renderMenu(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#0d0d14';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const grad = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 50, VIEW_W / 2, VIEW_H / 2, 500);
  grad.addColorStop(0, '#1a1a2e');
  grad.addColorStop(1, '#0d0d14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Decorative stickmen
  drawMenuStickman(ctx, VIEW_W * 0.25, VIEW_H * 0.55, '#5ecbff', 1);
  drawMenuStickman(ctx, VIEW_W * 0.75, VIEW_H * 0.55, '#ff6b4a', -1);

  ctx.font = 'bold 96px "Bebas Neue", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText('STICK FIGHT', VIEW_W / 2, VIEW_H * 0.32);

  ctx.font = '20px Inter, sans-serif';
  ctx.fillStyle = '#888';
  ctx.fillText('Physics brawler · You vs AI', VIEW_W / 2, VIEW_H * 0.38);

  ctx.fillStyle = '#5ecbff';
  ctx.font = 'bold 28px "Bebas Neue", sans-serif';
  ctx.fillText('CLICK TO FIGHT', VIEW_W / 2, VIEW_H * 0.72);

  ctx.font = '14px Inter, sans-serif';
  ctx.fillStyle = '#555';
  ctx.fillText('First to 3 rounds wins', VIEW_W / 2, VIEW_H * 0.78);
}

function drawMenuStickman(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, facing: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y - 40, 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 26);
  ctx.lineTo(x, y + 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 18);
  ctx.lineTo(x + facing * 30, y - 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 18);
  ctx.lineTo(x - facing * 24, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y + 10);
  ctx.lineTo(x - 12, y + 40);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y + 10);
  ctx.lineTo(x + 12, y + 40);
  ctx.stroke();
}

export function renderMatchEnd(ctx: CanvasRenderingContext2D, playerWins: number, aiWins: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const won = playerWins >= 3;
  ctx.font = 'bold 72px "Bebas Neue", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = won ? '#5ecbff' : '#ff6b4a';
  ctx.fillText(won ? 'VICTORY!' : 'DEFEAT', VIEW_W / 2, VIEW_H * 0.4);

  ctx.font = '24px Inter, sans-serif';
  ctx.fillStyle = '#aaa';
  ctx.fillText(`${playerWins} - ${aiWins}`, VIEW_W / 2, VIEW_H * 0.48);

  ctx.font = 'bold 22px "Bebas Neue", sans-serif';
  ctx.fillStyle = '#5ecbff';
  ctx.fillText('CLICK TO REMATCH', VIEW_W / 2, VIEW_H * 0.62);
}
