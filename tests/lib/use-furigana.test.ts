import { ruby } from '../../src/lib/use-furigana';

describe('ruby', () => {
  it('returns ruby HTML when enabled', () => {
    const result = ruby('漢字', 'かんじ', true);
    expect(result).toContain('<ruby>');
    expect(result).toContain('漢字');
    expect(result).toContain('<rt>かんじ</rt>');
  });

  it('returns plain text when disabled', () => {
    const result = ruby('漢字', 'かんじ', false);
    expect(result).toBe('漢字');
    expect(result).not.toContain('<ruby>');
  });

  it('handles empty text', () => {
    expect(ruby('', 'reading', true)).toContain('<ruby>');
    expect(ruby('', 'reading', false)).toBe('');
  });

  it('includes rp fallback tags', () => {
    const result = ruby('字', 'じ', true);
    expect(result).toContain('<rp>(</rp>');
    expect(result).toContain('<rp>)</rp>');
  });
});
