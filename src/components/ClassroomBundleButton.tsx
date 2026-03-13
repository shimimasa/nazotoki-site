/**
 * Phase 158: Classroom materials bundle download button.
 * Fetches PDFs from /classroom/{slug}/, generates killer-questions HTML,
 * zips with fflate, and triggers download.
 */
import { useState } from 'preact/hooks';
import { zipSync, strToU8 } from 'fflate';

interface KillerQuestion {
  scene: string;
  question: string;
}

interface Props {
  slug: string;
  title: string;
  killerQuestions: KillerQuestion[];
}

const PDF_FILES = [
  { name: 'classroom-30-guide.pdf', label: '授業進行ガイド' },
  { name: 'student-worksheet-30.pdf', label: '生徒用ワークシート' },
  { name: 'testplay-worksheet-30.pdf', label: 'テストプレイ用シート' },
];

function generateKillerQuestionsHtml(title: string, questions: KillerQuestion[]): string {
  const rows = questions.map(q =>
    `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">${q.scene}</td><td style="padding:8px;border:1px solid #ddd">${q.question}</td></tr>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><title>${title} - キラー質問カード</title>
<style>
  body { font-family: 'Hiragino Sans', 'Noto Sans JP', sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.5rem; border-bottom: 3px solid #f59e0b; padding-bottom: 0.5rem; }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
  th { background: #fef3c7; padding: 8px; border: 1px solid #ddd; text-align: left; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<h1>${title} - キラー質問カード</h1>
<p>授業中に使える「考えを深める質問」です。</p>
<table>
<thead><tr><th>場面</th><th>質問</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body>
</html>`;
}

export default function ClassroomBundleButton({ slug, title, killerQuestions }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleDownload = async () => {
    setDownloading(true);
    setStatus(null);

    try {
      const zipFiles: Record<string, Uint8Array> = {};

      // Fetch PDFs
      for (const file of PDF_FILES) {
        try {
          const res = await fetch(`/classroom/${slug}/${file.name}`);
          if (res.ok) {
            const buf = await res.arrayBuffer();
            zipFiles[file.name] = new Uint8Array(buf);
          }
        } catch { /* skip missing files */ }
      }

      // Generate killer questions HTML
      if (killerQuestions.length > 0) {
        const html = generateKillerQuestionsHtml(title, killerQuestions);
        zipFiles['killer-questions.html'] = strToU8(html);
      }

      if (Object.keys(zipFiles).length === 0) {
        setStatus('準備中です。まだダウンロードできるファイルがありません。');
        setDownloading(false);
        return;
      }

      const zipped = zipSync(zipFiles, { level: 6 });
      const blob = new Blob([zipped], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}-classroom-bundle.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus(`${Object.keys(zipFiles).length}ファイルをダウンロードしました`);
    } catch {
      setStatus('ダウンロードに失敗しました。もう一度お試しください。');
    }
    setDownloading(false);
  };

  return (
    <div>
      <button
        onClick={handleDownload}
        disabled={downloading}
        class={`flex items-center gap-2 w-full px-4 py-2.5 rounded-lg font-bold transition-colors no-underline text-sm mb-2 ${
          downloading
            ? 'bg-blue-400 text-white cursor-wait'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        <span class="text-lg">{downloading ? '\u23F3' : '\uD83D\uDCE6'}</span>
        {downloading ? 'ダウンロード中...' : '授業資料を一括DL'}
      </button>
      {status && (
        <p class={`text-xs mt-1 ${status.includes('失敗') || status.includes('準備中') ? 'text-amber-700' : 'text-blue-700'}`}>
          {status}
        </p>
      )}
      <p class="text-xs text-blue-800 mt-1">
        進行ガイド・ワークシート・キラー質問をZIPでまとめてダウンロード。
      </p>
    </div>
  );
}
