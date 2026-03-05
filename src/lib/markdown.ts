import { marked } from 'marked';

marked.setOptions({
  breaks: true,
  gfm: true,
});

/** 混合語スキップリスト: 漢字+ひらがなで1語を構成するもの */
const MIXED_WORD_SKIP = new Set([
  '花びん', '花びら', '花まる', '花ざかり',
  '気まぐれ', '気まずい', '気だるい',
  '手がかり', '手ごたえ', '手ぶら',
  '目ざめ', '目ざとい', '目まい',
  '腕まくり', '腕ずく',
  '顔ぶれ', '顔なじみ',
  '力ずく', '力まかせ',
  '物ごと', '物まね',
  '心ざし', '心がけ', '心づかい',
  '言いがかり',
  '一つ', '二つ', '三つ', '四つ', '五つ', '六つ', '七つ', '八つ', '九つ', '十ばかり',
  '間もなく', '間ちがい',
  '見つけ', '見つかり', '見つめ', '見はり',
  '友だち', '友だちど',
  '大きな', '大きい', '大きく', '大きさ',
  '小さな', '小さい', '小さく', '小さめ',
]);

/** 多漢字語の後に文法が直接続く場合の先頭文字（助詞・な形容詞等） */
const GRAMMAR_START = 'のがはもにでへかだな';

function ruby(kanji: string, reading: string): string {
  return `<ruby>${kanji}<rp>(</rp><rt>${reading}</rt><rp>)</rp></ruby>`;
}

/** 読みの後に続く文法パターンかどうかを判定（単漢字用） */
function isGrammarAfterReading(rest: string): boolean {
  if (rest.length === 0) return false;
  if ('のがはもにでへかだてっ'.includes(rest[0])) return true;
  return rest.startsWith('られ') || rest.startsWith('れる') ||
    rest.startsWith('れた') || rest.startsWith('れて') ||
    rest.startsWith('する') || rest.startsWith('した') || rest.startsWith('して') ||
    rest.startsWith('させ') || rest.startsWith('される');
}

/**
 * インラインふりがなを <ruby> タグに変換する
 * パターン: 漢字1文字以上 + ひらがな読み（例: 探偵団たんていだん → <ruby>探偵団<rt>たんていだん</rt></ruby>）
 * を(U+3092)はひらがな範囲から除外（常に助詞なので自然な区切りになる）
 */
export function convertFurigana(text: string): string {
  const particles = 'のがはもにでへかだ';

  return text.replace(
    /([\u4e00-\u9fff々\u3400-\u9faf]{1,})([ぁ-ゑん]{1,})/g,
    (_match, kanji: string, hira: string) => {
      const kanjiLen = kanji.length;
      const hiraLen = hira.length;
      const maxLen = kanjiLen * 3;
      const minLen = kanjiLen;

      // ─── 単漢字 ───
      if (kanjiLen === 1) {
        // 1文字ひらがな = 活用語尾（赤い、大きな等）
        if (hiraLen === 1) return _match;

        // 混合語スキップ（花びん等）
        if (MIXED_WORD_SKIP.has(kanji + hira)) return _match;
        for (const word of MIXED_WORD_SKIP) {
          if (word.startsWith(kanji) && hira.startsWith(word.slice(1))) {
            return _match;
          }
        }

        // 2文字ひらがな: 活用語尾でなければ変換（飾かざ、誰だれ等）
        if (hiraLen === 2) {
          // 活用語尾パターン: 起きた、作った、考える、焼いた、悲しい等
          if ('たてだでる'.includes(hira[1])) return _match;
          if (hira === 'しい' || hira === 'しく' || hira === 'しさ') return _match;
          return ruby(kanji, hira);
        }

        // 3文字以上: 読み境界を探す（readLen 2→3）
        for (let readLen = 2; readLen <= Math.min(3, hiraLen - 1); readLen++) {
          const reading = hira.slice(0, readLen);
          const rest = hira.slice(readLen);
          if ('たてだでる'.includes(reading[reading.length - 1])) continue;
          if (readLen === 3 && reading.endsWith('ない')) continue;
          if (isGrammarAfterReading(rest)) {
            return ruby(kanji, reading) + rest;
          }
        }

        // readLen=1 フォールバック: 促音活用のみ（塗ぬって等）
        if (hiraLen >= 3) {
          const rest = hira.slice(1);
          if (rest.startsWith('って') || rest.startsWith('った')) {
            return ruby(kanji, hira[0]) + rest;
          }
        }

        return _match;
      }

      // ─── 多漢字（2文字以上） ───

      // 文法先頭ヒューリスティック: 短いひらがなが文法文字で始まる → ふりがなではない
      if (GRAMMAR_START.includes(hira[0]) && hiraLen < kanjiLen * 2) {
        return _match;
      }

      // 文法パターンを即座に除外
      if (hira.startsWith('だった') || hira.startsWith('だから') ||
          hira.startsWith('だけど') || hira.startsWith('だろう')) {
        return _match;
      }

      // 動詞接尾辞スキップ（議論する、理解して等）
      if (hira === 'する' || hira === 'した' || hira === 'して' ||
          hira === 'させ' || hira === 'され' || hira === 'できる') {
        return _match;
      }

      // Strategy 1: 末尾助詞（放課後ほうかごの → <ruby>放課後<rt>ほうかご</rt></ruby>の）
      if (particles.includes(hira[hiraLen - 1])) {
        const reading = hira.slice(0, -1);
        if (reading.length >= minLen && reading.length <= maxLen) {
          if (GRAMMAR_START.includes(reading[0]) && reading.length < kanjiLen * 2) {
            return _match;
          }
          return ruby(kanji, reading) + hira[hiraLen - 1];
        }
      }

      // Strategy 3a: 動詞接尾辞パターンの境界検出（して/した/する）
      for (let pos = minLen; pos <= Math.min(hiraLen - 1, maxLen); pos++) {
        const twoChar = hira.slice(pos, pos + 2);
        if (twoChar === 'して' || twoChar === 'した' || twoChar === 'する') {
          return ruby(kanji, hira.slice(0, pos)) + hira.slice(pos);
        }
      }

      // Strategy 2: 全ひらがなが読み範囲内
      if (hiraLen >= minLen && hiraLen <= maxLen) {
        return ruby(kanji, hira);
      }

      // Strategy 3b: 助詞境界の検出
      for (let pos = minLen; pos <= Math.min(hiraLen - 1, maxLen); pos++) {
        if ((particles + 'を').includes(hira[pos])) {
          return ruby(kanji, hira.slice(0, pos)) + hira.slice(pos);
        }
      }

      return _match;
    },
  );
}

export function renderMarkdown(md: string): string {
  if (!md) return '';
  const text = convertFurigana(md);
  return marked.parse(text) as string;
}
