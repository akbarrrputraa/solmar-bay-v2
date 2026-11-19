// Solmar Bay 2 — input: keyboard + mouse state, with edge-triggered
// "pressed" events the game loop consumes once per frame.

export function createInput() {
  const keys = {};
  const pressed = new Set();
  let mouseX = 0, mouseY = 0;
  let mouseDown = false;
  let mouseClicked = false;

  const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '];

  function onKeyDown(e) {
    if (GAME_KEYS.includes(e.key)) e.preventDefault();
    if (!keys[e.code]) pressed.add(e.code);
    keys[e.code] = true;
  }
  function onKeyUp(e) { keys[e.code] = false; }
  function onMouseMove(e) { mouseX = e.clientX; mouseY = e.clientY; }
  function onMouseDown(e) {
    if (e.button === 0) { mouseDown = true; mouseClicked = true; }
  }
  function onMouseUp(e) { if (e.button === 0) mouseDown = false; }
  function onBlur() {
    for (const k of Object.keys(keys)) keys[k] = false;
    mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);

  return {
    /** Held? (KeyW, ArrowUp, Space, ShiftLeft, KeyE, ...) */
    down(code) { return !!keys[code]; },
    /** WASD/arrows as a -1..1 pair, camera-relative handled by the caller. */
    axes() {
      const x = (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0) - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
      const y = (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0) - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0);
      return { x, y };
    },
    sprint() { return this.down('ShiftLeft') || this.down('ShiftRight'); },
    /** True once, the frame the key went down. Consumed by endFrame(). */
    wasPressed(code) { return pressed.has(code); },
    anyPressed(codes) { return codes.some((c) => pressed.has(c)); },
    mouse() { return { x: mouseX, y: mouseY, down: mouseDown, clicked: mouseClicked }; },
    consumeClick() { mouseClicked = false; },
    endFrame() { pressed.clear(); mouseClicked = false; },
  };
}
