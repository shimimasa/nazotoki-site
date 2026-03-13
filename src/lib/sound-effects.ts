/**
 * Sound Effects (SE) engine using Web Audio API.
 * All sounds are synthesized — no external audio files needed.
 * Designed for classroom use: teacher can toggle ON/OFF.
 */

let ctx: AudioContext | null = null;
let enabled = false;

function getContext(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
  return ctx;
}

/** Toggle SE on/off. Returns new state.
 *  When enabling, creates/resumes AudioContext within user gesture to satisfy
 *  Safari/iOS autoplay policy — subsequent programmatic plays will work. */
export function toggleSound(): boolean {
  enabled = !enabled;
  if (enabled) {
    getContext(); // Unlock AudioContext on user gesture (required for iOS Safari)
  }
  try {
    localStorage.setItem('nazotoki-se-enabled', enabled ? '1' : '0');
  } catch { /* ignore */ }
  return enabled;
}

/** Check if SE is enabled */
export function isSoundEnabled(): boolean {
  return enabled;
}

/** Initialize from localStorage */
export function initSound(): void {
  try {
    const saved = localStorage.getItem('nazotoki-se-enabled');
    enabled = saved === '1';
  } catch {
    enabled = false;
  }
}

// ─── Sound primitives ───

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.3) {
  if (!enabled) return;
  const ac = getContext();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + duration);
}

// ─── Game sound effects ───

/** Countdown tick (3, 2, 1) */
export function playCountdownTick() {
  playTone(880, 0.15, 'sine', 0.25);
}

/** Countdown final (0 — reveal!) */
export function playCountdownReveal() {
  if (!enabled) return;
  const ac = getContext();
  if (!ac) return;
  // Rising chord: C5 → E5 → G5
  [523, 659, 784].forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = ac.currentTime + i * 0.08;
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  });
}

/** Timer expired warning */
export function playTimerExpired() {
  if (!enabled) return;
  // Two quick beeps
  playTone(660, 0.2, 'square', 0.15);
  setTimeout(() => playTone(660, 0.2, 'square', 0.15), 250);
}

/** Vote submitted confirmation */
export function playVoteConfirm() {
  if (!enabled) return;
  const ac = getContext();
  if (!ac) return;
  // Quick ascending two-note
  [440, 660].forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = ac.currentTime + i * 0.1;
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  });
}

/** Phase transition chime */
export function playPhaseTransition() {
  if (!enabled) return;
  const ac = getContext();
  if (!ac) return;
  // Gentle bell-like tone
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.value = 523; // C5
  gain.gain.setValueAtTime(0.25, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.8);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + 0.8);
}

/** Evidence discovered */
export function playEvidenceFound() {
  playTone(784, 0.3, 'triangle', 0.2); // G5
}
