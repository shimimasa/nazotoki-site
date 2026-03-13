import { useState, useEffect } from 'preact/hooks';

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

// Scoped font size toggle. Each surface gets its own localStorage key and default.
// Session defaults to 'large' (Chromebook distance 30-50cm), others default to 'medium'.
export function useFontSize(scope: 'session' | 'solo' | 'general' = 'general') {
  const lsKey = `nazotoki-font-size-${scope}`;
  const defaultSize: FontSize = scope === 'session' ? 'large' : 'medium';
  const [size, setSize] = useState<FontSize>(defaultSize);

  useEffect(() => {
    const saved = localStorage.getItem(lsKey) as FontSize | null;
    if (saved && SIZES.includes(saved)) {
      setSize(saved);
      applySize(saved);
    } else {
      applySize(defaultSize);
    }
    return () => resetSize();
  }, []);

  const cycle = () => {
    const idx = SIZES.indexOf(size);
    const next = SIZES[(idx + 1) % SIZES.length];
    setSize(next);
    applySize(next);
    localStorage.setItem(lsKey, next);
  };

  return { size, label: SIZE_LABELS[size], cycle };
}
