/**
 * Phase 66: Export scenario JSON for student client-side fetching
 *
 * Reads /src/data/{slug}.json (raw markdown) and outputs
 * /public/data/scenarios/{slug}.json (rendered HTML, minimal fields)
 *
 * Used by StudentSession (Phase 67) to show rich content on student devices.
 */

import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

marked.setOptions({ breaks: true, gfm: true });

// Phase 73: HTML sanitization — strip XSS vectors while preserving safe content
const SANITIZE_OPTIONS = {
  allowedTags: [
    // Text formatting
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'b', 'i', 'u', 's', 'del', 'br', 'hr',
    // Lists
    'ul', 'ol', 'li',
    // Tables
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    // Code
    'code', 'pre',
    // Quotes
    'blockquote',
    // Links (href validated below)
    'a',
    // Ruby (furigana)
    'ruby', 'rt', 'rp',
    // Spans for styling
    'span', 'div',
    // Images (src validated below)
    'img',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    th: ['align'],
    td: ['align'],
    '*': ['class'],
  },
  allowedSchemes: ['http', 'https'],
  disallowedTagsMode: 'escape',
};

function convertFurigana(text) {
  return text.replace(
    /\{([^}|]+)\|([^}]+)\}/g,
    (_match, kanji, reading) =>
      `<ruby>${kanji}<rp>(</rp><rt>${reading}</rt><rp>)</rp></ruby>`,
  );
}

function renderMarkdown(md) {
  if (!md) return '';
  const raw = marked.parse(convertFurigana(md));
  return sanitizeHtml(raw, SANITIZE_OPTIONS);
}

/**
 * Phase 161: Extract culprit name from truth text.
 * Returns null for moral/non-mystery scenarios or ambiguous results.
 */
function extractCulprit(truth) {
  if (!truth) return null;
  // P2 fix: Normalize furigana and markdown emphasis before matching
  const normalized = truth
    .replace(/\{([^}|]+)\|[^}]+\}/g, '$1')       // {漢字|読み} → 漢字
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');     // **text** → text
  const match = normalized.match(/犯人[:：は]\s*(.+?)(?:\s*[（(]|$|\n|。)/);
  if (!match) return null;
  const name = match[1].trim();
  // Filter out non-name results
  if (!name || /いない|不確定|確定しない|全員|なし/.test(name)) return null;
  return name;
}

const dataDir = path.resolve('src/data');
const outDir = path.resolve('public/data/scenarios');

// Ensure output directory exists
fs.mkdirSync(outDir, { recursive: true });

const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
let count = 0;
const scenarioIndex = [];

for (const file of files) {
  const raw = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
  const slug = raw.slug || file.replace('.json', '');

  // Collect metadata for scenario-index.json (used by client-side recommendations)
  scenarioIndex.push({
    slug,
    title: raw.title || '',
    series: raw.series || '',
    seriesName: raw.seriesName || '',
    difficulty: raw.difficulty || '',
    subject: raw.subject || '',
  });

  const output = {
    slug,
    title: raw.title,
    character_names: (raw.characters || [])
      .filter((c) => !c.isNPC)
      .map((c) => c.name),
    common_html: renderMarkdown(raw.common),
    synopsis_html: renderMarkdown(raw.synopsis),
    evidence_cards: (raw.evidenceCards || []).map((c) => ({
      number: c.number,
      title: c.title,
      content_html: renderMarkdown(c.content),
    })),
    evidence5: raw.evidence5
      ? {
          number: raw.evidence5.number,
          title: raw.evidence5.title,
          content_html: renderMarkdown(raw.evidence5.content),
        }
      : null,
    // Phase 161: Culprit name for vote correctness display
    culprit_name: extractCulprit(raw.truth),
    // Phase 133: Character data for student session
    // Codex M3 fix: Exclude secret_html from public JSON to prevent client-side inspection
    characters: (raw.characters || []).filter((c) => !c.isNPC).map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      intro_html: renderMarkdown(c.introContent || ''),
      public_html: renderMarkdown(c.publicContent || ''),
      imageUrl: c.imageUrl || null,  // Phase 157
    })),
  };

  fs.writeFileSync(
    path.join(outDir, `${slug}.json`),
    JSON.stringify(output),
    'utf8',
  );
  count++;
}

// Write scenario index for client-side recommendations
const indexPath = path.resolve('public/data/scenario-index.json');
fs.writeFileSync(indexPath, JSON.stringify(scenarioIndex), 'utf8');

console.log(`[export-scenario-json] ${count} scenario JSONs exported to public/data/scenarios/`);
console.log(`[export-scenario-json] scenario-index.json exported (${scenarioIndex.length} entries)`);
