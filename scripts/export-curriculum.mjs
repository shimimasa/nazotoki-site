/**
 * export-curriculum.mjs
 * docs/curriculum/curriculum-mapping.md を解析して
 * site/src/data/curriculum.json を生成する
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MAPPING_FILE = path.resolve(ROOT, '..', 'docs', 'curriculum', 'curriculum-mapping.md');
const OUT_FILE = path.resolve(ROOT, 'src', 'data', 'meta', 'curriculum.json');

const text = fs.readFileSync(MAPPING_FILE, 'utf-8');

// Parse each series table
const curriculum = {};

// Time Travel
const ttRows = text.match(/\| \d+ \| time-travel-\d.+/g) || [];
for (const row of ttRows) {
  const cols = row.split('|').map(c => c.trim()).filter(Boolean);
  const slug = cols[1];
  curriculum[slug] = {
    grade: cols[3],
    subject: cols[4],
    unit: cols[5],
    standard: cols[6],
    keywords: cols[7],
  };
}

// Literature
const litRows = text.match(/\| \d+ \| literature-\d.+/g) || [];
for (const row of litRows) {
  const cols = row.split('|').map(c => c.trim()).filter(Boolean);
  const slug = cols[1];
  curriculum[slug] = {
    grade: cols[3],
    subject: cols[4],
    unit: cols[5],
    standard: cols[6],
    keywords: cols[7],
  };
}

// Math
const mathRows = text.match(/\| \d+ \| math-\d.+/g) || [];
for (const row of mathRows) {
  const cols = row.split('|').map(c => c.trim()).filter(Boolean);
  const slug = cols[1];
  curriculum[slug] = {
    grade: cols[3],
    subject: cols[4],
    unit: cols[5],
    standard: cols[6],
    keywords: cols[7],
  };
}

// Science
const sciRows = text.match(/\| \d+ \| science-\d.+/g) || [];
for (const row of sciRows) {
  const cols = row.split('|').map(c => c.trim()).filter(Boolean);
  const slug = cols[1];
  curriculum[slug] = {
    grade: cols[3],
    subject: cols[4],
    unit: cols[5],
    standard: cols[6],
    keywords: cols[7],
  };
}

// Popculture
const popRows = text.match(/\| \d+ \| popculture-\d.+/g) || [];
for (const row of popRows) {
  const cols = row.split('|').map(c => c.trim()).filter(Boolean);
  const slug = cols[1];
  curriculum[slug] = {
    grade: cols[3],
    subject: cols[4],
    unit: cols[5] || '',
    standard: '',
    keywords: cols[6] || '',
  };
}

// Moral
const moralRows = text.match(/\| \d+ \| moral-\d.+/g) || [];
for (const row of moralRows) {
  const cols = row.split('|').map(c => c.trim()).filter(Boolean);
  const slug = cols[1];
  curriculum[slug] = {
    grade: cols[3],
    subject: '道徳',
    unit: cols[4],
    standard: '',
    keywords: cols[5] || '',
  };
}

fs.writeFileSync(OUT_FILE, JSON.stringify(curriculum, null, 2), 'utf-8');
console.log(`Exported curriculum data: ${Object.keys(curriculum).length} entries → ${OUT_FILE}`);
