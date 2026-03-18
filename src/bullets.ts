// Style indices (used for explosion/homing logic, not color)
export const STYLE_WALL = 0;
export const STYLE_AIMED = 1;
export const STYLE_HOMING = 2;
export const STYLE_RING = 3;
export const STYLE_PLAYER = 4;
export const STYLE_BEAM = 5;

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  style: number;
  age: number;
  homing: boolean;
  homingStrength: number;
  explodesAt: number;
  explodeCount: number;
  explodeSpeed: number;
}

export class BulletPool {
  bullets: Bullet[];
  count = 0;

  constructor(capacity: number) {
    this.bullets = [];
    for (let i = 0; i < capacity; i++) {
      this.bullets.push({
        x: 0, y: 0, vx: 0, vy: 0,
        radius: 8, style: 0, age: 0,
        homing: false, homingStrength: 0,
        explodesAt: 0, explodeCount: 0, explodeSpeed: 0,
      });
    }
  }

  spawn(
    x: number, y: number, vx: number, vy: number,
    radius: number, style: number
  ): Bullet | null {
    if (this.count >= this.bullets.length) return null;
    const b = this.bullets[this.count];
    b.x = x; b.y = y; b.vx = vx; b.vy = vy;
    b.radius = radius; b.style = style; b.age = 0;
    b.homing = false; b.homingStrength = 0;
    b.explodesAt = 0; b.explodeCount = 0; b.explodeSpeed = 0;
    this.count++;
    return b;
  }

  remove(index: number) {
    this.count--;
    const temp = this.bullets[index];
    this.bullets[index] = this.bullets[this.count];
    this.bullets[this.count] = temp;
  }

  clear() {
    this.count = 0;
  }
}

// Batched draw — circles for dots, streaks for beams
export function renderBullets(ctx: CanvasRenderingContext2D, pool: BulletPool, color = '#fff') {
  if (pool.count === 0) return;

  // Pass 1: dot bullets
  ctx.beginPath();
  for (let i = 0; i < pool.count; i++) {
    const b = pool.bullets[i];
    if (b.style === STYLE_BEAM) continue;
    ctx.moveTo(b.x + b.radius, b.y);
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
  }
  ctx.fillStyle = color;
  ctx.fill();

  // Pass 2: beam bullets — velocity-aligned streaks
  ctx.beginPath();
  for (let i = 0; i < pool.count; i++) {
    const b = pool.bullets[i];
    if (b.style !== STYLE_BEAM) continue;
    const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (speed < 1) continue;
    const nx = b.vx / speed;
    const ny = b.vy / speed;
    const len = b.radius * 5;
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - nx * len, b.y - ny * len);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}
