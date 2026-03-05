import { marked } from 'marked';

marked.setOptions({
  breaks: true,
  gfm: true,
});

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
  return marked.parse(text) as string;
}
