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

// ── シリーズ定義 ──────────────────────────────
const SERIES_MAP = {
  'time-travel': { name: 'タイムトラベル探偵団', subject: '歴史（社会科）', order: 1 },
  'literature':  { name: '名作文学ミステリー', subject: '国語', order: 2 },
  'popculture':  { name: 'マンガ教養ミステリー', subject: 'ポップカルチャー', order: 3 },
  'math':        { name: '数字の迷宮', subject: '算数', order: 4 },
  'science':     { name: 'サイエンス捜査班', subject: '理科', order: 5 },
  'moral':       { name: '答えのない法廷', subject: '道徳', order: 6 },
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
  const m = md.match(/^#\s+(.+)/m);
  if (!m) return '';
  // "ナゾトキ探偵団 Vol.1「消えた黄金の茶室」" → "消えた黄金の茶室"
  const full = m[1].trim();
  const titleMatch = full.match(/[「『](.+?)[」』]/);
  return titleMatch ? titleMatch[1] : full;
}

function parseFullTitle(md) {
  const m = md.match(/^#\s+(.+)/m);
  return m ? m[1].trim() : '';
}

function parseSection(md, headerPattern, nextHeaderLevel = 3) {
  const regex = new RegExp(`^#{${nextHeaderLevel}}\\s+${headerPattern}[\\s\\S]*?$`, 'gm');
  const match = md.match(regex);
  if (!match) return '';

  const startIdx = md.indexOf(match[0]);
  const afterHeader = md.slice(startIdx + match[0].length);
  // Find next same-level or higher header
  const nextMatch = afterHeader.match(new RegExp(`^#{1,${nextHeaderLevel}}\\s+`, 'm'));
  const content = nextMatch
    ? afterHeader.slice(0, nextMatch.index)
    : afterHeader;
  return content.trim();
}

function parseSynopsis(md) {
  // 「あらすじ」セクションの内容を取得
  const section = parseSection(md, 'あらすじ');
  return section.replace(/\n+/g, '\n').trim();
}

function parseTruth(md) {
  // 「事件の真相」セクションの内容を取得
  const section = parseSection(md, '事件の真相');
  return section.trim();
}

function parseLearningGoals(md) {
  const section = parseSection(md, '学習目標');
  return section.trim();
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
  // Name from title
  const titleMatch = md.match(/^#\s*キャラクターシート[：:]\s*(.+)/m);
  const name = titleMatch ? titleMatch[1].trim() : id;

  // Split into public and secret sections
  const publicMarker = /###\s*みんなに言っていい情報/;
  const secretMarker = /###\s*★\s*秘密/;

  let introContent = '';
  let publicContent = '';
  let secretContent = '';

  // Intro: everything from "きみはだれ？" to public info
  const introMatch = md.match(/###\s*きみはだれ？([\s\S]*?)(?=###\s*みんなに言っていい|$)/);
  if (introMatch) introContent = introMatch[1].trim();

  // Public info section
  const publicMatch = md.match(/###\s*みんなに言っていい情報[^\n]*([\s\S]*?)(?=###\s*★|$)/);
  if (publicMatch) publicContent = publicMatch[1].trim();

  // Secret info section (everything from ★秘密 onwards)
  const secretMatch = md.match(/(###\s*★\s*秘密[\s\S]*$)/);
  if (secretMatch) secretContent = secretMatch[1].trim();

  // Role from intro
  const roleMatch = introContent.match(/^(.+?)(?:\n|$)/);
  const role = roleMatch ? roleMatch[1].replace(/\*\*/g, '').replace(/——/g, '').trim().slice(0, 50) : '';

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
    common: commonRaw,
    evidenceCards,
    evidence5: card5,
    characters,
    solution: solutionRaw,
    gmGuide: gmGuideRaw,
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

  // 出力先クリーン & 作成
  await fs.rm(CONTENT_OUT, { recursive: true, force: true });
  await fs.rm(DATA_OUT, { recursive: true, force: true });
  await fs.mkdir(CONTENT_OUT, { recursive: true });
  await fs.mkdir(DATA_OUT, { recursive: true });

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
