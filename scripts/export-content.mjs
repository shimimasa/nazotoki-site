/**
 * export-content.mjs
 * apps/madamisu/ の全シナリオを Astro content collection + JSON data に変換
 *
 * 出力:
 *   src/content/scenarios/{slug}.md   — frontmatter のみ（一覧ページ用）
 *   src/data/{slug}.json              — 全コンテンツ（個別ページ用）
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.resolve(ROOT, '..', 'apps', 'madamisu');
const CONTENT_OUT = path.resolve(ROOT, 'src', 'content', 'scenarios');
const DATA_OUT = path.resolve(ROOT, 'src', 'data');
const IMAGES_DIR = path.resolve(ROOT, 'public', 'images');

// ── シリーズ定義 ──────────────────────────────
const SERIES_MAP = {
  'time-travel': { name: 'タイムトラベル探偵団', subject: '歴史（社会科）', order: 1 },
  'literature':  { name: '名作文学ミステリー', subject: '国語', order: 2 },
  'popculture':  { name: 'マンガ教養ミステリー', subject: 'ポップカルチャー', order: 3 },
  'math':        { name: '数字の迷宮', subject: '算数', order: 4 },
  'science':     { name: 'サイエンス捜査班', subject: '理科', order: 5 },
  'moral':       { name: '答えのない法廷', subject: '道徳', order: 6 },
  'digital':     { name: 'デジタル探偵団', subject: '情報', order: 7 },
  'geography':   { name: '地理探偵団', subject: '社会', order: 8 },
  'health':      { name: '保健探偵団', subject: '保健', order: 9 },
  'english':     { name: '英語探偵団', subject: '英語', order: 10 },
  'career':      { name: 'キャリア探偵団', subject: 'キャリア', order: 11 },
  'esd':         { name: 'ESD探偵団', subject: '環境', order: 12 },
  'civics':      { name: '公民探偵団', subject: '公民', order: 13 },
  'disaster':    { name: '防災探偵団', subject: '防災', order: 14 },
  'homeec':      { name: '家庭科探偵団', subject: '家庭科', order: 15 },
  'math2':       { name: '数学深化探偵団', subject: '数学', order: 16 },
  'money':       { name: 'お金の探偵団', subject: 'お金', order: 17 },
  'programming': { name: 'プログラミング探偵団', subject: 'プログラミング', order: 18 },
};

// ── ユーティリティ ────────────────────────────
async function readFile(dir, filename) {
  try {
    return await fs.readFile(path.join(dir, filename), 'utf-8');
  } catch {
    return '';
  }
}

/** YAML frontmatter 用に文字列をエスケープ */
function yamlStr(s) {
  if (!s) return '""';
  if (/[:#\[\]{}&*!|>'"%@`\n]/.test(s) || s.trim() !== s) {
    return JSON.stringify(s);
  }
  return s;
}

// ── overview.md パーサ ────────────────────────
function parseTitle(md) {
  // テーブルの「タイトル」行を最優先
  const tableMatch = md.match(/\|\s*タイトル\s*\|\s*(.+?)\s*\|/);
  if (tableMatch) return tableMatch[1].trim();

  // H1 から「タイトル」を抽出
  const m = md.match(/^#\s+(.+)/m);
  if (!m) return '';
  const full = m[1].trim();
  const titleMatch = full.match(/[「『](.+?)[」』]/);
  if (titleMatch) return titleMatch[1];

  // H1に「」がない場合（例: "# シナリオ概要（GM用）"）→ H2から探す
  const h2Match = md.match(/^##\s+.*?[「『](.+?)[」』]/m);
  if (h2Match) return h2Match[1];

  return full;
}

function parseFullTitle(md) {
  const m = md.match(/^#\s+(.+)/m);
  return m ? m[1].trim() : '';
}

function parseSection(md, headerPattern, nextHeaderLevel = 3) {
  // H2/H3 両方にマッチ（世代ごとのヘッダーレベル差を吸収）
  const minLevel = Math.max(nextHeaderLevel - 1, 2);
  const regex = new RegExp(`^#{${minLevel},${nextHeaderLevel}}\\s+${headerPattern}[^\\n]*$`, 'gm');
  const match = md.match(regex);
  if (!match) return '';

  const startIdx = md.indexOf(match[0]);
  const afterHeader = md.slice(startIdx + match[0].length);
  // Find next same-level or higher header
  const headerLevel = match[0].match(/^(#+)/)[1].length;
  const nextMatch = afterHeader.match(new RegExp(`^#{1,${headerLevel}}\\s+`, 'm'));
  const content = nextMatch
    ? afterHeader.slice(0, nextMatch.index)
    : afterHeader;
  return content.trim();
}

function parseSynopsis(md) {
  // 「あらすじ」「ストーリー概要」「事件の概要」セクションの内容を取得
  // ふりがな混在対応: 事件じけんの概要 etc.
  for (const pattern of ['あらすじ', 'ストーリー概要', '事件[^\\n]*概要']) {
    const section = parseSection(md, pattern);
    if (section) return section.replace(/\n+/g, '\n').trim();
  }
  return '';
}

function parseTruth(md) {
  // ふりがな混在対応: 事件じけんの真相しんそう etc.
  for (const pattern of ['事件[^\\n]*真相', '犯人[^\\n]*動機', '真相[^\\n]*動機', '4人の関わり']) {
    const section = parseSection(md, pattern);
    if (section) return section.trim();
  }
  return '';
}

function parseLearningGoals(md) {
  // ふりがな混在対応: 学習がくしゅう目標 / 学習テーマ
  for (const pattern of ['学習[^\\n]*目標', '学習[^\\n]*テーマ']) {
    const section = parseSection(md, pattern);
    if (section) return section.trim();
  }
  return '';
}

function parseBasicInfo(md) {
  const result = {
    subject: '',
    players: '',
    age: '',
    time: '',
    difficulty: '',
  };

  // Format A: bullet list (- キー: 値)
  const playerMatch = md.match(/プレイ人数[：:]\s*(.+)/);
  if (playerMatch) result.players = playerMatch[1].trim();

  const ageMatch = md.match(/対象年齢[：:]\s*(.+)/);
  if (ageMatch) result.age = ageMatch[1].trim();

  const timeMatch = md.match(/プレイ時間[：:]\s*(.+)/);
  if (timeMatch) result.time = timeMatch[1].trim();

  const diffMatch = md.match(/難易度[：:]\s*(.+)/);
  if (diffMatch) result.difficulty = diffMatch[1].trim();

  const subjectMatch = md.match(/教科[接続]?[：:]\s*(.+)/);
  if (subjectMatch) result.subject = subjectMatch[1].trim();

  // Format B: table (| 項目 | 内容 |)
  const tableRows = md.match(/\|.+?\|.+?\|/g);
  if (tableRows) {
    for (const row of tableRows) {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length < 2) continue;
      const [key, val] = cells;
      if (/プレイ人数/.test(key)) result.players = result.players || val;
      if (/対象年齢/.test(key)) result.age = result.age || val;
      if (/プレイ時間/.test(key)) result.time = result.time || val;
      if (/難易度/.test(key)) result.difficulty = result.difficulty || val;
      if (/教科/.test(key)) result.subject = result.subject || val;
    }
  }

  return result;
}

function parseCharacterTable(md) {
  // 登場人物セクションのテーブルをパース
  const chars = [];
  const sectionMatch = md.match(/##\s*登場人物[\s\S]*?(?=\n##\s|\n---|\n### プレイヤー|$)/);
  if (!sectionMatch) return chars;

  const section = sectionMatch[0];
  const rows = section.match(/\|(?!\s*-).+\|/g);
  if (!rows || rows.length < 2) return chars;

  // Skip header row
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (/^[\s|:-]+$/.test(row)) continue; // separator row
    const cells = row.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;

    const name = cells[0].replace(/\*\*/g, '').trim();
    const isNPC = /NPC/.test(row);
    // Role is typically in column 2 or 3
    const role = cells.length >= 3 ? cells[cells.length - 2] : cells[1];

    chars.push({ name, role: role.replace(/\*\*/g, '').trim(), isNPC });
  }
  return chars;
}

// ── evidence.md パーサ ────────────────────────
function parseEvidenceCards(md) {
  if (!md) return { cards: [], card5: null };

  const cards = [];
  // Split by card headers
  const parts = md.split(/^(##\s*証拠[しょうこ]*カード)/m);

  let currentCard = null;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (/^##\s*証拠/.test(part) && i + 1 < parts.length) {
      // This is a header marker, combine with next part
      const fullSection = part + parts[i + 1];
      i++; // skip next part

      // Extract card number
      const numMatch = fullSection.match(/カード\s*(\d+)/);
      const num = numMatch ? parseInt(numMatch[1]) : 0;

      // Extract title (first line after ##)
      const titleMatch = fullSection.match(/^##\s*(.+)/m);
      const title = titleMatch ? titleMatch[1].trim() : `証拠カード${num}`;

      // Content is everything after the first line
      const firstNewline = fullSection.indexOf('\n');
      const content = firstNewline >= 0 ? fullSection.slice(firstNewline).trim() : '';

      cards.push({ number: num, title, content });
    }
  }

  // Separate card 5
  const regularCards = cards.filter(c => c.number <= 4);
  const card5 = cards.find(c => c.number === 5) || null;

  return { cards: regularCards, card5 };
}

// ── character-*.md パーサ ─────────────────────
function parseCharacter(id, md) {
  // Name from title — 3フォーマット対応
  // Format A/B: "# キャラクターシート：名前" or "# キャラクターシート: 名前"
  // Format B: "# キャラクターシート — 名前"
  // Format C: "# 名前のキャラクターシート"
  let name = id;
  const titleA = md.match(/^#\s*キャラクターシート\s*[：:—–\-]\s*(.+)/m);
  const titleC = md.match(/^#\s*(.+?)のキャラクターシート/m);
  if (titleA) {
    name = titleA[1].trim();
  } else if (titleC) {
    name = titleC[1].trim();
  }
  // 補足情報を除去: "ハナコ（部長・中3）" → "ハナコ" / "アキラ（5年1組）★犯人★" → "アキラ"
  name = name.replace(/[（(].+$/, '').replace(/★.+$/, '').trim();

  let introContent = '';
  let publicContent = '';
  let secretContent = '';

  // Intro: "きみはだれ？" (A/B) or "あなたは「XX」" (C)
  const introMatch = md.match(/#{2,3}\s*(?:きみはだれ？|あなたは[^\n]*)\n([\s\S]*?)(?=#{2,3}\s*(?:みんなに|公開|こうかい)|$)/);
  if (introMatch) introContent = introMatch[1].trim();

  // Public info: multiple variants
  // A: "### みんなに言っていい情報（公開情報）" (with furigana)
  // C: "## 公開情報（みんなに話してOK）"
  const publicMatch = md.match(/#{2,3}\s*(?:みんなに[^\n]*情報|公開[^\n]*情報)[^\n]*([\s\S]*?)(?=#{2,3}\s*(?:★|秘密|ひみつ)|$)/);
  if (publicMatch) publicContent = publicMatch[1].trim();

  // Secret info: multiple variants
  // A: "### ★秘密の情報★" (with furigana)
  // C: "## 秘密情報" / "## ひみつの情報"
  const secretMatch = md.match(/(#{2,3}\s*(?:★\s*)?(?:秘密|ひみつ)[^\n]*\n[\s\S]*$)/);
  if (secretMatch) secretContent = secretMatch[1].trim();

  // Role from intro
  const roleMatch = introContent.match(/^(.+?)(?:\n|$)/);
  const role = roleMatch ? roleMatch[1].replace(/\*\*/g, '').replace(/——/g, '').replace(/—/g, '').trim().slice(0, 50) : '';

  return {
    id,
    name,
    role,
    isNPC: false,
    introContent,
    publicContent,
    fullContent: md,
  };
}

// ── 議論セクション抽出 ─────────────────────────
/**
 * gm-guide.md から議論フェーズに必要な情報のみを抽出する。
 * 「議論」「話し合い」セクション + 「キラー質問」の内容。
 */
function parseDiscussionSection(md) {
  if (!md) return '';

  const sections = [];

  // 議論セクション: "ステップ2：話し合い" / "ステップ2: 議論" / "④議論"
  // ふりがな混在対応: 議論ぎろん / 話し合い etc.
  const discussMatch = md.match(/^(#{2,4})\s*[^\n]*(?:議論|ぎろん|話し合)[^\n]*$([\s\S]*?)(?=^#{1,4}\s+(?![^\n]*(?:キラー|後半|最終))|\n---\n|$)/m);
  if (discussMatch) {
    sections.push(discussMatch[0].trim());
  }

  // キラー質問（議論セクション外にある場合も拾う）
  if (!discussMatch || !/キラー/.test(discussMatch[0])) {
    const killerMatch = md.match(/^(#{2,5})\s*[^\n]*キラー質問[^\n]*$([\s\S]*?)(?=^#{1,4}\s|\n---\n|$)/m);
    if (killerMatch) {
      sections.push(killerMatch[0].trim());
    }
    // インラインのキラー質問（**キラー質問**: ...）
    const inlineKiller = md.match(/\*\*キラー質問[^\n]*\*\*[：:][^\n]+([\s\S]*?)(?=\n\n#{2,4}|\n---|\n\n\*\*|$)/);
    if (inlineKiller && !killerMatch) {
      sections.push(inlineKiller[0].trim());
    }
  }

  if (sections.length === 0) return '';
  return sections.join('\n\n');
}

// ── キラー質問抽出（ソロモード用） ──────────────────
/**
 * gm-guide.md のキラー質問テーブルを構造化データとして抽出。
 * 形式: | 場面 | キラー質問 | → { scene, question }[]
 */
function parseKillerQuestions(md) {
  if (!md) return [];
  md = md.replace(/\r\n/g, '\n');

  // Pattern A: ヘッダー形式 (### キラー質問 / #### キラー質問リスト)
  let match = md.match(
    /#{2,5}\s*[^\n]*キラー質問[^\n]*\n([\s\S]*?)(?=\n#{1,4}\s|\n---)/
  );
  if (!match) {
    match = md.match(/#{2,5}\s*[^\n]*キラー質問[^\n]*\n([\s\S]+)/);
  }
  // Pattern B: インラインボールド形式 (**キラー質問**（...）: followed by list)
  if (!match) {
    match = md.match(
      /\*\*キラー質問\*\*[^\n：:]*[：:]\s*\n([\s\S]*?)(?=\n\*\*[^\n*]+\*\*[^\n]*[：:]|\n#{1,4}\s|\n---)/
    );
  }
  if (!match) {
    match = md.match(/\*\*キラー質問\*\*[^\n：:]*[：:]\s*\n([\s\S]+?)(?=\n\n\*\*[^\n*]+\*\*|\n#{1,4}\s|\n---)/);
  }
  if (!match) return [];

  const section = match[1];

  // Format 1: テーブル形式 (| ... | ... |)
  const rows = section.match(/\|(?!\s*[-:]).+\|/g);
  if (rows && rows.length > 1) {
    const questions = [];
    for (const row of rows) {
      const safeRow = row.replace(/\{([^}|]+)\|([^}]+)\}/g, '{$1\x00$2}');
      const cells = safeRow.split('|').map(c => c.replace(/\x00/g, '|').trim()).filter(Boolean);
      if (cells.length < 2) continue;
      // ヘッダー行をスキップ
      if (/場面|状況|シーン|^#$|No|GM/.test(cells[0]) && /キラー|質問|対応/.test(cells[1])) continue;
      // 番号列がある場合（| # | 質問 | 狙い |）→ 質問は2列目
      const isNumbered = /^\d+$/.test(cells[0]);
      questions.push({
        scene: isNumbered ? '' : cells[0].replace(/\*\*/g, ''),
        question: (isNumbered ? cells[1] : cells[1]).replace(/\*\*/g, '').replace(/^「|」$/g, ''),
      });
    }
    if (questions.length > 0) return questions;
  }

  // Format 2: 番号リスト形式 (1. **「質問」** or 1. **場面** > 「質問」)
  const listItems = section.match(/^\d+\.\s+\*\*[^\n]+/gm);
  if (listItems) {
    const questions = [];
    for (const item of listItems) {
      const clean = item.replace(/^\d+\.\s+/, '').replace(/\*\*/g, '').trim();
      // 「質問」形式
      const qMatch = clean.match(/「(.+?)」/);
      questions.push({
        scene: '',
        question: qMatch ? qMatch[1] : clean,
      });
    }
    if (questions.length > 0) return questions;
  }

  return [];
}

// ── チャレンジ問題抽出（ソロモード用） ────────────────
/**
 * solution.md からチャレンジ問題セクションをmarkdownとして抽出。
 * 答えセクションも含めて返す。
 */
function parseChallengeSection(md) {
  if (!md) return '';
  md = md.replace(/\r\n/g, '\n');

  // "### チャレンジ問題" から「もっと知りたい」or 別ヘッダーまで
  let match = md.match(
    /#{2,4}\s*[^\n]*チャレンジ[^\n]*問題[^\n]*\n([\s\S]*?)(?=\n#{1,3}\s+(?!チャレンジ|問題|答え)[^\n])/
  );
  // 末尾セクションのフォールバック
  if (!match) {
    match = md.match(/#{2,4}\s*[^\n]*チャレンジ[^\n]*問題[^\n]*\n([\s\S]+)/);
  }
  if (!match) return '';

  let content = match[0].trim();
  content = cleanFileReferences(content);
  return content;
}

// ── GMガイド Web変換 ──────────────────────────
/**
 * BOOTH用GMガイドからWeb表示に不適切な印刷セクションを除去・置換する。
 * - 「印刷チェックリスト」「印刷するもの」セクションを「このサイトでの準備」に置換
 * - ファイル参照 (`common.md`, `evidence.md` 等) を自然な表現に置換
 */
function transformGmGuideForWeb(md, slug) {
  if (!md) return '';

  // Pattern 1: "## 印刷チェックリスト" — ##レベルのセクション全体を置換
  // ヘッダー行 + 空行 + チェックリスト項目群 (次の --- or ## まで)
  md = md.replace(
    /^##\s*印刷[いんさつ]*チェックリスト[^\n]*\n(?:(?!\n##\s|\n---)[^\n]*\n)*/m,
    buildWebPrepSection()
  );

  // Pattern 2: "### 印刷するもの" / "### 印刷物" — ###レベルのセクション
  md = md.replace(
    /^###\s*印刷[いんさつ]*(?:するもの|物[いんさつぶつ]*)[^\n]*\n(?:(?!\n###\s|\n##\s|\n---|\n\d+\.\s\*\*)[^\n]*\n)*/m,
    buildWebPrepSection()
  );

  // Pattern 3: "1. **印刷するもの:**" — 番号付きリスト内の印刷セクション
  md = md.replace(
    /^\d+\.\s*\*\*印刷[いんさつ]*するもの[：:]?\*\*[^\n]*\n(?:\s+- [^\n]+\n)*/m,
    buildWebPrepSection()
  );

  // ファイル参照のクリーンアップ
  md = cleanFileReferences(md);
  md = md.replace(/GMガイド → GM用に1部\n?/g, '');

  return md;
}

/**
 * 全テキストフィールド共通: .md ファイル参照をWeb表現に置換
 */
function cleanFileReferences(md) {
  if (!md) return '';
  md = md.replace(/`?common\.md`?/g, '共通情報');
  md = md.replace(/`?evidence\.md`?/g, '証拠カード');
  md = md.replace(/`?solution\.md`?/g, '解決編');
  md = md.replace(/`?character-\*\.md`?/g, 'キャラクターシート');
  md = md.replace(/`?character-[a-z]+\.md`?/g, 'キャラクターシート');
  md = md.replace(/`?gm-guide\.md`?/g, 'GMガイド');
  md = md.replace(/`?overview\.md`?/g, 'シナリオ概要');
  md = md.replace(/`?player-[a-z]+\.md`?/g, 'プレイヤーシート');
  return md;
}

function buildWebPrepSection() {
  return `**このサイトでの準備:**
- プレイヤーページを参加者に共有（URLまたはQRコード）
- 印刷して配布する場合は、このページ下部の「GMツール」から「カード一式を印刷」へ
- ペンとメモ用紙（各プレイヤー分）
- タイマー（スマホ可）
- 投票用の紙（人数分）
`;
}

// ── 画像パス検出 ──────────────────────────────
/**
 * public/images/{imageSlug}/ から生成済み画像を検出し、
 * thumbnailUrl と各 character の imageUrl を返す。
 * imageSlug は assets/images/ のフォルダ名 (例: "moral-01") に対応。
 */
async function detectImages(scenarioSlug) {
  const result = { thumbnailUrl: null, characterImages: {} };

  // scenarioSlug (例: "moral-01-broken-vase") から画像フォルダ名を推定
  // assets/images/ は "moral-01" 形式で保存されている
  const possibleImageSlugs = getImageSlugCandidates(scenarioSlug);

  for (const imageSlug of possibleImageSlugs) {
    const imgDir = path.join(IMAGES_DIR, imageSlug);
    try {
      await fs.access(imgDir);
    } catch {
      continue;
    }

    // サムネイル
    const thumbPath = path.join(imgDir, 'thumb.webp');
    try {
      await fs.access(thumbPath);
      result.thumbnailUrl = `/images/${imageSlug}/thumb.webp`;
    } catch { /* no thumb */ }

    // キャラ画像
    try {
      const files = await fs.readdir(imgDir);
      for (const f of files) {
        const m = f.match(/^char-(.+)\.webp$/);
        if (m) {
          result.characterImages[m[1]] = `/images/${imageSlug}/${f}`;
        }
      }
    } catch { /* no dir */ }

    break; // 最初に見つかったフォルダを使用
  }

  return result;
}

/**
 * シナリオslug → 画像フォルダ名の候補リスト
 * "moral-01-broken-vase" → ["moral-01-broken-vase", "moral-01"]
 */
function getImageSlugCandidates(slug) {
  const candidates = [slug];
  // "{series}-{vol}-{rest}" → "{series}-{vol}" も候補に
  const match = slug.match(/^([a-z-]+-\d+)-.+$/);
  if (match) {
    candidates.push(match[1]);
  }
  return candidates;
}

// ── slug パーサ ───────────────────────────────
function parseSlug(slug) {
  for (const key of Object.keys(SERIES_MAP)) {
    if (slug.startsWith(key + '-')) {
      const rest = slug.slice(key.length + 1);
      const volMatch = rest.match(/^(\d+)/);
      const volume = volMatch ? parseInt(volMatch[1]) : 0;
      return { series: key, volume };
    }
  }
  return null;
}

// ── frontmatter YAML 生成 ─────────────────────
function generateFrontmatter(data) {
  const lines = [
    '---',
    `title: ${yamlStr(data.title)}`,
    `series: ${yamlStr(data.series)}`,
    `seriesName: ${yamlStr(data.seriesName)}`,
    `volume: ${data.volume}`,
    `scenarioSlug: ${yamlStr(data.slug)}`,
    `subject: ${yamlStr(data.subject)}`,
    `players: ${yamlStr(data.players)}`,
    `age: ${yamlStr(data.age)}`,
    `time: ${yamlStr(data.time)}`,
    `difficulty: ${yamlStr(data.difficulty)}`,
    `synopsis: ${yamlStr(data.synopsis.split('\n')[0])}`,
  ];

  if (data.characters.length === 0) {
    lines.push('characters: []');
  } else {
    lines.push('characters:');
    for (const ch of data.characters) {
      lines.push(`  - id: ${yamlStr(ch.id)}`);
      lines.push(`    name: ${yamlStr(ch.name)}`);
      lines.push(`    role: ${yamlStr(ch.role)}`);
      lines.push(`    isNPC: ${ch.isNPC}`);
    }
  }

  lines.push('---');
  return lines.join('\n') + '\n';
}

// ── メイン処理 ────────────────────────────────
async function processScenario(slug) {
  const srcDir = path.join(SOURCE, slug);
  const parsed = parseSlug(slug);
  if (!parsed) throw new Error(`Unknown series: ${slug}`);

  const { series, volume } = parsed;
  const seriesInfo = SERIES_MAP[series];

  // ソースファイル読み込み
  const [overviewRaw, commonRaw, evidenceRaw, solutionRaw, gmGuideRaw] = await Promise.all([
    readFile(srcDir, 'overview.md'),
    readFile(srcDir, 'common.md'),
    readFile(srcDir, 'evidence.md'),
    readFile(srcDir, 'solution.md'),
    readFile(srcDir, 'gm-guide.md'),
  ]);

  if (!overviewRaw) throw new Error('overview.md not found');

  // メタデータ抽出
  const title = parseTitle(overviewRaw);
  const fullTitle = parseFullTitle(overviewRaw);
  const basicInfo = parseBasicInfo(overviewRaw);
  const synopsis = parseSynopsis(overviewRaw);
  const truth = parseTruth(overviewRaw);
  const learningGoals = parseLearningGoals(overviewRaw);

  // 議論セクション（gm-guideから抽出）
  const discussionGuide = parseDiscussionSection(gmGuideRaw);

  // ソロモード用: キラー質問 + チャレンジ問題
  const killerQuestions = parseKillerQuestions(gmGuideRaw);
  const challengeSection = parseChallengeSection(solutionRaw);

  // 証拠カード
  const { cards: evidenceCards, card5 } = parseEvidenceCards(evidenceRaw);

  // キャラクター
  const files = await fs.readdir(srcDir);
  const charFiles = files.filter(f => f.startsWith('character-') && f.endsWith('.md'));

  const characters = [];
  for (const cf of charFiles) {
    const charId = cf.replace('character-', '').replace('.md', '');
    const charRaw = await readFile(srcDir, cf);
    const char = parseCharacter(charId, charRaw);
    characters.push(char);
  }

  // overview の登場人物テーブルから補完
  const overviewChars = parseCharacterTable(overviewRaw);

  // NPC キャラクター（character file がない登場人物）を追加
  for (const oc of overviewChars) {
    if (oc.isNPC) {
      const alreadyExists = characters.some(c =>
        c.name.includes(oc.name.split('（')[0]) || oc.name.includes(c.name.split('（')[0])
      );
      if (!alreadyExists) {
        characters.push({
          id: 'npc-' + characters.length,
          name: oc.name,
          role: oc.role,
          isNPC: true,
          introContent: '',
          publicContent: '',
          fullContent: '',
        });
      }
    }
  }

  // role の補完
  for (const char of characters) {
    if (!char.role || char.role.length < 3) {
      const oc = overviewChars.find(c =>
        char.name.includes(c.name.split('（')[0]) || c.name.includes(char.name.split('（')[0])
      );
      if (oc) char.role = oc.role;
    }
  }

  // 画像パス検出
  const images = await detectImages(slug);

  // キャラクターに imageUrl を注入
  for (const char of characters) {
    if (images.characterImages[char.id]) {
      char.imageUrl = images.characterImages[char.id];
    }
  }

  const data = {
    title,
    fullTitle,
    series,
    seriesName: seriesInfo.name,
    seriesOrder: seriesInfo.order,
    volume,
    slug,
    subject: basicInfo.subject || seriesInfo.subject,
    players: basicInfo.players || '2〜4人',
    age: basicInfo.age || '小学3年〜6年',
    time: basicInfo.time || '30〜45分',
    difficulty: basicInfo.difficulty || '★★☆',
    synopsis,
    truth,
    learningGoals,
    common: cleanFileReferences(commonRaw),
    evidenceCards,
    evidence5: card5,
    characters,
    solution: cleanFileReferences(solutionRaw),
    gmGuide: transformGmGuideForWeb(gmGuideRaw, slug),
    discussionGuide: cleanFileReferences(discussionGuide),
    killerQuestions,
    challengeSection,
    thumbnailUrl: images.thumbnailUrl || undefined,
  };

  // Content Collection 用 .md
  const fm = generateFrontmatter(data);
  await fs.writeFile(path.join(CONTENT_OUT, `${slug}.md`), fm);

  // Data JSON（ページ描画用）
  await fs.writeFile(path.join(DATA_OUT, `${slug}.json`), JSON.stringify(data, null, 2));

  return data;
}

async function main() {
  console.log('Exporting scenarios...');
  console.log(`Source: ${SOURCE}`);
  console.log(`Content: ${CONTENT_OUT}`);
  console.log(`Data: ${DATA_OUT}`);

  // 出力先クリーン & 作成（meta/ サブディレクトリは保護）
  await fs.rm(CONTENT_OUT, { recursive: true, force: true });
  await fs.mkdir(CONTENT_OUT, { recursive: true });
  await fs.mkdir(DATA_OUT, { recursive: true });
  // DATA_OUT内のJSONファイルのみ削除（meta/等のサブディレクトリは保持）
  try {
    const existing = await fs.readdir(DATA_OUT);
    for (const f of existing) {
      if (f.endsWith('.json')) await fs.rm(path.join(DATA_OUT, f));
    }
  } catch { /* empty dir */ }

  // シナリオディレクトリ一覧
  const entries = await fs.readdir(SOURCE, { withFileTypes: true });
  const dirs = entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => e.name)
    .sort();

  console.log(`Found ${dirs.length} scenario directories`);

  const results = { success: 0, errors: [] };
  const seriesCount = {};

  for (const slug of dirs) {
    try {
      const data = await processScenario(slug);
      results.success++;
      seriesCount[data.series] = (seriesCount[data.series] || 0) + 1;
      console.log(`  ✓ ${slug} (${data.title})`);
    } catch (err) {
      results.errors.push({ slug, error: err.message });
      console.error(`  ✗ ${slug}: ${err.message}`);
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Total: ${results.success} exported, ${results.errors.length} errors`);
  for (const [series, count] of Object.entries(seriesCount).sort()) {
    console.log(`  ${SERIES_MAP[series]?.name || series}: ${count}`);
  }
  if (results.errors.length > 0) {
    console.log('\nErrors:');
    for (const e of results.errors) {
      console.log(`  ${e.slug}: ${e.error}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
