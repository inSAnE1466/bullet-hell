import { BulletPool, STYLE_WALL, STYLE_AIMED, STYLE_HOMING, STYLE_RING } from './bullets';

interface Emitter {
  update(dt: number, pool: BulletPool, px: number, py: number, w: number, h: number, diff: number): void;
}

// Grid-based sheet walls from screen edges with guaranteed safe corridors
class HellblastEmitter implements Emitter {
  private waveTimer = 2.0;
  private step = 0;
  private clock = 0;
  private pendingSheets: { dir: number; slots: boolean[]; fireAt: number }[] = [];

  private readonly sequence: number[][] = [
    [0],
    [1],
    [3],
    [0],
    [2],
    [1, 3],
    [0],
    [2],
    [0, 2],
    [1, 3],
    [0],
    [1],
    [3],
    [0, 1],
  ];

  update(dt: number, pool: BulletPool, _px: number, _py: number, w: number, h: number, diff: number) {
    this.clock += dt;

    while (this.pendingSheets.length > 0 && this.clock >= this.pendingSheets[0].fireAt) {
      const sheet = this.pendingSheets.shift()!;
      this.fireSheet(sheet.dir, sheet.slots, pool, w, h, diff);
    }

    const interval = Math.max(2.0, 3.5 / Math.sqrt(diff));
    this.waveTimer -= dt;
    if (this.waveTimer <= 0 && this.pendingSheets.length === 0) {
      this.waveTimer = interval;
      const dirs = this.sequence[this.step % this.sequence.length];
      this.queueSheets(dirs, w, h, diff);
      this.step++;
    }
  }

  private queueSheets(dirs: number[], w: number, h: number, diff: number) {
    const slotSpacing = 48;
    const sheetsPerWave = Math.min(4, Math.floor(2 + diff * 0.3));
    const sheetDelay = 0.4;
    const gapCount = Math.max(2, Math.floor(3.5 - diff * 0.1));
    const gapWidth = 3;

    for (let s = 0; s < sheetsPerWave; s++) {
      const fireAt = this.clock + s * sheetDelay;
      for (const dir of dirs) {
        const length = (dir === 0 || dir === 2) ? w : h;
        const slotCount = Math.ceil(length / slotSpacing);
        const slots: boolean[] = new Array(slotCount).fill(true);

        const section = Math.floor(slotCount / gapCount);
        for (let g = 0; g < gapCount; g++) {
          const sectionStart = g * section;
          const sectionEnd = Math.min((g + 1) * section, slotCount - gapWidth);
          const gapStart = sectionStart + Math.floor(Math.random() * Math.max(1, sectionEnd - sectionStart));
          for (let i = gapStart; i < gapStart + gapWidth && i < slotCount; i++) {
            slots[i] = false;
          }
        }

        for (let i = 0; i < slotCount; i++) {
          if (slots[i] && Math.random() < 0.25) slots[i] = false;
        }

        this.pendingSheets.push({ dir, slots, fireAt });
      }
    }
  }

  private fireSheet(dir: number, slots: boolean[], pool: BulletPool, w: number, h: number, diff: number) {
    const speed = 120 + diff * 12;
    const slotSpacing = 48;
    const r = 8;

    for (let i = 0; i < slots.length; i++) {
      if (!slots[i]) continue;
      const pos = i * slotSpacing;

      switch (dir) {
        case 0: pool.spawn(pos, -12, 0, speed, r, STYLE_WALL); break;
        case 1: pool.spawn(w + 12, pos, -speed, 0, r, STYLE_WALL); break;
        case 2: pool.spawn(pos, h + 12, 0, -speed, r, STYLE_WALL); break;
        case 3: pool.spawn(-12, pos, speed, 0, r, STYLE_WALL); break;
      }
    }
  }
}

// Big carrier balls fly in from off-screen, burst into rings at target location
class RingBurstEmitter implements Emitter {
  private timer = 1.5;
  private step = 0;

  update(dt: number, pool: BulletPool, _px: number, _py: number, w: number, h: number, diff: number) {
    const interval = Math.max(1.4, 2.8 / diff);

    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = interval;
      const cur = this.step++;

      // Cycle explosion style (3 variants, coprime with edge/target counts)
      let explodeCount: number, explodeSpeed: number;
      switch (cur % 3) {
        case 0: // Standard ring
          explodeCount = Math.min(14, Math.floor(12 + diff));
          explodeSpeed = 100 + diff * 10;
          break;
        case 1: // Dense ring — more bullets, slower
          explodeCount = Math.min(20, Math.floor(16 + diff));
          explodeSpeed = 80 + diff * 8;
          break;
        default: // Fast ring — fewer bullets, faster
          explodeCount = Math.min(10, Math.floor(8 + diff));
          explodeSpeed = 130 + diff * 12;
          break;
      }

      // Cycle target area where the ball bursts (5 positions)
      const targets: [number, number][] = [
        [w * 0.5, h * 0.5],
        [w * 0.3, h * 0.3],
        [w * 0.7, h * 0.3],
        [w * 0.3, h * 0.7],
        [w * 0.7, h * 0.7],
      ];
      const [tx, ty] = targets[cur % 5];

      // Cycle which edge the carrier spawns from
      const edge = cur % 4;
      let sx: number, sy: number;
      switch (edge) {
        case 0: sx = tx; sy = -30; break;      // top
        case 1: sx = w + 30; sy = ty; break;   // right
        case 2: sx = tx; sy = h + 30; break;   // bottom
        default: sx = -30; sy = ty; break;      // left
      }

      // Fly toward target, burst on arrival
      const carrierSpeed = 90 + diff * 8;
      const angle = Math.atan2(ty - sy, tx - sx);
      const dist = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2);

      const bullet = pool.spawn(
        sx, sy,
        Math.cos(angle) * carrierSpeed,
        Math.sin(angle) * carrierSpeed,
        12, STYLE_RING
      );
      if (bullet) {
        bullet.explodesAt = dist / carrierSpeed;
        bullet.explodeCount = explodeCount;
        bullet.explodeSpeed = explodeSpeed;
      }
    }
  }
}

// Aimed spread bursts from off-screen edges toward player
class AimedBurstEmitter implements Emitter {
  private timer = 2.0;

  update(dt: number, pool: BulletPool, px: number, py: number, w: number, h: number, diff: number) {
    const fireRate = Math.max(1.2, 2.5 / diff);
    const speed = 160 + diff * 12;
    const count = Math.min(7, Math.floor(3 + diff * 0.5));
    const spread = Math.PI / 4;

    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = fireRate;

      const side = Math.floor(Math.random() * 4);
      let x: number, y: number;
      switch (side) {
        case 0: x = Math.random() * w; y = -10; break;
        case 1: x = w + 10; y = Math.random() * h; break;
        case 2: x = Math.random() * w; y = h + 10; break;
        default: x = -10; y = Math.random() * h; break;
      }

      const baseAngle = Math.atan2(py - y, px - x);
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0 : (i / (count - 1) - 0.5);
        const a = baseAngle + t * spread;
        pool.spawn(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 7, STYLE_AIMED);
      }
    }
  }
}

// Homing projectiles that track then explode into rings
class HomingEmitter implements Emitter {
  private timer = 3;

  update(dt: number, pool: BulletPool, px: number, py: number, w: number, h: number, diff: number) {
    const fireRate = Math.max(2.0, 4.0 / diff);
    const speed = 70 + diff * 10;

    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = fireRate;

      const side = Math.floor(Math.random() * 4);
      let x: number, y: number;
      switch (side) {
        case 0: x = Math.random() * w; y = -30; break;
        case 1: x = w + 30; y = Math.random() * h; break;
        case 2: x = Math.random() * w; y = h + 30; break;
        default: x = -30; y = Math.random() * h; break;
      }

      const angle = Math.atan2(py - y, px - x);
      const bullet = pool.spawn(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 12, STYLE_HOMING);
      if (bullet) {
        bullet.homing = true;
        bullet.homingStrength = 2.0;
        bullet.explodesAt = 3.0;
        bullet.explodeCount = Math.min(12, Math.floor(8 + diff));
        bullet.explodeSpeed = 120 + diff * 10;
      }
    }
  }
}

export class PatternManager {
  private emitters: Emitter[] = [];
  private phaseTimer = 0;
  private currentPhase = 0;
  private totalTime = 0;
  private _difficulty = 1;
  difficultyRate = 1;

  private readonly phaseDefinitions: { duration: number; create: () => Emitter[] }[] = [
    // Walls + center rings immediately — learn both mechanics
    { duration: 12, create: () => [new HellblastEmitter(), new RingBurstEmitter()] },
    // Add aimed bursts
    { duration: 18, create: () => [new HellblastEmitter(), new RingBurstEmitter(), new AimedBurstEmitter()] },
    // Crossfire aimed bursts
    { duration: 22, create: () => [new HellblastEmitter(), new RingBurstEmitter(), new AimedBurstEmitter(), new AimedBurstEmitter()] },
    // Homing bombs enter
    { duration: 25, create: () => [new HellblastEmitter(), new RingBurstEmitter(), new AimedBurstEmitter(), new HomingEmitter()] },
    // Everything
    { duration: 28, create: () => [new HellblastEmitter(), new RingBurstEmitter(), new HomingEmitter(), new AimedBurstEmitter(), new AimedBurstEmitter()] },
  ];

  constructor() {
    this.emitters = this.phaseDefinitions[0].create();
  }

  update(dt: number, pool: BulletPool, px: number, py: number, w: number, h: number) {
    this.totalTime += dt;
    this._difficulty = 1 + (this.totalTime * this.difficultyRate) / 180;

    this.phaseTimer += dt;
    if (this.phaseTimer >= this.phaseDefinitions[this.currentPhase].duration) {
      this.phaseTimer = 0;
      this.currentPhase = (this.currentPhase + 1) % this.phaseDefinitions.length;
      this.emitters = this.phaseDefinitions[this.currentPhase].create();
    }

    for (const e of this.emitters) {
      e.update(dt, pool, px, py, w, h, this._difficulty);
    }
  }

  reset() {
    this.currentPhase = 0;
    this.phaseTimer = 0;
    this.totalTime = 0;
    this._difficulty = 1;
    this.emitters = this.phaseDefinitions[0].create();
  }

  get phase() { return this.currentPhase + 1; }
  get difficulty() { return this._difficulty; }
}
