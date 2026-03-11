import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

marked.setOptions({
  breaks: true,
  gfm: true,
});

// Phase 82: Sanitize HTML output to prevent XSS
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'ul', 'ol', 'li', 'a', 'strong', 'em',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'blockquote', 'img', 'br', 'hr', 'code', 'pre',
    'details', 'summary', 'ruby', 'rp', 'rt',
  ],
  allowedAttributes: {
    a: ['href'],
    img: ['src', 'alt'],
    '*': ['class'],
  },
};

/**
 * 明示的記法 {漢字|読み} を <ruby> タグに変換する
 * ソースファイルのふりがなは事前に convert-furigana-to-explicit.mjs で
 * {漢字|読み} 記法に変換済み。
 */
export function convertFurigana(text: string): string {
  return text.replace(
    /\{([^}|]+)\|([^}]+)\}/g,
    (_match, kanji: string, reading: string) =>
      `<ruby>${kanji}<rp>(</rp><rt>${reading}</rt><rp>)</rp></ruby>`
  );
}

export function renderMarkdown(md: string): string {
  if (!md) return '';
  const text = convertFurigana(md);
  const html = marked.parse(text) as string;
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}
