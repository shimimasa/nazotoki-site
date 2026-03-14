/**
 * Sound Effects (SE) engine using Web Audio API.
 * All sounds are synthesized — no external audio files needed.
 * Designed for classroom use: teacher can toggle ON/OFF.
 *
 * Phase 162: Dramatic game-feel upgrade.
 * - Multi-oscillator sounds with detuning for richness
 * - Filter sweeps for tension/impact
 * - New SE: evidence slam, tension build, correct/incorrect, dramatic reveal
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

/** Initialize from localStorage. Defaults to ON if never set.
 *  Also sets up a one-time user gesture listener to unlock AudioContext. */
export function initSound(): void {
  try {
    const saved = localStorage.getItem('nazotoki-se-enabled');
    enabled = saved !== '0'; // ON by default; only OFF if explicitly disabled
  } catch {
    enabled = true;
  }
  // Unlock AudioContext on first user interaction (browser autoplay policy)
  if (enabled && typeof document !== 'undefined') {
    const unlock = () => {
      getContext(); // Creates/resumes AudioContext
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('click', unlock, { once: true });
    document.addEventListener('touchstart', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
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

/** Play a rich chord with multiple detuned oscillators */
function playChord(
  freqs: number[],
  duration: number,
  type: OscillatorType = 'sine',
  volume = 0.15,
  stagger = 0,
) {
  if (!enabled) return;
  const ac = getContext();
  if (!ac) return;
  freqs.forEach((freq, i) => {
    const t = ac.currentTime + i * stagger;
    // Main oscillator
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + duration);
    // Detuned copy for richness
    const osc2 = ac.createOscillator();
    const gain2 = ac.createGain();
    osc2.type = type;
    osc2.frequency.value = freq * 1.003; // slight detune
    gain2.gain.setValueAtTime(volume * 0.5, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc2.connect(gain2);
    gain2.connect(ac.destination);
    osc2.start(t);
    osc2.stop(t + duration);
  });
}

/** Noise burst (impact/hit sound) */
function playNoise(duration: number, volume = 0.2) {
  if (!enabled) return;
  const ac = getContext();
  if (!ac) return;
  const bufferSize = ac.sampleRate * duration;
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
  }
  const source = ac.createBufferSource();
  source.buffer = buffer;
  // Low-pass filter for thump-like quality
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 800;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  source.start(ac.currentTime);
}

// ─── Game sound effects ───

/** Countdown tick (3, 2, 1) — enhanced with sub-bass impact */
export function playCountdownTick() {
  if (!enabled) return;
  const ac = getContext();
  if (!ac) return;
  // High tick
  playTone(880, 0.15, 'sine', 0.25);
  // Sub impact
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, ac.currentTime + 0.15);
  gain.gain.setValueAtTime(0.15, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + 0.15);
}

/** Countdown final (0 — reveal!) — dramatic rising chord with shimmer */
export function playCountdownReveal() {
  if (!enabled) return;
  const ac = getContext();
  if (!ac) return;
  // Dramatic rising chord: C5 → E5 → G5 → C6
  const freqs = [523, 659, 784, 1047];
  freqs.forEach((freq, i) => {
    const t = ac.currentTime + i * 0.06;
    // Main
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.8);
    // Octave shimmer
    const osc2 = ac.createOscillator();
    const gain2 = ac.createGain();
    osc2.type = 'triangle';
    osc2.frequency.value = freq * 2;
    gain2.gain.setValueAtTime(0.06, t + 0.03);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc2.connect(gain2);
    gain2.connect(ac.destination);
    osc2.start(t + 0.03);
    osc2.stop(t + 0.6);
  });
}

/** Timer expired warning */
export function playTimerExpired() {
  if (!enabled) return;
  // Two quick beeps
  playTone(660, 0.2, 'square', 0.15);
  setTimeout(() => playTone(660, 0.2, 'square', 0.15), 250);
}

/** Vote submitted confirmation — ascending arpeggio */
export function playVoteConfirm() {
  if (!enabled) return;
  playChord([440, 554, 660], 0.3, 'sine', 0.15, 0.06);
}

/** Phase transition chime — rich bell with overtones */
export function playPhaseTransition() {
  if (!enabled) return;
  const ac = getContext();
  if (!ac) return;
  // Bell fundamental + 3rd partial
  const t = ac.currentTime;
  [
    { freq: 523, type: 'triangle' as OscillatorType, vol: 0.2, dur: 1.0 },
    { freq: 1318, type: 'sine' as OscillatorType, vol: 0.08, dur: 0.6 },
    { freq: 784, type: 'sine' as OscillatorType, vol: 0.1, dur: 0.8 },
  ].forEach(({ freq, type, vol, dur }) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + dur);
  });
}

/** Evidence discovered — dramatic discovery stinger */
export function playEvidenceFound() {
  if (!enabled) return;
  const ac = getContext();
  if (!ac) return;
  const t = ac.currentTime;
  // Impact thump
  playNoise(0.08, 0.25);
  // Rising discovery tone: G4 → D5 → G5
  [392, 587, 784].forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const start = t + 0.03 + i * 0.07;
    gain.gain.setValueAtTime(0.18, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(start);
    osc.stop(start + 0.4);
  });
}

// ─── New dramatic sound effects (Phase 162) ───

/** Evidence card "slam" — heavy impact for dramatic reveals */
export function playEvidenceSlam() {
  if (!enabled) return;
  const ac = getContext();
  if (!ac) return;
  const t = ac.currentTime;
  // Low impact thud
  const bass = ac.createOscillator();
  const bassGain = ac.createGain();
  bass.type = 'sine';
  bass.frequency.setValueAtTime(150, t);
  bass.frequency.exponentialRampToValueAtTime(40, t + 0.2);
  bassGain.gain.setValueAtTime(0.35, t);
  bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  bass.connect(bassGain);
  bassGain.connect(ac.destination);
  bass.start(t);
  bass.stop(t + 0.25);
  // Noise impact
  playNoise(0.06, 0.3);
  // Short metallic ring
  const ring = ac.createOscillator();
  const ringGain = ac.createGain();
  ring.type = 'square';
  ring.frequency.value = 1200;
  ringGain.gain.setValueAtTime(0.06, t);
  ringGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  ring.connect(ringGain);
  ringGain.connect(ac.destination);
  ring.start(t);
  ring.stop(t + 0.15);
}

/** Tension building — low rumble that rises (for twist/pre-reveal moments) */
export function playTensionRise() {
  if (!enabled) return;
  const ac = getContext();
  if (!ac) return;
  const t = ac.currentTime;
  const duration = 1.5;
  // Rising low drone
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(80, t);
  osc.frequency.exponentialRampToValueAtTime(200, t + duration);
  // Low-pass filter that opens up
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(200, t);
  filter.frequency.exponentialRampToValueAtTime(1500, t + duration);
  gain.gain.setValueAtTime(0.08, t);
  gain.gain.linearRampToValueAtTime(0.15, t + duration * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration);
}

/** Correct answer — triumphant fanfare */
export function playCorrectAnswer() {
  if (!enabled) return;
  // Major chord arpeggio: C5 → E5 → G5 → C6
  playChord([523, 659, 784, 1047], 0.8, 'triangle', 0.12, 0.1);
}

/** Incorrect answer — descending minor tone */
export function playIncorrectAnswer() {
  if (!enabled) return;
  const ac = getContext();
  if (!ac) return;
  const t = ac.currentTime;
  // Descending minor: E4 → C4
  [330, 262].forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const start = t + i * 0.15;
    gain.gain.setValueAtTime(0.15, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(start);
    osc.stop(start + 0.4);
  });
}

/** Dramatic reveal stinger — for truth phase entrance */
export function playDramaticReveal() {
  if (!enabled) return;
  const ac = getContext();
  if (!ac) return;
  const t = ac.currentTime;
  // Reverse cymbal feel (filtered noise rise)
  const bufLen = ac.sampleRate * 0.6;
  const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.pow(i / bufLen, 2);
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filt = ac.createBiquadFilter();
  filt.type = 'highpass';
  filt.frequency.setValueAtTime(2000, t);
  filt.frequency.exponentialRampToValueAtTime(500, t + 0.6);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.2, t + 0.5);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  src.connect(filt);
  filt.connect(g);
  g.connect(ac.destination);
  src.start(t);
  // Impact chord at end
  setTimeout(() => {
    playChord([262, 330, 392, 523], 1.0, 'triangle', 0.12, 0);
  }, 550);
}

/** Vote sealed — all votes locked in, tense moment */
export function playVoteSeal() {
  if (!enabled) return;
  const ac = getContext();
  if (!ac) return;
  const t = ac.currentTime;
  // Deep lock sound: descending + noise
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, t);
  osc.frequency.exponentialRampToValueAtTime(80, t + 0.3);
  gain.gain.setValueAtTime(0.25, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.35);
  playNoise(0.05, 0.15);
}

/** Heartbeat pulse — for critical timer moments */
export function playHeartbeat() {
  if (!enabled) return;
  const ac = getContext();
  if (!ac) return;
  const t = ac.currentTime;
  // Double-beat pattern like a heart
  [0, 0.12].forEach((delay) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, t + delay);
    osc.frequency.exponentialRampToValueAtTime(40, t + delay + 0.1);
    gain.gain.setValueAtTime(0.2, t + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.15);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t + delay);
    osc.stop(t + delay + 0.15);
  });
}

/** All evidence found celebration */
export function playAllEvidenceFound() {
  if (!enabled) return;
  // Ascending major scale fragment: C5 → D5 → E5 → G5 → C6
  playChord([523, 587, 659, 784, 1047], 0.6, 'triangle', 0.1, 0.08);
}
