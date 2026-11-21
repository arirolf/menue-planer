// Svelte action: use:longpress={callback}. Holding ~500 ms (or a right-click / the
// browser's context menu) calls callback; the click that follows a long press is
// swallowed so buttons inside (e.g. the checkbox) don't fire.
const DELAY = 500;
const MOVE_TOLERANCE = 10;

export function longpress(node, callback) {
  let onLong = callback;
  let timer = null;
  let start = null;
  let fired = false;

  const cancel = () => {
    clearTimeout(timer);
    timer = null;
  };

  const fire = () => {
    fired = true;
    navigator.vibrate?.(30);
    onLong();
  };

  function down(event) {
    if (event.button > 0) return; // right-click is handled by contextmenu
    fired = false;
    start = { x: event.clientX, y: event.clientY };
    cancel();
    timer = setTimeout(() => {
      timer = null;
      fire();
    }, DELAY);
  }

  function move(event) {
    if (timer && Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE) cancel();
  }

  // Capture phase: runs before the buttons' own click handlers
  function click(event) {
    if (!fired) return;
    fired = false;
    event.preventDefault();
    event.stopPropagation();
  }

  // Desktop right-click, and Android's own long-press menu
  function contextmenu(event) {
    event.preventDefault();
    if (fired) return;
    cancel();
    fire();
  }

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', cancel);
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('pointerleave', cancel);
  node.addEventListener('click', click, true);
  node.addEventListener('contextmenu', contextmenu);

  return {
    update(callback) {
      onLong = callback;
    },
    destroy() {
      cancel();
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', cancel);
      node.removeEventListener('pointercancel', cancel);
      node.removeEventListener('pointerleave', cancel);
      node.removeEventListener('click', click, true);
      node.removeEventListener('contextmenu', contextmenu);
    },
  };
}
