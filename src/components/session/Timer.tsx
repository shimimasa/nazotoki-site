import { useEffect, useCallback, useRef } from 'preact/hooks';
import { playHeartbeat } from '../../lib/sound-effects';
import { pulseScreen } from '../../lib/screen-effects';

interface TimerProps {
  seconds: number;
  running: boolean;
  onTick: () => void;
  onToggle: () => void;
  onReset: (seconds: number) => void;
  onExpired?: () => void;
  defaultSeconds: number;
}

export default function Timer({
  seconds,
  running,
  onTick,
  onToggle,
  onReset,
  onExpired,
  defaultSeconds,
}: TimerProps) {
  const firedRef = useRef(false);

  useEffect(() => {
    // Reset fired flag when timer resets
    if (seconds > 0) firedRef.current = false;
  }, [seconds]);

  useEffect(() => {
    if (seconds === 0 && !firedRef.current && onExpired && defaultSeconds > 0) {
      firedRef.current = true;
      onExpired();
    }
  }, [seconds, onExpired, defaultSeconds]);

  useEffect(() => {
    if (!running || seconds <= 0) return;
    const id = setInterval(onTick, 1000);
    return () => clearInterval(id);
  }, [running, seconds, onTick]);

  // Heartbeat SE every 2 seconds when critical (≤10s)
  useEffect(() => {
    if (!running || seconds <= 0 || seconds > 10) return;
    if (seconds % 2 === 0) playHeartbeat();
  }, [running, seconds]);

  // Red screen pulse when urgent (≤30s)
  const pulseCleanupRef = useRef<(() => void) | null>(null);
  const shouldPulse = running && seconds > 0 && seconds <= 30;
  useEffect(() => {
    if (shouldPulse && !pulseCleanupRef.current) {
      pulseCleanupRef.current = pulseScreen();
    } else if (!shouldPulse && pulseCleanupRef.current) {
      pulseCleanupRef.current();
      pulseCleanupRef.current = null;
    }
    return () => {
      if (pulseCleanupRef.current) {
        pulseCleanupRef.current();
        pulseCleanupRef.current = null;
      }
    };
  }, [shouldPulse]);

  const mm = Math.floor(Math.abs(seconds) / 60)
    .toString()
    .padStart(2, '0');
  const ss = Math.abs(seconds % 60)
    .toString()
    .padStart(2, '0');
  const isOvertime = seconds < 0;

  const handleExtend = useCallback(() => {
    onReset(seconds + 60);
  }, [seconds, onReset]);

  const handleReset = useCallback(() => {
    onReset(defaultSeconds);
  }, [defaultSeconds, onReset]);

  if (defaultSeconds === 0) return null;

  const isUrgent = !isOvertime && seconds > 0 && seconds <= 60;
  const isCritical = !isOvertime && seconds > 0 && seconds <= 10 && running;

  return (
    <div
      class={`flex items-center gap-3 select-none rounded-xl px-3 py-1 transition-colors duration-500 ${
        isOvertime
          ? 'bg-red-100'
          : isCritical
            ? 'bg-red-100 ring-2 ring-red-400'
            : isUrgent
              ? 'bg-red-50 ring-2 ring-red-300 animate-pulse'
              : ''
      }`}
    >
      {isCritical && (
        <style>{`
          @keyframes timer-bounce {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.2); }
          }
        `}</style>
      )}
      <button
        onClick={onToggle}
        class="w-12 h-12 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-xl transition-colors"
        aria-label={running ? '一時停止' : '再開'}
      >
        {running ? '⏸' : '▶️'}
      </button>

      <div
        key={isCritical ? seconds : undefined}
        class={`font-mono font-black tabular-nums text-center ${
          isOvertime
            ? 'text-red-600 animate-pulse'
            : isCritical
              ? 'text-red-700'
              : isUrgent
                ? 'text-red-600'
                : seconds <= 120
                  ? 'text-amber-600'
                  : 'text-gray-900'
        }`}
        style={{
          fontSize: 'clamp(2rem, 6vw, 4rem)',
          ...(isCritical ? { animation: 'timer-bounce 0.4s ease-out' } : {}),
        }}
      >
        {isOvertime && '-'}
        {mm}:{ss}
      </div>

      <div class="flex flex-col gap-1">
        <button
          onClick={handleExtend}
          class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
          title="+1分延長"
        >
          +1分
        </button>
        <button
          onClick={handleReset}
          class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
          title="リセット"
        >
          ↺
        </button>
      </div>
    </div>
  );
}
