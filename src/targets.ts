export interface Target {
  x: number;
  y: number;
  radius: number;
  respawnTimer: number;
}

export function spawnTarget(w: number, h: number, px: number, py: number): Target {
  for (let attempt = 0; attempt < 50; attempt++) {
    const x = 80 + Math.random() * (w - 160);
    const y = 80 + Math.random() * (h - 160);
    if (Math.hypot(x - px, y - py) > 200) {
      return { x, y, radius: 14, respawnTimer: 0 };
    }
  }
  const x = 80 + Math.random() * (w - 160);
  const y = 80 + Math.random() * (h - 160);
  return { x, y, radius: 14, respawnTimer: 0 };
}

export function updateTarget(t: Target, dt: number) {
  if (t.respawnTimer > 0) t.respawnTimer -= dt;
}

export function renderTarget(ctx: CanvasRenderingContext2D, t: Target) {
  if (t.respawnTimer > 0) return;

  // Simple crosshair circle
  ctx.beginPath();
  ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Cross
  ctx.beginPath();
  ctx.moveTo(t.x - t.radius, t.y);
  ctx.lineTo(t.x + t.radius, t.y);
  ctx.moveTo(t.x, t.y - t.radius);
  ctx.lineTo(t.x, t.y + t.radius);
  ctx.lineWidth = 1;
  ctx.stroke();
}
