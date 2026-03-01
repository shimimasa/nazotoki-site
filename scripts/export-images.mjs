/**
 * export-images.mjs
 * assets/images/{slug}/manifest.json を検出し、WebP変換+リサイズして
 * site/public/images/{slug}/ に出力する。
 *
 * 出力:
 *   public/images/{slug}/thumb.webp        — サムネイル (400px幅)
 *   public/images/{slug}/char-{charId}.webp — キャラ画像 (600px幅)
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.resolve(ROOT, '..', 'assets', 'images');
const BOOTH_THUMBS = path.resolve(ASSETS, 'booth-thumbnails');
const OUT = path.resolve(ROOT, 'public', 'images');

const THUMB_WIDTH = 400;
const THUMB_QUALITY = 80;
const CHAR_WIDTH = 600;
const CHAR_QUALITY = 80;

async function convertImage(srcPath, destPath, width, quality) {
  await sharp(srcPath)
    .resize(width, null, { withoutEnlargement: true })
    .webp({ quality })
    .toFile(destPath);
}

async function processSlug(slugDir, slugName) {
  const manifestPath = path.join(slugDir, 'manifest.json');

  let manifest;
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    manifest = JSON.parse(raw);
  } catch {
    return null; // no manifest → skip
  }

  const outDir = path.join(OUT, slugName);
  await fs.mkdir(outDir, { recursive: true });

  const results = { slug: slugName, thumb: false, characters: [] };

  // --- Thumbnail ---
  let thumbSrc = null;

  if (manifest.thumbnail) {
    // manifest で指定されたサムネイル
    const p = path.join(slugDir, manifest.thumbnail);
    try {
      await fs.access(p);
      thumbSrc = p;
    } catch { /* file not found */ }
  }

  if (!thumbSrc) {
    // booth-thumbnails からフォールバック
    // slugName は "moral-01" 形式 → "thumb-moral-01.png" を探す
    const boothThumb = path.join(BOOTH_THUMBS, `thumb-${slugName}.png`);
    try {
      await fs.access(boothThumb);
      thumbSrc = boothThumb;
    } catch { /* not found */ }
  }

  if (thumbSrc) {
    const destThumb = path.join(outDir, 'thumb.webp');
    await convertImage(thumbSrc, destThumb, THUMB_WIDTH, THUMB_QUALITY);
    results.thumb = true;
  }

  // --- Character images ---
  if (manifest.characters) {
    for (const [charId, filename] of Object.entries(manifest.characters)) {
      const srcPath = path.join(slugDir, filename);
      try {
        await fs.access(srcPath);
      } catch {
        console.warn(`  ! ${slugName}: character image not found: ${filename}`);
        continue;
      }
      const destPath = path.join(outDir, `char-${charId}.webp`);
      await convertImage(srcPath, destPath, CHAR_WIDTH, CHAR_QUALITY);
      results.characters.push(charId);
    }
  }

  return results;
}

async function main() {
  console.log('Exporting images...');
  console.log(`Source: ${ASSETS}`);
  console.log(`Output: ${OUT}`);

  // assets/images/ 直下のディレクトリを走査
  const entries = await fs.readdir(ASSETS, { withFileTypes: true });
  const dirs = entries
    .filter(e => e.isDirectory() && e.name !== 'booth-thumbnails' && !e.name.startsWith('.'))
    .map(e => e.name)
    .sort();

  let processed = 0;
  let skipped = 0;

  for (const dir of dirs) {
    const slugDir = path.join(ASSETS, dir);
    const result = await processSlug(slugDir, dir);

    if (!result) {
      skipped++;
      console.log(`  - ${dir}: no manifest.json (skipped)`);
      continue;
    }

    processed++;
    const charStr = result.characters.length > 0
      ? `chars: ${result.characters.join(', ')}`
      : 'no chars';
    console.log(`  ✓ ${dir}: thumb=${result.thumb}, ${charStr}`);
  }

  console.log(`\n--- Summary ---`);
  console.log(`Processed: ${processed}, Skipped: ${skipped}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
