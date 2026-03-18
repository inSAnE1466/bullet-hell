import { Input } from './input';

export class Player {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  readonly radius = 12;
  readonly hitboxRadius = 3;
  readonly speed = 460;
  readonly focusMultiplier = 0.4;
  speedMultiplier = 1;
  color = '#fff';
  gunAngle = 0;
  focused = false;
  lives = 5;
  invincibleTimer = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
  }

  update(dt: number, input: Input, w: number, h: number) {
    this.prevX = this.x;
    this.prevY = this.y;

    let dx = 0, dy = 0;
    if (input.isLeft()) dx -= 1;
    if (input.isRight()) dx += 1;
    if (input.isUp()) dy -= 1;
    if (input.isDown()) dy += 1;

    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }

    this.focused = input.isFocus();
    const spd = this.speed * this.speedMultiplier * (this.focused ? this.focusMultiplier : 1);
    this.x += dx * spd * dt;
    this.y += dy * spd * dt;

    const m = this.radius;
    this.x = Math.max(m, Math.min(w - m, this.x));
    this.y = Math.max(m, Math.min(h - m, this.y));

    this.gunAngle = Math.atan2(input.mouseY - this.y, input.mouseX - this.x);

    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;
  }

  hit(): boolean {
    if (this.invincibleTimer > 0) return false;
    this.lives--;
    this.invincibleTimer = 2.0;
    return true;
  }

  reset(x: number, y: number) {
    this.x = x; this.y = y;
    this.prevX = x; this.prevY = y;
    this.lives = 5;
    this.invincibleTimer = 0;
  }

  render(ctx: CanvasRenderingContext2D, alpha: number, hideGun = false) {
    const x = this.prevX + (this.x - this.prevX) * alpha;
    const y = this.prevY + (this.y - this.prevY) * alpha;

    if (this.invincibleTimer > 0 && Math.floor(this.invincibleTimer * 10) % 2 === 0) {
      ctx.globalAlpha = 0.25;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = this.color;

    if (!hideGun) {
      ctx.rotate(this.gunAngle);
      // Sidearm — barrel, slide, grip
      const r = this.radius;
      const barrelTip = r * 2.4;
      // Barrel (thin, full length)
      ctx.fillRect(r - 2, -1.5, barrelTip - r + 2, 3);
      // Slide (wider section at back)
      ctx.fillRect(r - 2, -3, 9, 6);
      // Grip (perpendicular nub below slide)
      ctx.fillRect(r + 1, 3, 3, 6);
    }

    // Ball
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Focus hitbox indicator
    if (this.focused) {
      ctx.beginPath();
      ctx.arc(x, y, this.hitboxRadius + 2, 0, Math.PI * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }
}
