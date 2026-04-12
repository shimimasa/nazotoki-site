import { shakeScreen, flashScreen, pulseScreen } from '../../src/lib/screen-effects';

describe('shakeScreen', () => {
  it('applies transform to documentElement and resets after duration', async () => {
    shakeScreen(4, 50);
    // During animation, transform should be set
    await new Promise(r => setTimeout(r, 10));
    // After duration + safety margin, transform should be cleared
    await new Promise(r => setTimeout(r, 100));
    expect(document.documentElement.style.transform).toBe('');
  });

  it('does not throw with default parameters', () => {
    expect(() => shakeScreen()).not.toThrow();
  });
});

describe('flashScreen', () => {
  it('adds and removes overlay element', async () => {
    const before = document.body.children.length;
    flashScreen('rgba(255,255,255,0.6)', 50);
    // Overlay should be added as child of body
    expect(document.body.children.length).toBeGreaterThan(before);
    // After duration + safety margin, overlay should be removed
    await new Promise(r => setTimeout(r, 150));
    expect(document.body.children.length).toBe(before);
  });

  it('injects keyframe style element', () => {
    flashScreen('rgba(0,0,0,0.5)', 50);
    const styleEl = document.getElementById('screen-effects-style');
    expect(styleEl).not.toBeNull();
    expect(styleEl?.textContent).toContain('@keyframes screen-flash');
  });
});

describe('pulseScreen', () => {
  it('returns a cleanup function that removes overlay', () => {
    const cleanup = pulseScreen();
    const overlay = document.querySelector('.screen-pulse-overlay');
    expect(overlay).not.toBeNull();

    cleanup();
    const removed = document.querySelector('.screen-pulse-overlay');
    expect(removed).toBeNull();
  });
});
