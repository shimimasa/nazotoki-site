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

// Phase 133: Extract secret section from fullContent
// Codex M2 fix: Match all header variants across 100 scenarios
function extractSecret(fullContent) {
  if (!fullContent) return '';

  // Strategy 1: ## or ### headers containing 秘密/ひみつ/きみだけの
  // Covers: ## ひみつの情報, ## 秘密情報（...）, ### ★秘密★, ### きみだけのひみつ, etc.
  const headerPattern = /^#{2,3}\s+.*(?:秘密|ひみつ|きみだけの).*$/m;
  const match = fullContent.match(headerPattern);
  if (match) {
    return fullContent.substring(match.index + match[0].length).trim();
  }

  // Strategy 2: "真実（自分だけの情報）" pattern (e.g., time-travel-04 アキラ)
  const truthPattern = /^#{2,3}\s+.*真実.*自分だけ.*$/m;
  const truthMatch = fullContent.match(truthPattern);
  if (truthMatch) {
    return fullContent.substring(truthMatch.index + truthMatch[0].length).trim();
  }

  return '';
}

const dataDir = path.resolve('src/data');
const outDir = path.resolve('public/data/scenarios');

// Ensure output directory exists
fs.mkdirSync(outDir, { recursive: true });

const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
let count = 0;

for (const file of files) {
  const raw = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
  const slug = raw.slug || file.replace('.json', '');

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
    // Phase 133: Character data for student session
    // Codex M3 fix: Exclude secret_html from public JSON to prevent client-side inspection
    characters: (raw.characters || []).filter((c) => !c.isNPC).map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      intro_html: renderMarkdown(c.introContent || ''),
      public_html: renderMarkdown(c.publicContent || ''),
    })),
  };

  fs.writeFileSync(
    path.join(outDir, `${slug}.json`),
    JSON.stringify(output),
    'utf8',
  );
  count++;
}

console.log(`[export-scenario-json] ${count} scenario JSONs exported to public/data/scenarios/`);
