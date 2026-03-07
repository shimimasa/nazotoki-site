import type { SessionLogRow } from '../../lib/supabase';

const PHASE_LABELS: Record<string, string> = {
  intro: '導入',
  explore: '探索',
  twist: '反転',
  discuss: '議論',
  vote: '投票',
  truth: '真相',
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatMinSec(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}分${s > 0 ? `${String(s).padStart(2, '0')}秒` : ''}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function exportSessionPDF(log: SessionLogRow) {
  const title = log.scenario_title || log.scenario_slug;
  const voteEntries = log.vote_results
    ? Object.entries(log.vote_results)
    : [];
  const correctSet = new Set(log.correct_players || []);

  // Build phase durations section
  let phaseDurationsHtml = '';
  if (log.phase_durations && Object.keys(log.phase_durations).length > 0) {
    const rows = Object.entries(log.phase_durations)
      .map(
        ([key, secs]) =>
          `<tr><td>${PHASE_LABELS[key] || key}</td><td style="text-align:right">${formatMinSec(secs)}</td></tr>`,
      )
      .join('');
    phaseDurationsHtml = `
      <h2>授業分析</h2>
      <table>
        <thead><tr><th>フェーズ</th><th style="text-align:right">所要時間</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // Build vote results section
  let votesHtml = '';
  if (voteEntries.length > 0) {
    const rows = voteEntries
      .map(([voterId, suspectId]) => {
        const reason = log.vote_reasons?.[voterId] || '';
        const isCorrect =
          correctSet.has(voterId) || correctSet.has(suspectId);
        const mark = isCorrect ? '○' : '△';
        return `<tr>
          <td>${mark}</td>
          <td>${escapeHtml(voterId)}</td>
          <td>${escapeHtml(suspectId)}</td>
          <td>${reason ? `「${escapeHtml(reason)}」` : ''}</td>
        </tr>`;
      })
      .join('');

    const correctCount = log.correct_players?.length || 0;
    votesHtml = `
      <h2>投票結果</h2>
      <table>
        <thead><tr><th></th><th>投票者</th><th>投票先</th><th>理由</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p>正解者: ${correctCount} / ${voteEntries.length}人</p>
    `;
  }

  // Build evidence section
  let evidenceHtml = '';
  if (log.discovered_evidence && log.discovered_evidence.length > 0) {
    const items = log.discovered_evidence
      .map((num) => `証拠 ${num}`)
      .join('、');
    evidenceHtml = `
      <h2>発見証拠</h2>
      <p>${items}</p>
      ${log.twist_revealed ? '<p>反転証拠: 公開済み</p>' : ''}
    `;
  }

  // Build GM memo section
  let memoHtml = '';
  if (log.gm_memo && log.gm_memo.trim()) {
    memoHtml = `
      <h2>GMメモ</h2>
      <div class="memo">${escapeHtml(log.gm_memo).replace(/\n/g, '<br>')}</div>
    `;
  }

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>授業ログ - ${escapeHtml(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif;
      padding: 40px;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      line-height: 1.6;
    }
    h1 {
      font-size: 22px;
      border-bottom: 3px solid #f59e0b;
      padding-bottom: 8px;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 13px;
      color: #666;
      margin-bottom: 24px;
    }
    h2 {
      font-size: 16px;
      margin-top: 24px;
      margin-bottom: 8px;
      padding: 4px 8px;
      background: #f9fafb;
      border-left: 4px solid #f59e0b;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 14px;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 6px 10px;
      text-align: left;
    }
    th { background: #f3f4f6; font-weight: bold; }
    .meta-table td { border: none; padding: 3px 10px 3px 0; }
    .meta-table th { border: none; background: none; color: #666; font-weight: normal; padding: 3px 10px 3px 0; }
    .memo {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 4px;
      padding: 12px;
      font-size: 14px;
      white-space: pre-wrap;
    }
    .footer {
      margin-top: 32px;
      padding-top: 12px;
      border-top: 1px solid #ddd;
      font-size: 11px;
      color: #999;
      text-align: center;
    }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 20px; text-align: right;">
    <button onclick="window.print()" style="background:#4f46e5;color:white;border:none;padding:8px 20px;border-radius:6px;font-weight:bold;cursor:pointer;">
      印刷 / PDF保存
    </button>
  </div>

  <h1>授業ログ: ${escapeHtml(title)}</h1>
  <div class="subtitle">ナゾトキ探偵団 授業実施記録</div>

  <h2>基本情報</h2>
  <table class="meta-table">
    <tr><th>シナリオ</th><td>${escapeHtml(title)}</td></tr>
    ${log.start_time ? `<tr><th>開始時間</th><td>${formatDate(log.start_time)}</td></tr>` : ''}
    ${log.end_time ? `<tr><th>終了時間</th><td>${formatDate(log.end_time)}</td></tr>` : ''}
    ${log.duration != null ? `<tr><th>授業時間</th><td>${formatMinSec(log.duration)}</td></tr>` : ''}
  </table>

  ${phaseDurationsHtml}
  ${votesHtml}
  ${evidenceHtml}
  ${memoHtml}

  <div class="footer">
    ナゾトキ探偵団 授業ログ | 出力日: ${new Date().toLocaleDateString('ja-JP')}
  </div>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}
