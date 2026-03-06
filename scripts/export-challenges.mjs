/**
 * export-challenges.mjs
 * content/challenges/*.md を解析して
 * site/src/data/meta/challenges.json を生成する
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHALLENGES_DIR = path.resolve(ROOT, '..', 'content', 'challenges');
const OUT_FILE = path.resolve(ROOT, 'src', 'data', 'meta', 'challenges.json');

const files = [
  { file: 'moral-dilemma.md', category: 'moral', categoryLabel: '道徳ジレンマ' },
  { file: 'logic-puzzle.md', category: 'logic', categoryLabel: '推理' },
  { file: 'subject-connect.md', category: 'subject', categoryLabel: '教科接続' },
];

const challenges = [];

for (const { file, category, categoryLabel } of files) {
  const filePath = path.join(CHALLENGES_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.warn(`SKIP: ${file} not found`);
    continue;
  }
  const text = fs.readFileSync(filePath, 'utf-8');

  // ## X-XX: タイトル で分割
  const sections = text.split(/^## /m).slice(1);

  for (const section of sections) {
    const lines = section.split('\n');
    const headerMatch = lines[0].match(/^([ABC]-\d{2}):\s*(.+)/);
    if (!headerMatch) continue;

    const id = headerMatch[1];
    const title = headerMatch[2].trim();

    // メタデータ抽出
    const difficultyMatch = section.match(/難易度:\s*(L[123])/);
    const subjectMatch = section.match(/関連教科:\s*(.+)/);
    const themeMatch = section.match(/関連テーマ:\s*(.+)/);
    const typeMatch = section.match(/推理タイプ:\s*(.+)/);
    const unitMatch = section.match(/単元ヒント:\s*(.+)/);
    const scenarioMatch = section.match(/関連シナリオ:\s*(\S+)/);

    // 問題文抽出
    const questionMatch = section.match(/\*\*問題:\*\*\n([\s\S]*?)(?=\n\*\*(?:考えるヒント|ヒント):)/);
    const question = questionMatch ? questionMatch[1].trim() : '';

    // ヒント抽出
    const hintsMatch = section.match(/\*\*(?:考えるヒント|ヒント):\*\*\n([\s\S]*?)(?=\n\*\*(?:答え|議論|考えるヒント|解説):|\n---)/);
    const hintsRaw = hintsMatch ? hintsMatch[1].trim() : '';
    const hints = hintsRaw.split('\n').filter(l => l.match(/^\d+\./)).map(l => l.replace(/^\d+\.\s*/, '').trim());

    // カテゴリ別の回答/議論部分
    let answer = '';
    let explanation = '';

    if (category === 'moral') {
      const discussionMatch = section.match(/\*\*議論ポイント:\*\*\n([\s\S]*?)(?=\n---|\n\*\*関連|$)/);
      explanation = discussionMatch ? discussionMatch[1].trim() : '';
    } else if (category === 'logic') {
      const thinkHintMatch = section.match(/\*\*考えるヒント:\*\*\n([\s\S]*?)(?=\n\*\*答え:)/);
      const answerMatch = section.match(/\*\*答え:\*\*\n([\s\S]*?)(?=\n\*\*解説:)/);
      const explMatch = section.match(/\*\*解説:\*\*\n([\s\S]*?)(?=\n---|\n\*\*関連|$)/);
      answer = answerMatch ? answerMatch[1].trim() : '';
      explanation = explMatch ? explMatch[1].trim() : '';
      // ヒントを再抽出（推理型は「ヒント:」と「考えるヒント:」が別）
      const puzzleHintsMatch = section.match(/\*\*ヒント:\*\*\n([\s\S]*?)(?=\n\*\*考えるヒント:)/);
      if (puzzleHintsMatch) {
        const puzzleHints = puzzleHintsMatch[1].trim().split('\n').filter(l => l.match(/^\d+\./)).map(l => l.replace(/^\d+\.\s*/, '').trim());
        // 考えるヒントも取得
        const thinkHints = thinkHintMatch ? thinkHintMatch[1].trim().split('\n').filter(l => l.match(/^-/)).map(l => l.replace(/^-\s*/, '').trim()) : [];
        // hintsをpuzzleHintsで上書き、thinkHintsは別フィールド
        hints.length = 0;
        hints.push(...puzzleHints);
      }
    } else {
      const ansExplMatch = section.match(/\*\*答えと解説:\*\*\n([\s\S]*?)(?=\n\*\*豆知識:|\n---|\n\*\*関連|$)/);
      explanation = ansExplMatch ? ansExplMatch[1].trim() : '';
      const triviaMatch = section.match(/\*\*豆知識:\*\*\n([\s\S]*?)(?=\n---|\n\*\*関連|$)/);
      if (triviaMatch) {
        explanation += '\n\n💡 ' + triviaMatch[1].trim();
      }
    }

    challenges.push({
      id,
      title,
      category,
      categoryLabel,
      difficulty: difficultyMatch ? difficultyMatch[1] : 'L1',
      subject: subjectMatch ? subjectMatch[1].trim() : '',
      theme: themeMatch ? themeMatch[1].trim() : '',
      puzzleType: typeMatch ? typeMatch[1].trim() : '',
      unit: unitMatch ? unitMatch[1].trim() : '',
      question,
      hints,
      answer,
      explanation,
      relatedScenario: scenarioMatch ? scenarioMatch[1].trim() : '',
    });
  }
}

// IDでソート
challenges.sort((a, b) => a.id.localeCompare(b.id));

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(challenges, null, 2), 'utf-8');
console.log(`✅ ${challenges.length} challenges exported to ${OUT_FILE}`);
