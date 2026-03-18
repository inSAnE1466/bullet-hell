export class Input {
  private keys = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    canvas.addEventListener('mousedown', () => { this.mouseDown = true; });
    canvas.addEventListener('mouseup', () => { this.mouseDown = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isLeft(): boolean { return this.keys.has('KeyA') || this.keys.has('ArrowLeft'); }
  isRight(): boolean { return this.keys.has('KeyD') || this.keys.has('ArrowRight'); }
  isUp(): boolean { return this.keys.has('KeyW') || this.keys.has('ArrowUp'); }
  isDown(): boolean { return this.keys.has('KeyS') || this.keys.has('ArrowDown'); }
  isFocus(): boolean { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }
}
