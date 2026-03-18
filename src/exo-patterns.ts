import { BulletPool, STYLE_WALL, STYLE_AIMED, STYLE_RING, STYLE_BEAM } from './bullets';

interface Emitter {
  update(dt: number, pool: BulletPool, px: number, py: number, w: number, h: number, diff: number): void;
}

// Rotating arms of bullets from a fixed point — Ares Exo Overload spinner
class SpinnerEmitter implements Emitter {
  private timer = 5.0;
  private active = false;
  private spinTime = 0;
  private readonly spinDuration = 8;
  private angle = 0;
  private cx = 0;
  private cy = 0;
  private armCount = 6;
  private fireAccum = 0;

  update(dt: number, pool: BulletPool, _px: number, _py: number, w: number, h: number, diff: number) {
    if (!this.active) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.active = true;
        this.spinTime = 0;
        this.angle = Math.random() * Math.PI * 2;
        this.cx = w * 0.3 + Math.random() * w * 0.4;
        this.cy = h * 0.3 + Math.random() * h * 0.4;
        this.armCount = Math.min(10, Math.floor(6 + diff * 0.5));
        this.fireAccum = 0;
      }
      return;
    }

    this.spinTime += dt;
    const spinSpeed = 0.4 + this.spinTime * 0.06;
    this.angle += spinSpeed * dt;

    this.fireAccum += dt;
    const fireRate = Math.max(0.06, 0.1 - diff * 0.004);
    while (this.fireAccum >= fireRate) {
      this.fireAccum -= fireRate;
      const speed = 100 + diff * 12;
      for (let i = 0; i < this.armCount; i++) {
        const a = this.angle + (Math.PI * 2 / this.armCount) * i;
        pool.spawn(this.cx, this.cy, Math.cos(a) * speed, Math.sin(a) * speed, 5, STYLE_RING);
      }
    }

    if (this.spinTime >= this.spinDuration) {
      this.active = false;
      this.timer = Math.max(5, 10 / diff);
    }
  }
}

// Projectiles that split into radial bursts on a timer — Ares Plasma Cannon
class ClusterShotEmitter implements Emitter {
  private timer = 2.5;

  update(dt: number, pool: BulletPool, px: number, py: number, w: number, h: number, diff: number) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = Math.max(1.5, 3.0 / diff);

    const count = Math.min(4, Math.floor(2 + diff * 0.3));
    for (let i = 0; i < count; i++) {
      const side = Math.floor(Math.random() * 4);
      let x: number, y: number;
      switch (side) {
        case 0: x = Math.random() * w; y = -20; break;
        case 1: x = w + 20; y = Math.random() * h; break;
        case 2: x = Math.random() * w; y = h + 20; break;
        default: x = -20; y = Math.random() * h; break;
      }

      const angle = Math.atan2(py - y, px - x);
      const speed = 100 + diff * 10;
      const bullet = pool.spawn(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 10, STYLE_AIMED);
      if (bullet) {
        bullet.explodesAt = 1.5 + Math.random() * 0.5;
        bullet.explodeCount = Math.min(10, Math.floor(6 + diff));
        bullet.explodeSpeed = 90 + diff * 10;
      }
    }
  }
}

// Velocity-predictive aimed shots from edges — Artemis targeting
class PredictiveStreamEmitter implements Emitter {
  private timer = 1.5;
  private prevPx = -1;
  private prevPy = -1;

  update(dt: number, pool: BulletPool, px: number, py: number, w: number, h: number, diff: number) {
    if (this.prevPx < 0) {
      this.prevPx = px;
      this.prevPy = py;
      return;
    }

    const vx = (px - this.prevPx) / dt;
    const vy = (py - this.prevPy) / dt;
    this.prevPx = px;
    this.prevPy = py;

    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = Math.max(0.5, 1.0 / diff);

    // Single shot from one random edge
    let sx: number, sy: number;
    const side = Math.floor(Math.random() * 4);
    switch (side) {
      case 0: sx = Math.random() * w; sy = -15; break;
      case 1: sx = w + 15; sy = Math.random() * h; break;
      case 2: sx = Math.random() * w; sy = h + 15; break;
      default: sx = -15; sy = Math.random() * h; break;
    }

    const leadTime = 0.4 + diff * 0.08;
    const speed = 200 + diff * 15;
    const tx = px + vx * leadTime;
    const ty = py + vy * leadTime;
    const angle = Math.atan2(ty - sy, tx - sx);
    pool.spawn(sx, sy, Math.cos(angle) * speed, Math.sin(angle) * speed, 4, STYLE_BEAM);
  }
}

// Sweeping arc of bullets from an edge point — Ares Laser Cannon wiper
class SweepBeamEmitter implements Emitter {
  private timer = 3.5;
  private active = false;
  private sweepTime = 0;
  private readonly sweepDuration = 1.8;
  private startAngle = 0;
  private endAngle = 0;
  private originX = 0;
  private originY = 0;
  private fireAccum = 0;

  update(dt: number, pool: BulletPool, px: number, py: number, w: number, h: number, diff: number) {
    if (!this.active) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.active = true;
        this.sweepTime = 0;
        this.fireAccum = 0;

        const side = Math.floor(Math.random() * 4);
        switch (side) {
          case 0: this.originX = Math.random() * w; this.originY = -10; break;
          case 1: this.originX = w + 10; this.originY = Math.random() * h; break;
          case 2: this.originX = Math.random() * w; this.originY = h + 10; break;
          default: this.originX = -10; this.originY = Math.random() * h; break;
        }

        const angleToPlayer = Math.atan2(py - this.originY, px - this.originX);
        const sweepWidth = Math.PI * 0.35 + diff * 0.04;
        this.startAngle = angleToPlayer - sweepWidth;
        this.endAngle = angleToPlayer + sweepWidth;
      }
      return;
    }

    this.sweepTime += dt;
    this.fireAccum += dt;
    const fireRate = Math.max(0.05, 0.08 - diff * 0.002);

    while (this.fireAccum >= fireRate) {
      this.fireAccum -= fireRate;
      const t = Math.min(1, this.sweepTime / this.sweepDuration);
      const angle = this.startAngle + (this.endAngle - this.startAngle) * t;
      const speed = 180 + diff * 15;
      pool.spawn(this.originX, this.originY, Math.cos(angle) * speed, Math.sin(angle) * speed, 5, STYLE_BEAM);
    }

    if (this.sweepTime >= this.sweepDuration) {
      this.active = false;
      this.timer = Math.max(2, 4.5 / diff);
    }
  }
}

// Sequential shots from a circle around the player — Thanatos coil barrage
class CoilBarrageEmitter implements Emitter {
  private timer = 6.0;
  private active = false;
  private barrageTime = 0;
  private readonly barrageDuration = 3;
  private fireAccum = 0;
  private segmentAngle = 0;
  private prevPx = -1;
  private prevPy = -1;

  update(dt: number, pool: BulletPool, px: number, py: number, _w: number, _h: number, diff: number) {
    if (this.prevPx < 0) {
      this.prevPx = px;
      this.prevPy = py;
      return;
    }

    const vx = (px - this.prevPx) / dt;
    const vy = (py - this.prevPy) / dt;
    this.prevPx = px;
    this.prevPy = py;

    if (!this.active) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.active = true;
        this.barrageTime = 0;
        this.segmentAngle = Math.random() * Math.PI * 2;
        this.fireAccum = 0;
      }
      return;
    }

    this.barrageTime += dt;
    this.fireAccum += dt;

    const fireRate = Math.max(0.08, 0.14 - diff * 0.003);
    const radius = 220 + Math.random() * 60;

    while (this.fireAccum >= fireRate) {
      this.fireAccum -= fireRate;
      this.segmentAngle += 0.35;

      const sx = px + Math.cos(this.segmentAngle) * radius;
      const sy = py + Math.sin(this.segmentAngle) * radius;
      const speed = 140 + diff * 10;
      const lead = 0.2;

      // Single aimed shot — alternates ahead/behind each tick
      const ahead = (Math.floor(this.segmentAngle * 3) % 2) === 0;
      const tx = px + vx * lead * (ahead ? 1 : -1);
      const ty = py + vy * lead * (ahead ? 1 : -1);
      const a = Math.atan2(ty - sy, tx - sx);
      pool.spawn(sx, sy, Math.cos(a) * speed, Math.sin(a) * speed, 5, STYLE_BEAM);
    }

    if (this.barrageTime >= this.barrageDuration) {
      this.active = false;
      this.timer = Math.max(4, 8 / diff);
    }
  }
}

// Zig-zag burst rings at waypoints — Apollo charge combo
class DashBurstEmitter implements Emitter {
  private timer = 5.0;
  private active = false;
  private burstIndex = 0;
  private burstTimer = 0;
  private waypoints: [number, number][] = [];

  update(dt: number, pool: BulletPool, px: number, py: number, w: number, h: number, diff: number) {
    if (!this.active) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.active = true;
        this.burstIndex = 0;
        this.burstTimer = 0;

        const count = Math.min(5, Math.floor(3 + diff * 0.3));
        this.waypoints = [];
        let bx = px + (Math.random() - 0.5) * 300;
        let by = py + (Math.random() - 0.5) * 300;
        for (let i = 0; i < count; i++) {
          bx = Math.max(50, Math.min(w - 50, bx + (Math.random() - 0.5) * 250));
          by = Math.max(50, Math.min(h - 50, by + (Math.random() - 0.5) * 250));
          this.waypoints.push([bx, by]);
        }
      }
      return;
    }

    this.burstTimer += dt;
    if (this.burstTimer >= 0.35 && this.burstIndex < this.waypoints.length) {
      this.burstTimer = 0;
      const [wx, wy] = this.waypoints[this.burstIndex];
      const ringCount = Math.min(14, Math.floor(8 + diff));
      const speed = 110 + diff * 10;

      for (let i = 0; i < ringCount; i++) {
        const a = (Math.PI * 2 / ringCount) * i;
        pool.spawn(wx, wy, Math.cos(a) * speed, Math.sin(a) * speed, 6, STYLE_RING);
      }
      this.burstIndex++;
    }

    if (this.burstIndex >= this.waypoints.length) {
      this.active = false;
      this.timer = Math.max(3, 6 / diff);
    }
  }
}

// Bullet walls with gaps near the player — Thanatos gamma beam perpendicular waves
class WaveWallEmitter implements Emitter {
  private timer = 3.5;

  update(dt: number, pool: BulletPool, px: number, py: number, w: number, h: number, diff: number) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = Math.max(2.0, 4.5 / diff);

    const horizontal = Math.random() > 0.5;
    const speed = 100 + diff * 12;
    const spacing = 42;
    const gapCenter = horizontal ? px : py;
    const gapRadius = Math.max(28, 55 - diff * 3);
    const length = horizontal ? w : h;
    const fromStart = Math.random() > 0.5;

    for (let pos = 0; pos < length; pos += spacing) {
      if (Math.abs(pos - gapCenter) < gapRadius) continue;
      if (Math.random() < 0.12) continue;

      if (horizontal) {
        const y = fromStart ? -10 : h + 10;
        pool.spawn(pos, y, 0, fromStart ? speed : -speed, 7, STYLE_WALL);
      } else {
        const x = fromStart ? -10 : w + 10;
        pool.spawn(x, pos, fromStart ? speed : -speed, 0, 7, STYLE_WALL);
      }
    }
  }
}

export class ExoPatternManager {
  private emitters: Emitter[] = [];
  private phaseTimer = 0;
  private currentPhase = 0;
  private totalTime = 0;
  private _difficulty = 1;
  difficultyRate = 1;

  private readonly phaseDefinitions: { duration: number; create: () => Emitter[] }[] = [
    // Sweeps + clusters — learn the new mechanics
    { duration: 14, create: () => [new SweepBeamEmitter(), new ClusterShotEmitter()] },
    // Add predictive fire from twin flankers
    { duration: 16, create: () => [new SweepBeamEmitter(), new ClusterShotEmitter(), new PredictiveStreamEmitter()] },
    // Coil barrage + wave walls — Thanatos enters
    { duration: 20, create: () => [new WaveWallEmitter(), new PredictiveStreamEmitter(), new CoilBarrageEmitter()] },
    // Spinner + dash bursts — full Exo assault
    { duration: 22, create: () => [new SpinnerEmitter(), new DashBurstEmitter(), new PredictiveStreamEmitter()] },
    // Multi-mech pressure
    { duration: 24, create: () => [new SpinnerEmitter(), new CoilBarrageEmitter(), new ClusterShotEmitter(), new SweepBeamEmitter()] },
    // Everything — berserk phase
    { duration: 28, create: () => [new WaveWallEmitter(), new DashBurstEmitter(), new PredictiveStreamEmitter(), new SpinnerEmitter()] },
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
