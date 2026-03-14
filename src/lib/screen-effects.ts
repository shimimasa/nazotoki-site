/**
 * Screen effects for dramatic game-feel moments.
 * Phase 162: shake, flash, pulse — pure CSS, no dependencies.
 */

/** Shake the screen with configurable intensity and duration */
export function shakeScreen(intensity = 4, duration = 400) {
  const el = document.documentElement;
  const start = performance.now();
  let frame: number;

  function animate(now: number) {
    const elapsed = now - start;
    if (elapsed > duration) {
      el.style.transform = '';
      return;
    }
    const decay = 1 - elapsed / duration;
    const x = (Math.random() * 2 - 1) * intensity * decay;
    const y = (Math.random() * 2 - 1) * intensity * decay;
    el.style.transform = `translate(${x}px, ${y}px)`;
    frame = requestAnimationFrame(animate);
  }

  frame = requestAnimationFrame(animate);
  // Safety cleanup
  setTimeout(() => {
    cancelAnimationFrame(frame);
    el.style.transform = '';
  }, duration + 50);
}

/** Flash the screen with a color overlay */
export function flashScreen(color = 'rgba(255,255,255,0.6)', duration = 300) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: ${color};
    pointer-events: none;
    animation: screen-flash ${duration}ms ease-out forwards;
  `;

  // Inject keyframes if not already present
  if (!document.getElementById('screen-effects-style')) {
    const style = document.createElement('style');
    style.id = 'screen-effects-style';
    style.textContent = `
      @keyframes screen-flash {
        0% { opacity: 1; }
        100% { opacity: 0; }
      }
      @keyframes screen-pulse-border {
        0%, 100% { box-shadow: inset 0 0 30px rgba(239,68,68,0); }
        50% { box-shadow: inset 0 0 30px rgba(239,68,68,0.3); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), duration + 50);
}

/** Add a red pulsing vignette to the screen (returns cleanup function) */
export function pulseScreen(): () => void {
  const overlay = document.createElement('div');
  overlay.className = 'screen-pulse-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 40;
    pointer-events: none;
    animation: screen-pulse-border 1.5s ease-in-out infinite;
  `;

  // Inject keyframes if not already present
  if (!document.getElementById('screen-effects-style')) {
    const style = document.createElement('style');
    style.id = 'screen-effects-style';
    style.textContent = `
      @keyframes screen-flash {
        0% { opacity: 1; }
        100% { opacity: 0; }
      }
      @keyframes screen-pulse-border {
        0%, 100% { box-shadow: inset 0 0 30px rgba(239,68,68,0); }
        50% { box-shadow: inset 0 0 30px rgba(239,68,68,0.3); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(overlay);

  return () => overlay.remove();
}
