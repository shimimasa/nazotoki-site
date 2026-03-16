import { convertFurigana, renderMarkdown } from '../../src/lib/markdown';

describe('convertFurigana', () => {
  it('converts furigana markup into ruby tags', () => {
    expect(convertFurigana('{猫|ねこ}')).toBe('<ruby>猫<rp>(</rp><rt>ねこ</rt><rp>)</rp></ruby>');
  });

  it('converts multiple furigana blocks in the same string', () => {
    expect(convertFurigana('{東京|とうきょう}と{大阪|おおさか}')).toContain('<ruby>東京');
    expect(convertFurigana('{東京|とうきょう}と{大阪|おおさか}')).toContain('<ruby>大阪');
  });

  it('leaves text without furigana unchanged', () => {
    expect(convertFurigana('plain text')).toBe('plain text');
  });

  it('preserves existing markdown around furigana text', () => {
    expect(convertFurigana('**{海|うみ}**')).toContain('**');
  });

  it('leaves incomplete furigana syntax untouched', () => {
    expect(convertFurigana('{猫|ねこ')).toBe('{猫|ねこ');
  });
});

describe('renderMarkdown', () => {
  it('returns an empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('renders strong text', () => {
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>');
  });

  it('renders unordered lists', () => {
    const html = renderMarkdown('- one\n- two');

    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
  });

  it('strips script tags from the output', () => {
    const html = renderMarkdown("<script>alert('xss')</script>safe");

    expect(html).not.toContain('<script>');
    expect(html).toContain('safe');
  });

  it('removes dangerous img attributes', () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)" alt="demo">');

    expect(html).toContain('<img');
    expect(html).toContain('src="x"');
    expect(html).not.toContain('onerror');
  });

  it('keeps allowed ruby tags after sanitization', () => {
    const html = renderMarkdown('{空|そら}');

    expect(html).toContain('<ruby>');
    expect(html).toContain('<rt>そら</rt>');
  });

  it('keeps safe links but removes inline event handlers', () => {
    const html = renderMarkdown('<a href="https://example.com" onclick="alert(1)">link</a>');

    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain('onclick');
  });

  it('removes tags outside the allow list', () => {
    const html = renderMarkdown('<iframe src="https://example.com"></iframe><p>ok</p>');

    expect(html).not.toContain('<iframe');
    expect(html).toContain('<p>ok</p>');
  });
});
