import { useState, useEffect } from 'preact/hooks';

const LS_KEY = 'nazotoki-font-size';
const SIZES = ['small', 'medium', 'large'] as const;
type FontSize = typeof SIZES[number];

const SIZE_VALUES: Record<FontSize, string> = {
  small: '0.875rem',
  medium: '1rem',
  large: '1.125rem',
};

const SIZE_LABELS: Record<FontSize, string> = {
  small: '小',
  medium: '中',
  large: '大',
};

function applySize(size: FontSize) {
  document.documentElement.style.setProperty('--student-font-size', SIZE_VALUES[size]);
  document.body.style.fontSize = SIZE_VALUES[size];
}

function resetSize() {
  document.documentElement.style.removeProperty('--student-font-size');
  document.body.style.removeProperty('font-size');
}

// Student-only font size toggle. Each Astro page is a full page load,
// so styles set here do not leak to teacher/admin pages. The cleanup
// is defensive for any future SPA-like navigation.
export function useFontSize() {
  const [size, setSize] = useState<FontSize>('medium');

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY) as FontSize | null;
    if (saved && SIZES.includes(saved)) {
      setSize(saved);
      applySize(saved);
    }
    return () => resetSize();
  }, []);

  const cycle = () => {
    const idx = SIZES.indexOf(size);
    const next = SIZES[(idx + 1) % SIZES.length];
    setSize(next);
    applySize(next);
    localStorage.setItem(LS_KEY, next);
  };

  return { size, label: SIZE_LABELS[size], cycle };
}
