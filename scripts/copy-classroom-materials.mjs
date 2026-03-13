/**
 * Phase 158: Copy classroom PDF materials from apps/madamisu/ to public/classroom/
 *
 * Scans apps/madamisu/{slug}/ for classroom-30-guide.pdf, student-worksheet-30.pdf,
 * testplay-worksheet-30.pdf and copies them to public/classroom/{slug}/.
 */

import fs from 'node:fs';
import path from 'node:path';

const SOURCE_DIR = path.resolve('..', 'apps', 'madamisu');
const DEST_DIR = path.resolve('public', 'classroom');

const TARGET_FILES = [
  'classroom-30-guide.pdf',
  'student-worksheet-30.pdf',
  'testplay-worksheet-30.pdf',
];

// Ensure destination root exists
fs.mkdirSync(DEST_DIR, { recursive: true });

let totalCopied = 0;
let scenarioCount = 0;

const slugDirs = fs.readdirSync(SOURCE_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

for (const slug of slugDirs) {
  const srcDir = path.join(SOURCE_DIR, slug);
  let copied = 0;

  for (const fileName of TARGET_FILES) {
    const srcPath = path.join(srcDir, fileName);
    if (fs.existsSync(srcPath)) {
      const destSlugDir = path.join(DEST_DIR, slug);
      fs.mkdirSync(destSlugDir, { recursive: true });
      fs.copyFileSync(srcPath, path.join(destSlugDir, fileName));
      copied++;
    }
  }

  if (copied > 0) {
    scenarioCount++;
    totalCopied += copied;
  }
}

console.log(`[copy-classroom-materials] ${totalCopied} files copied from ${scenarioCount} scenarios to public/classroom/`);
