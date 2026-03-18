import { Input } from './input';
import { Player } from './player';
import { BulletPool, renderBullets, STYLE_PLAYER, STYLE_RING } from './bullets';
import { PatternManager } from './patterns';
import { ExoPatternManager } from './exo-patterns';
import { Target, spawnTarget, updateTarget, renderTarget } from './targets';

type PatternMode = 'SCal' | 'exo';

type GameState = 'title' | 'playing' | 'gameover';

const SCORES_KEY = 'bullet-hell-top5';

function loadScores(): number[] {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.filter((n: unknown) => typeof n === 'number').slice(0, 5);
  } catch { /* ignore */ }
  return [];
}

function saveScore(score: number): number[] {
  const scores = loadScores();
  scores.push(score);
  scores.sort((a, b) => b - a);
  const top5 = scores.slice(0, 5);
  try { localStorage.setItem(SCORES_KEY, JSON.stringify(top5)); } catch { /* ignore */ }
  return top5;
}

export class Game {
  private input: Input;
  private player: Player;
  private enemyBullets: BulletPool;
  private playerBullets: BulletPool;
  private targets: Target[] = [];
  private patterns: PatternManager | ExoPatternManager;
  private patternMode: PatternMode = 'SCal';
  private score = 0;
  private state: GameState = 'title';
  private shootCooldown = 0;
  private shakeTimer = 0;
  private godMode = false;
  private pacifistMode = false;
  private pacifistScoreAccum = 0;
  private highScores: number[] = [];
  private difficultyRate = 1;
  private playerSpeedMult = 1;
  private draggingSlider: 'difficulty' | 'speed' | null = null;
  private sliderWasUsed = false;
  private readonly playerColors = [
    '#fff', '#ff4444', '#ff8844', '#ffdd44',
    '#44ff44', '#44ffff', '#4488ff', '#ff44ff', '#ff88cc',
  ];
  private selectedColorIndex = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private ctx: CanvasRenderingContext2D
  ) {
    this.input = new Input(canvas);
    this.player = new Player(canvas.width / 2, canvas.height * 0.7);
    this.enemyBullets = new BulletPool(5000);
    this.playerBullets = new BulletPool(100);
    this.patterns = new PatternManager();
    this.highScores = loadScores();

    canvas.addEventListener('mousedown', (e) => {
      if (this.state !== 'title') return;
      const colorHit = this.hitTestColor(e.clientX, e.clientY);
      if (colorHit >= 0) {
        this.selectedColorIndex = colorHit;
        this.player.color = this.playerColors[colorHit];
        this.sliderWasUsed = true;
        return;
      }
      const hit = this.hitTestSlider(e.clientX, e.clientY);
      if (hit) {
        this.draggingSlider = hit;
        this.sliderWasUsed = true;
        this.updateSliderValue(e.clientX);
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (this.draggingSlider) this.updateSliderValue(e.clientX);
    });

    canvas.addEventListener('mouseup', () => {
      this.draggingSlider = null;
    });

    canvas.addEventListener('click', () => {
      if (this.sliderWasUsed) {
        this.sliderWasUsed = false;
        return;
      }
      if (this.state === 'title') {
        this.startGame();
      } else if (this.state === 'gameover') {
        this.state = 'title';
        this.enemyBullets.clear();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyG' && this.state !== 'playing') {
        this.godMode = !this.godMode;
      }
      if (e.code === 'KeyP' && this.state !== 'playing') {
        this.pacifistMode = !this.pacifistMode;
      }
      if (e.code === 'KeyM' && this.state !== 'playing') {
        this.patternMode = this.patternMode === 'SCal' ? 'exo' : 'SCal';
      }
      if (e.code === 'KeyF') {
        if (!document.fullscreenElement) {
          canvas.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
      if (e.code === 'Escape' && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  private startGame() {
    const w = this.canvas.width, h = this.canvas.height;
    this.player.reset(w / 2, h * 0.7);
    this.enemyBullets.clear();
    this.playerBullets.clear();
    this.patterns = this.patternMode === 'exo' ? new ExoPatternManager() : new PatternManager();
    this.patterns.difficultyRate = this.difficultyRate;
    this.player.speedMultiplier = this.playerSpeedMult;
    this.score = 0;
    this.shootCooldown = 0;
    this.shakeTimer = 0;
    this.pacifistScoreAccum = 0;

    this.targets = [];
    if (!this.pacifistMode) {
      for (let i = 0; i < 2; i++) {
        this.targets.push(spawnTarget(w, h, this.player.x, this.player.y));
      }
    }

    this.state = 'playing';
  }

  update(dt: number) {
    const w = this.canvas.width, h = this.canvas.height;

    if (this.state !== 'playing') return;

    this.player.update(dt, this.input, w, h);

    if (!this.pacifistMode) {
      this.shootCooldown -= dt;
      if (this.input.mouseDown && this.shootCooldown <= 0) {
        this.shootCooldown = 0.12;
        this.firePlayerBullet();
      }
    }

    this.patterns.update(dt, this.enemyBullets, this.player.x, this.player.y, w, h);

    this.updateEnemyBullets(dt, w, h);

    if (!this.pacifistMode) {
      this.updatePlayerBullets(dt, w, h);
      this.checkBulletCollisions();
      for (const t of this.targets) updateTarget(t, dt);
    }

    this.checkPlayerHit();

    if (this.pacifistMode) {
      // Score ticks up gradually, scaling with difficulty setting and elapsed time
      this.pacifistScoreAccum += dt * this.difficultyRate * (1 + this.patterns.difficulty * 0.5);
      while (this.pacifistScoreAccum >= 0.4) {
        this.pacifistScoreAccum -= 0.4;
        this.score++;
      }
    } else {
      this.checkTargetHit(w, h);
    }

    if (this.shakeTimer > 0) this.shakeTimer -= dt;

    if (this.player.lives <= 0) {
      this.state = 'gameover';
      if (!this.godMode) {
        this.highScores = saveScore(this.score);
      }
    }
  }

  private firePlayerBullet() {
    const angle = this.player.gunAngle;
    const r = this.player.radius;
    const tipX = this.player.x + Math.cos(angle) * (r * 2.4);
    const tipY = this.player.y + Math.sin(angle) * (r * 2.4);
    this.playerBullets.spawn(
      tipX, tipY,
      Math.cos(angle) * 900, Math.sin(angle) * 900,
      2, STYLE_PLAYER
    );
  }

  private updateEnemyBullets(dt: number, w: number, h: number) {
    const pool = this.enemyBullets;
    for (let i = pool.count - 1; i >= 0; i--) {
      const b = pool.bullets[i];

      if (b.homing && b.explodesAt > 0 && b.age < b.explodesAt * 0.8) {
        const desiredAngle = Math.atan2(this.player.y - b.y, this.player.x - b.x);
        const currentAngle = Math.atan2(b.vy, b.vx);
        let angleDiff = desiredAngle - currentAngle;
        angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        const newAngle = currentAngle + angleDiff * b.homingStrength * dt;
        b.vx = Math.cos(newAngle) * speed;
        b.vy = Math.sin(newAngle) * speed;
      }

      if (b.explodesAt > 0 && b.age >= b.explodesAt) {
        for (let j = 0; j < b.explodeCount; j++) {
          const a = (Math.PI * 2 / b.explodeCount) * j;
          pool.spawn(b.x, b.y, Math.cos(a) * b.explodeSpeed, Math.sin(a) * b.explodeSpeed, 6, STYLE_RING);
        }
        pool.remove(i);
        continue;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.age += dt;

      const margin = 60;
      if (b.x < -margin || b.x > w + margin || b.y < -margin || b.y > h + margin) {
        pool.remove(i);
      }
    }
  }

  private updatePlayerBullets(dt: number, w: number, h: number) {
    const pool = this.playerBullets;
    for (let i = pool.count - 1; i >= 0; i--) {
      const b = pool.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.age += dt;
      if (b.x < -20 || b.x > w + 20 || b.y < -20 || b.y > h + 20) {
        pool.remove(i);
      }
    }
  }

  // Each player bullet destroys one enemy bullet, both consumed
  private checkBulletCollisions() {
    const pPool = this.playerBullets;
    const ePool = this.enemyBullets;

    for (let i = pPool.count - 1; i >= 0; i--) {
      const pb = pPool.bullets[i];

      for (let j = ePool.count - 1; j >= 0; j--) {
        const eb = ePool.bullets[j];
        const dx = pb.x - eb.x, dy = pb.y - eb.y;
        const minDist = pb.radius + eb.radius;
        if (dx * dx + dy * dy < minDist * minDist) {
          ePool.remove(j);
          pPool.remove(i);
          break;
        }
      }
    }
  }

  private checkPlayerHit() {
    if (this.player.invincibleTimer > 0) return;

    const px = this.player.x, py = this.player.y;
    const hr = this.player.hitboxRadius;
    const pool = this.enemyBullets;

    for (let i = pool.count - 1; i >= 0; i--) {
      const b = pool.bullets[i];
      const dx = b.x - px, dy = b.y - py;
      const minDist = b.radius + hr;
      if (dx * dx + dy * dy < minDist * minDist) {
        let wasHit = false;
        if (this.godMode) {
          this.player.invincibleTimer = 2.0;
          wasHit = true;
        } else {
          wasHit = this.player.hit();
        }
        if (wasHit) {
          this.shakeTimer = 0.3;
          for (let j = pool.count - 1; j >= 0; j--) {
            const c = pool.bullets[j];
            const d2 = (c.x - px) * (c.x - px) + (c.y - py) * (c.y - py);
            if (d2 < 100 * 100) pool.remove(j);
          }
          break;
        }
      }
    }
  }

  private checkTargetHit(w: number, h: number) {
    const pPool = this.playerBullets;
    for (const t of this.targets) {
      if (t.respawnTimer > 0) continue;
      for (let i = pPool.count - 1; i >= 0; i--) {
        const b = pPool.bullets[i];
        const dx = b.x - t.x, dy = b.y - t.y;
        const minDist = b.radius + t.radius;
        if (dx * dx + dy * dy < minDist * minDist) {
          this.score += Math.floor(10 * this.difficultyRate);
          pPool.remove(i);
          const nt = spawnTarget(w, h, this.player.x, this.player.y);
          t.x = nt.x;
          t.y = nt.y;
          t.respawnTimer = 0.5;
          break;
        }
      }
    }
  }

  render(alpha: number) {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;

    ctx.fillStyle = '#000';
    ctx.fillRect(-10, -10, w + 20, h + 20);

    if (this.state === 'title') {
      this.renderTitle(ctx, w, h);
      return;
    }

    // Screen shake only during gameplay
    const shaking = this.shakeTimer > 0 && this.state === 'playing';
    if (shaking) {
      ctx.save();
      const intensity = this.shakeTimer * 20;
      ctx.translate((Math.random() - 0.5) * intensity, (Math.random() - 0.5) * intensity);
    }

    if (!this.pacifistMode) {
      for (const t of this.targets) renderTarget(ctx, t);
    }
    renderBullets(ctx, this.enemyBullets);
    if (!this.pacifistMode) {
      renderBullets(ctx, this.playerBullets, this.player.color);
    }

    if (this.state === 'playing') {
      this.player.render(ctx, alpha, this.pacifistMode);
    }

    this.renderUI(ctx, w);

    if (shaking) ctx.restore();

    if (this.state === 'gameover') {
      this.renderGameOver(ctx, w, h);
    }
  }

  // Layout constants for title screen (relative to center Y)
  private titleLayout(h: number) {
    const cy = h / 2;
    return {
      cy,
      colorY: cy - 20,
      diffLabelY: cy + 20,
      diffTrackY: cy + 38,
      speedLabelY: cy + 68,
      speedTrackY: cy + 86,
      startY: cy + 130,
    };
  }

  private renderTitle(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const L = this.titleLayout(h);

    // --- Title top center ---
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText('BULLET HELL', w / 2, L.cy - 100);

    // --- Center panel: color picker, sliders, start ---
    this.renderColorPicker(ctx, w, L.colorY);

    this.renderSlider(ctx, 'Difficulty', this.difficultyRate, 0.5, 3.0, w, L.diffLabelY, L.diffTrackY);
    this.renderSlider(ctx, 'Speed', this.playerSpeedMult, 0.5, 2.0, w, L.speedLabelY, L.speedTrackY);

    ctx.textAlign = 'center';
    ctx.font = '18px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText('Click to start', w / 2, L.startY);

    // --- Bottom-left: controls ---
    ctx.textAlign = 'left';
    ctx.font = '13px monospace';
    ctx.fillStyle = '#555';
    const cx = 24, by = h - 24;
    ctx.fillText('WASD / Arrows \u2014 Move', cx, by - 72);
    ctx.fillText('Shift \u2014 Focus', cx, by - 54);
    ctx.fillText('Click \u2014 Shoot', cx, by - 36);
    ctx.fillText('F \u2014 Fullscreen', cx, by - 18);
    ctx.fillText('Esc \u2014 Exit Fullscreen', cx, by);

    // --- Bottom-right: mode toggles ---
    ctx.textAlign = 'right';
    ctx.font = '14px monospace';
    const rx = w - 24;
    ctx.fillStyle = '#fff';
    ctx.fillText(`[M] Mode: ${this.patternMode === 'SCal' ? 'SCal' : 'Exo Mechs'}`, rx, by - 36);
    ctx.fillStyle = this.pacifistMode ? '#fff' : '#444';
    ctx.fillText(`[P] Pacifist: ${this.pacifistMode ? 'ON' : 'OFF'}`, rx, by - 18);
    ctx.fillStyle = this.godMode ? '#fff' : '#444';
    ctx.fillText(`[G] God Mode: ${this.godMode ? 'ON' : 'OFF'}`, rx, by);

    // --- Top-right: scoreboard ---
    this.renderScoreboard(ctx, w - 100, 40);

    ctx.textAlign = 'left';
  }

  private renderUI(ctx: CanvasRenderingContext2D, w: number) {
    ctx.font = '16px monospace';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(`${this.score}`, 20, 30);

    ctx.textAlign = 'right';
    if (this.pacifistMode) {
      ctx.fillText('PACIFIST', w - 20, 50);
    }
    if (this.godMode) {
      ctx.fillText('GODMODE', w - 20, 30);
    } else {
      let lives = '';
      for (let i = 0; i < this.player.lives; i++) lives += '\u2665 ';
      ctx.fillText(lives.trim(), w - 20, 30);
    }

    ctx.textAlign = 'left';
  }

  private renderGameOver(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';

    ctx.font = 'bold 48px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText('GAME OVER', w / 2, h / 2 - 30);

    ctx.font = '20px monospace';
    ctx.fillText(`${this.score}`, w / 2, h / 2 + 15);

    ctx.font = '16px monospace';
    ctx.fillStyle = '#888';
    ctx.fillText('Click to continue', w / 2, h / 2 + 55);

    ctx.font = '14px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText(`[M] Mode: ${this.patternMode === 'SCal' ? 'SCal' : 'Exo Mechs'}`, w / 2, h / 2 + 85);
    ctx.fillStyle = this.pacifistMode ? '#fff' : '#555';
    ctx.fillText(`[P] Pacifist: ${this.pacifistMode ? 'ON' : 'OFF'}`, w / 2, h / 2 + 105);
    ctx.fillStyle = this.godMode ? '#fff' : '#555';
    ctx.fillText(`[G] God Mode: ${this.godMode ? 'ON' : 'OFF'}`, w / 2, h / 2 + 125);

    this.renderScoreboard(ctx, w / 2, h / 2 + 165, 'center');

    ctx.textAlign = 'left';
  }

  private renderScoreboard(ctx: CanvasRenderingContext2D, cx: number, topY: number, align: CanvasTextAlign = 'right') {
    if (this.highScores.length === 0) return;

    ctx.textAlign = align;
    ctx.font = '14px monospace';
    ctx.fillStyle = '#555';
    ctx.fillText('TOP SCORES', cx, topY);

    ctx.font = '14px monospace';
    for (let i = 0; i < this.highScores.length; i++) {
      const isLatest = this.state === 'gameover' && this.highScores[i] === this.score;
      ctx.fillStyle = isLatest ? '#fff' : '#444';
      ctx.fillText(`${i + 1}. ${this.highScores[i]}`, cx, topY + 20 + i * 18);
    }
  }

  private renderSlider(
    ctx: CanvasRenderingContext2D, label: string, value: number,
    min: number, max: number, canvasW: number, labelY: number, trackY: number
  ) {
    const trackWidth = 200;
    const trackX = canvasW / 2 - trackWidth / 2;
    const t = (value - min) / (max - min);

    ctx.textAlign = 'center';
    ctx.font = '14px monospace';
    ctx.fillStyle = '#888';
    ctx.fillText(`${label}: ${value.toFixed(1)}x`, canvasW / 2, labelY);

    // Track
    ctx.fillStyle = '#333';
    ctx.fillRect(trackX, trackY - 2, trackWidth, 4);

    // Filled portion
    ctx.fillStyle = '#666';
    ctx.fillRect(trackX, trackY - 2, t * trackWidth, 4);

    // Thumb
    ctx.beginPath();
    ctx.arc(trackX + t * trackWidth, trackY, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }

  private hitTestSlider(mx: number, my: number): 'difficulty' | 'speed' | null {
    const w = this.canvas.width, h = this.canvas.height;
    const L = this.titleLayout(h);
    const trackWidth = 200;
    const trackX = w / 2 - trackWidth / 2;

    if (mx >= trackX - 10 && mx <= trackX + trackWidth + 10) {
      if (Math.abs(my - L.diffTrackY) < 16) return 'difficulty';
      if (Math.abs(my - L.speedTrackY) < 16) return 'speed';
    }
    return null;
  }

  private updateSliderValue(mx: number) {
    const w = this.canvas.width;
    const trackWidth = 200;
    const trackX = w / 2 - trackWidth / 2;
    const t = Math.max(0, Math.min(1, (mx - trackX) / trackWidth));

    if (this.draggingSlider === 'difficulty') {
      this.difficultyRate = Math.round((0.5 + t * 2.5) * 10) / 10;
    } else if (this.draggingSlider === 'speed') {
      this.playerSpeedMult = Math.round((0.5 + t * 1.5) * 10) / 10;
    }
  }

  private renderColorPicker(ctx: CanvasRenderingContext2D, w: number, y: number) {
    const count = this.playerColors.length;
    const r = 10;
    const gap = 28;
    const totalW = (count - 1) * gap;
    const startX = w / 2 - totalW / 2;

    for (let i = 0; i < count; i++) {
      const cx = startX + i * gap;
      ctx.beginPath();
      ctx.arc(cx, y, r, 0, Math.PI * 2);
      ctx.fillStyle = this.playerColors[i];
      ctx.fill();

      if (i === this.selectedColorIndex) {
        ctx.beginPath();
        ctx.arc(cx, y, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  private hitTestColor(mx: number, my: number): number {
    const w = this.canvas.width, h = this.canvas.height;
    const L = this.titleLayout(h);
    const y = L.colorY;
    const count = this.playerColors.length;
    const gap = 28;
    const totalW = (count - 1) * gap;
    const startX = w / 2 - totalW / 2;

    for (let i = 0; i < count; i++) {
      const cx = startX + i * gap;
      const dx = mx - cx, dy = my - y;
      if (dx * dx + dy * dy < 14 * 14) return i;
    }
    return -1;
  }
}
