import { Game } from './game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

const game = new Game(canvas, ctx);

const PHYSICS_DT = 1 / 120;
let lastTime = -1;
let accumulator = 0;

function loop(time: number) {
  if (lastTime < 0) {
    lastTime = time;
    requestAnimationFrame(loop);
    return;
  }

  const frameTime = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;
  accumulator += frameTime;

  while (accumulator >= PHYSICS_DT) {
    game.update(PHYSICS_DT);
    accumulator -= PHYSICS_DT;
  }

  game.render(accumulator / PHYSICS_DT);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
