import { marked } from 'marked';

marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * インラインふりがなを除去する（Web表示用）
 * パターン: 漢字2文字以上 + ひらがな読み（例: 探偵団たんていだん → 探偵団）
 * を(U+3092)はひらがな範囲から除外（常に助詞なので自然な区切りになる）
 */
export function stripFurigana(text: string): string {
  // [ぁ-ゑん] = ひらがな全体から を(U+3092) を除外
  return text.replace(
    /([\u4e00-\u9fff々\u3400-\u9faf]{2,})([ぁ-ゑん]{2,})/g,
    (_match, kanji: string, hira: string) => {
      const maxLen = kanji.length * 3;
      const minLen = kanji.length;

      // Strategy 1: ひらがなが読みの範囲内
      if (hira.length >= minLen && hira.length <= maxLen) {
        // 末尾が助詞なら助詞を残す（例: おうごんの → 黄金の）
        const particles = 'のがはもにでへか';
        if (particles.includes(hira[hira.length - 1])) {
          const reading = hira.slice(0, -1);
          if (reading.length >= minLen) {
            return kanji + hira[hira.length - 1];
          }
        }
        return kanji;
      }

      // Strategy 2: ひらがなが読み＋文法（例: じまんにしている）
      // 読みの範囲内で最初の助詞を見つけて区切る
      for (let pos = minLen; pos <= Math.min(hira.length, maxLen); pos++) {
        if ('のがはもにでへをかだ'.includes(hira[pos])) {
          return kanji + hira.slice(pos);
        }
      }

      return _match; // 判定不能な場合はそのまま
    },
  );
}

export function renderMarkdown(md: string, keepFurigana = false): string {
  if (!md) return '';
  const text = keepFurigana ? md : stripFurigana(md);
  return marked.parse(text) as string;
}
