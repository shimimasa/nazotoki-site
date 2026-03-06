/**
 * OGP画像生成スクリプト
 * satori + @resvg/resvg-js でビルド時にPNG画像を生成する
 *
 * Usage: node scripts/generate-og-images.mjs
 */
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'og');

// Google Fonts から Noto Sans JP を取得
async function fetchFont(weight) {
  // woff2 形式で取得（satori は woff2 非対応のため、woff/ttf で取得する）
  // Safari UA で TTF 形式を強制
  const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@${weight}`;
  const css = await fetch(cssUrl, {
    headers: {
      'User-Agent': 'Safari/537.36',
    },
  }).then(r => r.text());

  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1]);
  if (urls.length === 0) throw new Error(`Font URL not found for weight ${weight}`);

  // 最後のURLを使用（通常はラテン+CJKを含むフルセット）
  const fontUrl = urls[urls.length - 1];
  console.log(`  Font w${weight}: ${fontUrl.substring(0, 60)}...`);
  const fontData = await fetch(fontUrl).then(r => r.arrayBuffer());
  console.log(`  Font w${weight}: ${(fontData.byteLength / 1024).toFixed(0)} KB`);
  return fontData;
}

// OGP画像テンプレート
function createOgElement({ title, subtitle, badge, accentColor = '#f59e0b' }) {
  const children = [];

  // アクセントライン（上部）
  children.push({
    type: 'div',
    props: {
      style: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '1200px',
        height: '6px',
        background: accentColor,
      },
    },
  });

  // メインコンテンツ
  const contentChildren = [];

  // バッジ（シリーズ名など）
  if (badge) {
    contentChildren.push({
      type: 'div',
      props: {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '16px',
        },
        children: {
          type: 'span',
          props: {
            style: {
              background: accentColor,
              color: 'white',
              padding: '6px 16px',
              borderRadius: '6px',
              fontSize: '22px',
              fontWeight: 700,
            },
            children: badge,
          },
        },
      },
    });
  }

  // タイトル
  contentChildren.push({
    type: 'div',
    props: {
      style: {
        fontSize: title.length > 20 ? 52 : 60,
        fontWeight: 900,
        color: 'white',
        lineHeight: 1.3,
        letterSpacing: '-0.02em',
        maxWidth: '1000px',
      },
      children: title,
    },
  });

  // サブタイトル
  if (subtitle) {
    contentChildren.push({
      type: 'div',
      props: {
        style: {
          fontSize: 26,
          color: '#94a3b8',
          marginTop: '20px',
          lineHeight: 1.5,
          maxWidth: '900px',
        },
        children: subtitle,
      },
    });
  }

  children.push({
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        flex: 1,
        padding: '60px 80px',
      },
      children: contentChildren,
    },
  });

  // フッター（ブランド名）
  children.push({
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 80px 40px',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: '#334155',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    color: '#94a3b8',
                  },
                  children: 'N',
                },
              },
              {
                type: 'span',
                props: {
                  style: { fontSize: 20, color: '#64748b', fontWeight: 700 },
                  children: 'nazotoki.gamanavi.com',
                },
              },
            ],
          },
        },
        {
          type: 'span',
          props: {
            style: { fontSize: 18, color: '#475569' },
            children: 'Designed by a certified teacher',
          },
        },
      ],
    },
  });

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '1200px',
        height: '630px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        position: 'relative',
        fontFamily: 'Noto Sans JP',
      },
      children,
    },
  };
}

// 画像定義
const PAGES = [
  {
    filename: 'top.png',
    title: '教科の知識で、謎を解け。',
    subtitle: '小学生から使える教育マーダーミステリー  全100シナリオ無料',
  },
  {
    filename: 'parents.png',
    title: '親子ではじめる教育マダミス',
    subtitle: '2人からOK。週末や長期休みに、親子で推理ゲーム',
    badge: '保護者向け',
    accentColor: '#f59e0b',
  },
  {
    filename: 'teachers.png',
    title: '授業で使う教育マダミス',
    subtitle: '45分完結 / 準備ゼロ / 学習指導要領対応 / 全100シナリオ無料',
    badge: '教員向け',
    accentColor: '#3b82f6',
  },
  {
    filename: 'beginners.png',
    title: 'GM初心者ガイド',
    subtitle: 'はじめてGM（進行役）をやる方へ。画面の指示に従うだけ',
    badge: 'ガイド',
    accentColor: '#22c55e',
  },
  // シリーズ
  {
    filename: 'series-time-travel.png',
    title: 'タイムトラベル探偵団',
    subtitle: '歴史の知識で事件を解く社会科シリーズ',
    badge: '歴史（社会科）',
    accentColor: '#d97706',
  },
  {
    filename: 'series-literature.png',
    title: '名作文学ミステリー',
    subtitle: '文学作品の世界に入り込む国語シリーズ',
    badge: '国語',
    accentColor: '#4f46e5',
  },
  {
    filename: 'series-popculture.png',
    title: 'マンガ教養ミステリー',
    subtitle: 'ポップカルチャーの知識で謎を解く教養シリーズ',
    badge: 'ポップカルチャー',
    accentColor: '#9333ea',
  },
  {
    filename: 'series-math.png',
    title: '数字の迷宮',
    subtitle: '算数の力で暗号を解読する算数シリーズ',
    badge: '算数',
    accentColor: '#059669',
  },
  {
    filename: 'series-science.png',
    title: 'サイエンス捜査班',
    subtitle: '科学実験と論理的思考で真実に迫る理科シリーズ',
    badge: '理科',
    accentColor: '#2563eb',
  },
  {
    filename: 'series-moral.png',
    title: '答えのない法廷',
    subtitle: '正解のない問いを議論する道徳シリーズ',
    badge: '道徳',
    accentColor: '#ea580c',
  },
];

async function main() {
  console.log('Fetching fonts...');
  const [fontBold, fontBlack] = await Promise.all([
    fetchFont(700),
    fetchFont(900),
  ]);

  const fonts = [
    { name: 'Noto Sans JP', data: fontBold, weight: 700, style: 'normal' },
    { name: 'Noto Sans JP', data: fontBlack, weight: 900, style: 'normal' },
  ];

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  for (const page of PAGES) {
    const element = createOgElement(page);
    const svg = await satori(element, { width: 1200, height: 630, fonts });
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
    });
    const png = resvg.render().asPng();
    const outPath = join(OUT_DIR, page.filename);
    writeFileSync(outPath, png);
    console.log(`  Generated: ${page.filename} (${(png.length / 1024).toFixed(0)} KB)`);
  }

  console.log(`Done! ${PAGES.length} images generated in public/og/`);
}

main().catch(console.error);
