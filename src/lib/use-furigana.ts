import { useState, useEffect } from 'preact/hooks';

const LS_KEY = 'nazotoki-furigana';

export function useFurigana() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(LS_KEY) === '1');
    } catch { /* ignore */ }
  }, []);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    try {
      localStorage.setItem(LS_KEY, next ? '1' : '0');
    } catch { /* ignore */ }
  };

  return { furigana: enabled, toggleFurigana: toggle };
}

/** Render text with ruby annotation. Returns plain text if furigana is off. */
export function ruby(text: string, reading: string, enabled: boolean): string {
  if (!enabled) return text;
  return `<ruby>${text}<rp>(</rp><rt>${reading}</rt><rp>)</rp></ruby>`;
}
