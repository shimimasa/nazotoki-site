import { useEffect, useState, useMemo } from 'preact/hooks';

const COLORS = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4'];

interface ConfettiProps {
  /** Auto-hide after this duration (ms) */
  duration?: number;
  /** Number of confetti pieces */
  count?: number;
}

interface Piece {
  left: number;
  delay: number;
  size: number;
  color: string;
  isCircle: boolean;
  fallDuration: number;
}

export default function Confetti({ duration = 3500, count = 60 }: ConfettiProps) {
  const [visible, setVisible] = useState(true);

  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        size: 6 + Math.random() * 8,
        color: COLORS[i % COLORS.length],
        isCircle: Math.random() > 0.5,
        fallDuration: 2 + Math.random() * 2,
      })),
    [count],
  );

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(t);
  }, [duration]);

  if (!visible) return null;

  return (
    <div class="fixed inset-0 z-50 pointer-events-none overflow-hidden" aria-hidden="true">
      <style>{`
        @keyframes confetti-fall {
          0% { opacity: 1; transform: translateY(0) rotate(0deg); }
          70% { opacity: 1; }
          100% { opacity: 0; transform: translateY(100vh) rotate(720deg); }
        }
      `}</style>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: '-12px',
            width: `${p.size}px`,
            height: `${p.size * (p.isCircle ? 1 : 0.6)}px`,
            backgroundColor: p.color,
            borderRadius: p.isCircle ? '50%' : '2px',
            animation: `confetti-fall ${p.fallDuration}s ease-out ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}
