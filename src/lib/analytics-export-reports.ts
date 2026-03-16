/**
 * Analytics export report builders and report-format exports.
 */

import type {
  ClassAggregateMetrics,
  ScenarioAggregateMetrics,
  StudentAggregateMetrics,
  SummaryMetrics,
} from './session-analytics';
import { formatMinSec, formatPercent, formatDate } from './session-analytics';
import type { ClassTrend } from './session-trends';
import type { Insight, ClassInsights } from './session-insights';
import type { MonthlyReportData } from './monthly-report';
import { monthLabel } from './monthly-report';
import type { MonthlyComparison } from './monthly-comparison';
import type { TermReportData } from './term-report';
import { termLabel } from './term-report';
import type { TermComparison, TermSummaryDeltas } from './term-comparison';
import type { AnnualReportData } from './annual-report';
import { annualLabel } from './annual-report';
import type { AnnualComparison } from './annual-comparison';
import type { SchoolReportData } from './school-report';
import { type DateRange, dateRangeLabel, toCSV, downloadCSV } from './analytics-export-csv';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface AnalyticsPDFData {
  range: DateRange;
  summary: SummaryMetrics;
  classMetrics: ClassAggregateMetrics[];
  scenarioMetrics: ScenarioAggregateMetrics[];
  studentMetrics: StudentAggregateMetrics[];
  classTrends: ClassTrend[];
  classInsightsMap: Map<string, ClassInsights>;
  latestSessionInsights: { title: string; insights: { observations: Insight[]; suggestions: Insight[] } } | null;
}

export function exportAnalyticsPDF(data: AnalyticsPDFData) {
  const {
    range, summary, classMetrics, scenarioMetrics,
    studentMetrics, classTrends, classInsightsMap, latestSessionInsights,
  } = data;

  const rangeText = dateRangeLabel(range);
  const now = new Date().toLocaleDateString('ja-JP');

  // Summary cards section
  const summaryHtml = `
    <div class="cards">
      <div class="card"><div class="card-value">${summary.totalSessions}</div><div class="card-label">総授業数</div></div>
      <div class="card"><div class="card-value">${summary.totalClasses}</div><div class="card-label">クラス数</div></div>
      <div class="card"><div class="card-value">${summary.totalStudents}</div><div class="card-label">生徒数</div></div>
      <div class="card"><div class="card-value">${formatPercent(summary.avgAccuracyRate)}</div><div class="card-label">平均正解率</div></div>
      <div class="card"><div class="card-value">${formatMinSec(summary.avgDuration)}</div><div class="card-label">平均授業時間</div></div>
      <div class="card"><div class="card-value">${formatMinSec(summary.avgDiscussTime)}</div><div class="card-label">平均議論時間</div></div>
    </div>
  `;

  // Class analysis table
  let classTableHtml = '';
  if (classMetrics.length > 0) {
    const classRows = classMetrics.map((m) => `
      <tr>
        <td>${escapeHtml(m.className)}${m.gradeLabel ? ` (${escapeHtml(m.gradeLabel)})` : ''}</td>
        <td style="text-align:center">${m.sessionCount}</td>
        <td style="text-align:center">${formatMinSec(m.avgDuration)}</td>
        <td style="text-align:center">${formatPercent(m.avgAccuracyRate)}</td>
        <td style="text-align:center">${formatMinSec(m.avgDiscussTime)}</td>
        <td style="text-align:center">${formatMinSec(m.avgExploreTime)}</td>
      </tr>
    `).join('');

    classTableHtml = `
      <h2>クラス別分析</h2>
      <table>
        <thead>
          <tr>
            <th>クラス</th><th style="text-align:center">実施数</th>
            <th style="text-align:center">平均時間</th><th style="text-align:center">正解率</th>
            <th style="text-align:center">議論</th><th style="text-align:center">探索</th>
          </tr>
        </thead>
        <tbody>${classRows}</tbody>
      </table>
    `;
  }

  // Scenario analysis table
  let scenarioTableHtml = '';
  if (scenarioMetrics.length > 0) {
    const top10 = scenarioMetrics.slice(0, 10);
    const scenarioRows = top10.map((m) => `
      <tr>
        <td>${escapeHtml(m.title)}</td>
        <td style="text-align:center">${m.sessionCount}</td>
        <td style="text-align:center">${formatMinSec(m.avgDuration)}</td>
        <td style="text-align:center">${formatPercent(m.avgAccuracyRate)}</td>
        <td style="text-align:center">${formatPercent(m.avgVoteReasonRate)}</td>
      </tr>
    `).join('');

    scenarioTableHtml = `
      <h2>シナリオ別分析${scenarioMetrics.length > 10 ? ` (上位10件 / 全${scenarioMetrics.length}件)` : ''}</h2>
      <table>
        <thead>
          <tr>
            <th>シナリオ</th><th style="text-align:center">実施数</th>
            <th style="text-align:center">平均時間</th><th style="text-align:center">正解率</th>
            <th style="text-align:center">理由記入率</th>
          </tr>
        </thead>
        <tbody>${scenarioRows}</tbody>
      </table>
    `;
  }

  // Student participation summary (top 20)
  let studentTableHtml = '';
  if (studentMetrics.length > 0) {
    const sorted = [...studentMetrics].sort((a, b) => b.participationCount - a.participationCount);
    const top20 = sorted.slice(0, 20);
    const studentRows = top20.map((m) => `
      <tr>
        <td>${escapeHtml(m.studentName)}</td>
        <td>${escapeHtml(m.className)}</td>
        <td style="text-align:center">${m.participationCount}</td>
        <td style="text-align:center">${m.correctCount}</td>
        <td style="text-align:center">${formatPercent(m.accuracyRate)}</td>
      </tr>
    `).join('');

    studentTableHtml = `
      <h2>生徒参加状況${sorted.length > 20 ? ` (上位20名 / 全${sorted.length}名)` : ''}</h2>
      <p class="note">参加ログの記録です。成績評価ではありません。</p>
      <table>
        <thead>
          <tr>
            <th>生徒名</th><th>クラス</th>
            <th style="text-align:center">参加回数</th>
            <th style="text-align:center">正解数</th>
            <th style="text-align:center">正解率</th>
          </tr>
        </thead>
        <tbody>${studentRows}</tbody>
      </table>
    `;
  }

  // Trend insights
  let trendInsightsHtml = '';
  const allTrendInsights: { className: string; insights: Insight[] }[] = [];
  classTrends.forEach((t) => {
    if (t.insights.length > 0) {
      allTrendInsights.push({ className: t.className, insights: t.insights });
    }
  });

  if (allTrendInsights.length > 0) {
    const items = allTrendInsights.map((ti) => `
      <div class="insight-group">
        <div class="insight-label">${escapeHtml(ti.className)}</div>
        <ul>${ti.insights.map((ins) => `<li>${escapeHtml(ins.text)}</li>`).join('')}</ul>
      </div>
    `).join('');
    trendInsightsHtml = `<h2>成長トレンド所見</h2>${items}`;
  }

  // Class insights
  let classInsightsHtml = '';
  const classInsightsList: { className: string; ci: ClassInsights }[] = [];
  classMetrics.forEach((cm) => {
    const ci = classInsightsMap.get(cm.classId);
    if (ci && (ci.observations.length > 0 || ci.suggestions.length > 0 || ci.recommendations.length > 0)) {
      classInsightsList.push({ className: cm.className, ci });
    }
  });

  if (classInsightsList.length > 0) {
    const items = classInsightsList.map(({ className, ci }) => {
      const obs = ci.observations.length > 0
        ? `<div class="insight-sub">傾向</div><ul>${ci.observations.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>`
        : '';
      const sug = ci.suggestions.length > 0
        ? `<div class="insight-sub">改善提案</div><ul>${ci.suggestions.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>`
        : '';
      const rec = ci.recommendations.length > 0
        ? `<div class="insight-sub">シナリオ相性</div><ul>${ci.recommendations.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>`
        : '';
      return `<div class="insight-group"><div class="insight-label">${escapeHtml(className)}</div>${obs}${sug}${rec}</div>`;
    }).join('');
    classInsightsHtml = `<h2>クラス別インサイト</h2>${items}`;
  }

  // Latest session insights
  let latestInsightsHtml = '';
  if (latestSessionInsights) {
    const { title, insights } = latestSessionInsights;
    const obs = insights.observations.length > 0
      ? `<div class="insight-sub">所見</div><ul>${insights.observations.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>`
      : '';
    const sug = insights.suggestions.length > 0
      ? `<div class="insight-sub">次回への提案</div><ul>${insights.suggestions.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>`
      : '';
    if (obs || sug) {
      latestInsightsHtml = `<h2>直近の授業: ${escapeHtml(title)}</h2>${obs}${sug}`;
    }
  }

  // Build full HTML
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>授業分析レポート</title>
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
      margin-bottom: 4px;
    }
    .subtitle {
      font-size: 13px;
      color: #666;
      margin-bottom: 24px;
    }
    h2 {
      font-size: 16px;
      margin-top: 28px;
      margin-bottom: 8px;
      padding: 4px 8px;
      background: #f9fafb;
      border-left: 4px solid #f59e0b;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin: 16px 0;
    }
    .card {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 12px;
      text-align: center;
    }
    .card-value {
      font-size: 20px;
      font-weight: 900;
      color: #d97706;
    }
    .card-label {
      font-size: 11px;
      color: #6b7280;
      margin-top: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 13px;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 5px 8px;
      text-align: left;
    }
    th { background: #f3f4f6; font-weight: bold; font-size: 12px; }
    .note {
      font-size: 11px;
      color: #9ca3af;
      margin-bottom: 4px;
    }
    .insight-group {
      margin: 8px 0 12px 0;
      padding: 8px 12px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 4px;
    }
    .insight-label {
      font-weight: bold;
      font-size: 13px;
      margin-bottom: 4px;
    }
    .insight-sub {
      font-size: 11px;
      font-weight: bold;
      color: #92400e;
      margin-top: 6px;
      margin-bottom: 2px;
    }
    ul { padding-left: 16px; font-size: 13px; }
    li { margin: 2px 0; }
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

  <h1>授業分析レポート</h1>
  <div class="subtitle">
    ナゾトキ探偵団 | 対象期間: ${escapeHtml(rangeText)} | 出力日: ${now}
  </div>

  ${summaryHtml}
  ${latestInsightsHtml}
  ${classInsightsHtml}
  ${classTableHtml}
  ${scenarioTableHtml}
  ${trendInsightsHtml}
  ${studentTableHtml}

  <div class="footer">
    ナゾトキ探偵団 授業分析レポート | ${escapeHtml(rangeText)} | ${now}
  </div>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

// ============================================================
// Monthly Report PDF Export
// ============================================================

function buildComparisonHtml(comparison?: MonthlyComparison | null): string {
  if (!comparison) return '';

  const { deltas, classDeltas, insights, previousLabel } = comparison;

  // Format delta for PDF display
  const fmtDelta = (d: { delta: number | null }, unit: 'pct' | 'time' | 'count'): string => {
    if (d.delta == null) return '--';
    const sign = d.delta > 0 ? '+' : '';
    if (unit === 'pct') return `${sign}${Math.round(d.delta * 100)}pt`;
    if (unit === 'time') {
      const abs = Math.abs(Math.round(d.delta));
      const m = Math.floor(abs / 60);
      const s = abs % 60;
      return `${sign}${Math.round(d.delta) < 0 ? '-' : ''}${m}:${String(s).padStart(2, '0')}`;
    }
    return `${sign}${Math.round(d.delta)}`;
  };

  // Summary delta cards
  const deltaItems = [
    { label: '正解率', val: fmtDelta(deltas.accuracyRate, 'pct') },
    { label: '議論時間', val: fmtDelta(deltas.discussTime, 'time') },
    { label: '探索時間', val: fmtDelta(deltas.exploreTime, 'time') },
    { label: '理由記入率', val: fmtDelta(deltas.voteReasonRate, 'pct') },
    { label: '証拠発見数', val: fmtDelta(deltas.evidenceCount, 'count') },
    { label: '授業回数', val: fmtDelta(deltas.sessions, 'count') },
  ];

  const deltaCardsHtml = `
    <div class="cards" style="grid-template-columns:repeat(3,1fr);">
      ${deltaItems.map((d) => `<div class="card"><div class="card-value" style="font-size:16px;">${d.val}</div><div class="card-label">${d.label}</div></div>`).join('')}
    </div>
  `;

  // Class deltas table
  let classTableHtml = '';
  if (classDeltas.length > 0) {
    const rows = classDeltas.map((cd) => `
      <tr>
        <td>${escapeHtml(cd.className)}</td>
        <td style="text-align:center">${cd.currentSessions}回</td>
        <td style="text-align:center">${cd.previousSessions}回</td>
        <td style="text-align:center">${cd.accuracyDelta != null ? `${cd.accuracyDelta > 0 ? '+' : ''}${Math.round(cd.accuracyDelta * 100)}pt` : '--'}</td>
      </tr>
    `).join('');

    classTableHtml = `
      <table>
        <thead><tr><th>クラス</th><th style="text-align:center">今月</th><th style="text-align:center">前月</th><th style="text-align:center">正解率差分</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // Insights
  let insightsHtml = '';
  if (insights.length > 0) {
    insightsHtml = `<ul>${insights.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>`;
  }

  return `
    <h2>前月比較 (vs ${escapeHtml(previousLabel)})</h2>
    ${deltaCardsHtml}
    ${insightsHtml}
    ${classTableHtml}
  `;
}

export function buildMonthlyReportHtml(report: MonthlyReportData, comparison?: MonthlyComparison | null): string {
  const { summary, classBreakdown, scenarioBreakdown, studentBreakdown, classInsights, insights, improvements } = report;
  const title = monthLabel(report.year, report.month);
  const now = new Date().toLocaleDateString('ja-JP');

  // Summary cards
  const summaryHtml = `
    <div class="cards">
      <div class="card"><div class="card-value">${summary.totalSessions}</div><div class="card-label">授業回数</div></div>
      <div class="card"><div class="card-value">${summary.totalClasses}</div><div class="card-label">クラス数</div></div>
      <div class="card"><div class="card-value">${summary.totalStudents}</div><div class="card-label">参加生徒数</div></div>
      <div class="card"><div class="card-value">${formatPercent(summary.avgAccuracyRate)}</div><div class="card-label">平均正解率</div></div>
      <div class="card"><div class="card-value">${formatMinSec(summary.avgDuration)}</div><div class="card-label">平均授業時間</div></div>
      <div class="card"><div class="card-value">${formatMinSec(summary.avgDiscussTime)}</div><div class="card-label">平均議論時間</div></div>
    </div>
  `;

  // Insights
  let insightsHtml = '';
  if (insights.length > 0) {
    insightsHtml = `
      <h2>月次所見</h2>
      <ul>${insights.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>
    `;
  }

  // Improvements
  let improvementsHtml = '';
  if (improvements.length > 0) {
    improvementsHtml = `
      <h2>次月への改善提案</h2>
      <div class="insight-group">
        <ul>${improvements.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>
      </div>
    `;
  }

  // Class breakdown table
  let classHtml = '';
  if (classBreakdown.length > 0) {
    const rows = classBreakdown.map((m) => `
      <tr>
        <td>${escapeHtml(m.className)}${m.gradeLabel ? ` (${escapeHtml(m.gradeLabel)})` : ''}</td>
        <td style="text-align:center">${m.sessionCount}</td>
        <td style="text-align:center">${formatPercent(m.avgAccuracyRate)}</td>
        <td style="text-align:center">${formatMinSec(m.avgDiscussTime)}</td>
        <td style="text-align:center">${formatMinSec(m.avgExploreTime)}</td>
      </tr>
    `).join('');

    classHtml = `
      <h2>クラス別要約</h2>
      <table>
        <thead><tr><th>クラス</th><th style="text-align:center">実施数</th><th style="text-align:center">正解率</th><th style="text-align:center">議論</th><th style="text-align:center">探索</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    // Class-level insights
    const classInsightItems: string[] = [];
    classBreakdown.forEach((cm) => {
      const ci = classInsights.get(cm.classId);
      if (!ci) return;
      const allIns = [...ci.observations, ...ci.suggestions, ...ci.recommendations];
      if (allIns.length > 0) {
        classInsightItems.push(`
          <div class="insight-group">
            <div class="insight-label">${escapeHtml(cm.className)}</div>
            <ul>${allIns.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>
          </div>
        `);
      }
    });
    if (classInsightItems.length > 0) {
      classHtml += `<h2>クラス別インサイト</h2>${classInsightItems.join('')}`;
    }
  }

  // Scenario breakdown table
  let scenarioHtml = '';
  if (scenarioBreakdown.length > 0) {
    const rows = scenarioBreakdown.map((m) => `
      <tr>
        <td>${escapeHtml(m.title)}</td>
        <td style="text-align:center">${m.sessionCount}</td>
        <td style="text-align:center">${formatMinSec(m.avgDuration)}</td>
        <td style="text-align:center">${formatPercent(m.avgAccuracyRate)}</td>
      </tr>
    `).join('');

    scenarioHtml = `
      <h2>シナリオ別要約</h2>
      <table>
        <thead><tr><th>シナリオ</th><th style="text-align:center">実施数</th><th style="text-align:center">平均時間</th><th style="text-align:center">正解率</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // Student breakdown table (top 20)
  let studentHtml = '';
  if (studentBreakdown.length > 0) {
    const sorted = [...studentBreakdown].sort((a, b) => b.participationCount - a.participationCount);
    const top = sorted.slice(0, 20);
    const rows = top.map((m) => `
      <tr>
        <td>${escapeHtml(m.studentName)}</td>
        <td>${escapeHtml(m.className)}</td>
        <td style="text-align:center">${m.participationCount}</td>
        <td style="text-align:center">${formatPercent(m.accuracyRate)}</td>
      </tr>
    `).join('');

    studentHtml = `
      <h2>生徒参加要約${sorted.length > 20 ? ` (上位20名 / 全${sorted.length}名)` : ''}</h2>
      <p class="note">参加ログの記録です。成績評価ではありません。</p>
      <table>
        <thead><tr><th>生徒名</th><th>クラス</th><th style="text-align:center">参加回数</th><th style="text-align:center">正解率</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>月次レポート - ${title}</title>
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
      margin-bottom: 4px;
    }
    .subtitle {
      font-size: 13px;
      color: #666;
      margin-bottom: 24px;
    }
    h2 {
      font-size: 16px;
      margin-top: 28px;
      margin-bottom: 8px;
      padding: 4px 8px;
      background: #f9fafb;
      border-left: 4px solid #f59e0b;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin: 16px 0;
    }
    .card {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 12px;
      text-align: center;
    }
    .card-value {
      font-size: 20px;
      font-weight: 900;
      color: #d97706;
    }
    .card-label {
      font-size: 11px;
      color: #6b7280;
      margin-top: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 13px;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 5px 8px;
      text-align: left;
    }
    th { background: #f3f4f6; font-weight: bold; font-size: 12px; }
    .note {
      font-size: 11px;
      color: #9ca3af;
      margin-bottom: 4px;
    }
    .insight-group {
      margin: 8px 0 12px 0;
      padding: 8px 12px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 4px;
    }
    .insight-label {
      font-weight: bold;
      font-size: 13px;
      margin-bottom: 4px;
    }
    ul { padding-left: 16px; font-size: 13px; }
    li { margin: 2px 0; }
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

  <h1>月次授業レポート: ${escapeHtml(title)}</h1>
  <div class="subtitle">ナゾトキ探偵団 | 出力日: ${now}</div>

  ${summaryHtml}
  ${buildComparisonHtml(comparison)}
  ${insightsHtml}
  ${improvementsHtml}
  ${classHtml}
  ${scenarioHtml}
  ${studentHtml}

  <div class="footer">
    ナゾトキ探偵団 月次レポート | ${escapeHtml(title)} | ${now}
  </div>
</body>
</html>`;
}

export function exportMonthlyReportPDF(report: MonthlyReportData, comparison?: MonthlyComparison | null) {
  const html = buildMonthlyReportHtml(report, comparison);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

// ============================================================
// Term Report PDF Export
// ============================================================

function buildTermComparisonHtml(comparison?: TermComparison | null): string {
  if (!comparison) return '';

  const { deltas, classDeltas, insights, previousLabel } = comparison;

  const fmtDelta = (d: { delta: number | null }, unit: 'pct' | 'time' | 'count'): string => {
    if (d.delta == null) return '--';
    const sign = d.delta > 0 ? '+' : '';
    if (unit === 'pct') return `${sign}${Math.round(d.delta * 100)}pt`;
    if (unit === 'time') {
      const abs = Math.abs(Math.round(d.delta));
      const m = Math.floor(abs / 60);
      const s = abs % 60;
      return `${sign}${Math.round(d.delta) < 0 ? '-' : ''}${m}:${String(s).padStart(2, '0')}`;
    }
    return `${sign}${Math.round(d.delta)}`;
  };

  const deltaItems = [
    { label: '正解率', val: fmtDelta(deltas.accuracyRate, 'pct') },
    { label: '議論時間', val: fmtDelta(deltas.discussTime, 'time') },
    { label: '探索時間', val: fmtDelta(deltas.exploreTime, 'time') },
    { label: '理由記入率', val: fmtDelta(deltas.voteReasonRate, 'pct') },
    { label: '証拠発見数', val: fmtDelta(deltas.evidenceCount, 'count') },
    { label: '授業回数', val: fmtDelta(deltas.sessions, 'count') },
  ];

  const deltaCardsHtml = `
    <div class="cards" style="grid-template-columns:repeat(3,1fr);">
      ${deltaItems.map((d) => `<div class="card"><div class="card-value" style="font-size:16px;">${d.val}</div><div class="card-label">${d.label}</div></div>`).join('')}
    </div>
  `;

  let classTableHtml = '';
  if (classDeltas.length > 0) {
    const rows = classDeltas.map((cd) => `
      <tr>
        <td>${escapeHtml(cd.className)}</td>
        <td style="text-align:center">${cd.currentSessions}回</td>
        <td style="text-align:center">${cd.previousSessions}回</td>
        <td style="text-align:center">${cd.accuracyDelta != null ? `${cd.accuracyDelta > 0 ? '+' : ''}${Math.round(cd.accuracyDelta * 100)}pt` : '--'}</td>
      </tr>
    `).join('');

    classTableHtml = `
      <table>
        <thead><tr><th>クラス</th><th style="text-align:center">今学期</th><th style="text-align:center">前学期</th><th style="text-align:center">正解率差分</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  let insightsHtml = '';
  if (insights.length > 0) {
    insightsHtml = `<ul>${insights.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>`;
  }

  return `
    <h2>前学期比較 (vs ${escapeHtml(previousLabel)})</h2>
    ${deltaCardsHtml}
    ${insightsHtml}
    ${classTableHtml}
  `;
}

export function buildTermReportHtml(report: TermReportData, comparison?: TermComparison | null): string {
  const { summary, monthlyBreakdown, classBreakdown, scenarioBreakdown, studentBreakdown, classInsights, insights, improvements } = report;
  const title = termLabel(report.schoolYear, report.term);
  const now = new Date().toLocaleDateString('ja-JP');

  // Summary cards
  const summaryHtml = `
    <div class="cards">
      <div class="card"><div class="card-value">${summary.totalSessions}</div><div class="card-label">授業回数</div></div>
      <div class="card"><div class="card-value">${summary.totalClasses}</div><div class="card-label">クラス数</div></div>
      <div class="card"><div class="card-value">${summary.totalStudents}</div><div class="card-label">参加生徒数</div></div>
      <div class="card"><div class="card-value">${formatPercent(summary.avgAccuracyRate)}</div><div class="card-label">平均正解率</div></div>
      <div class="card"><div class="card-value">${formatMinSec(summary.avgDuration)}</div><div class="card-label">平均授業時間</div></div>
      <div class="card"><div class="card-value">${formatMinSec(summary.avgDiscussTime)}</div><div class="card-label">平均議論時間</div></div>
    </div>
  `;

  // Monthly breakdown within term
  let monthlyHtml = '';
  if (monthlyBreakdown.length > 0) {
    const rows = monthlyBreakdown.map((m) => `
      <tr>
        <td>${monthLabel(m.year, m.month)}</td>
        <td style="text-align:center">${m.sessionCount}</td>
        <td style="text-align:center">${formatPercent(m.avgAccuracyRate)}</td>
        <td style="text-align:center">${formatMinSec(m.avgDiscussTime)}</td>
        <td style="text-align:center">${formatMinSec(m.avgDuration)}</td>
      </tr>
    `).join('');

    monthlyHtml = `
      <h2>月別推移</h2>
      <table>
        <thead><tr><th>月</th><th style="text-align:center">授業回数</th><th style="text-align:center">正解率</th><th style="text-align:center">議論時間</th><th style="text-align:center">授業時間</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // Insights
  let insightsHtml = '';
  if (insights.length > 0) {
    insightsHtml = `
      <h2>学期所見</h2>
      <ul>${insights.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>
    `;
  }

  // Improvements
  let improvementsHtml = '';
  if (improvements.length > 0) {
    improvementsHtml = `
      <h2>次学期への改善提案</h2>
      <div class="insight-group">
        <ul>${improvements.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>
      </div>
    `;
  }

  // Class breakdown table
  let classHtml = '';
  if (classBreakdown.length > 0) {
    const rows = classBreakdown.map((m) => `
      <tr>
        <td>${escapeHtml(m.className)}${m.gradeLabel ? ` (${escapeHtml(m.gradeLabel)})` : ''}</td>
        <td style="text-align:center">${m.sessionCount}</td>
        <td style="text-align:center">${formatPercent(m.avgAccuracyRate)}</td>
        <td style="text-align:center">${formatMinSec(m.avgDiscussTime)}</td>
        <td style="text-align:center">${formatMinSec(m.avgExploreTime)}</td>
      </tr>
    `).join('');

    classHtml = `
      <h2>クラス別要約</h2>
      <table>
        <thead><tr><th>クラス</th><th style="text-align:center">実施数</th><th style="text-align:center">正解率</th><th style="text-align:center">議論</th><th style="text-align:center">探索</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    // Class-level insights
    const classInsightItems: string[] = [];
    classBreakdown.forEach((cm) => {
      const ci = classInsights.get(cm.classId);
      if (!ci) return;
      const allIns = [...ci.observations, ...ci.suggestions, ...ci.recommendations];
      if (allIns.length > 0) {
        classInsightItems.push(`
          <div class="insight-group">
            <div class="insight-label">${escapeHtml(cm.className)}</div>
            <ul>${allIns.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>
          </div>
        `);
      }
    });
    if (classInsightItems.length > 0) {
      classHtml += `<h2>クラス別インサイト</h2>${classInsightItems.join('')}`;
    }
  }

  // Scenario breakdown table
  let scenarioHtml = '';
  if (scenarioBreakdown.length > 0) {
    const rows = scenarioBreakdown.map((m) => `
      <tr>
        <td>${escapeHtml(m.title)}</td>
        <td style="text-align:center">${m.sessionCount}</td>
        <td style="text-align:center">${formatMinSec(m.avgDuration)}</td>
        <td style="text-align:center">${formatPercent(m.avgAccuracyRate)}</td>
      </tr>
    `).join('');

    scenarioHtml = `
      <h2>シナリオ別要約</h2>
      <table>
        <thead><tr><th>シナリオ</th><th style="text-align:center">実施数</th><th style="text-align:center">平均時間</th><th style="text-align:center">正解率</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // Student breakdown table (top 20)
  let studentHtml = '';
  if (studentBreakdown.length > 0) {
    const sorted = [...studentBreakdown].sort((a, b) => b.participationCount - a.participationCount);
    const top = sorted.slice(0, 20);
    const rows = top.map((m) => `
      <tr>
        <td>${escapeHtml(m.studentName)}</td>
        <td>${escapeHtml(m.className)}</td>
        <td style="text-align:center">${m.participationCount}</td>
        <td style="text-align:center">${formatPercent(m.accuracyRate)}</td>
      </tr>
    `).join('');

    studentHtml = `
      <h2>生徒参加要約${sorted.length > 20 ? ` (上位20名 / 全${sorted.length}名)` : ''}</h2>
      <p class="note">参加ログの記録です。成績評価ではありません。</p>
      <table>
        <thead><tr><th>生徒名</th><th>クラス</th><th style="text-align:center">参加回数</th><th style="text-align:center">正解率</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>学期レポート - ${escapeHtml(title)}</title>
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
      border-bottom: 3px solid #4f46e5;
      padding-bottom: 8px;
      margin-bottom: 4px;
    }
    .subtitle {
      font-size: 13px;
      color: #666;
      margin-bottom: 24px;
    }
    h2 {
      font-size: 16px;
      margin-top: 28px;
      margin-bottom: 8px;
      padding: 4px 8px;
      background: #f9fafb;
      border-left: 4px solid #4f46e5;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin: 16px 0;
    }
    .card {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 12px;
      text-align: center;
    }
    .card-value {
      font-size: 20px;
      font-weight: 900;
      color: #4f46e5;
    }
    .card-label {
      font-size: 11px;
      color: #6b7280;
      margin-top: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 13px;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 5px 8px;
      text-align: left;
    }
    th { background: #f3f4f6; font-weight: bold; font-size: 12px; }
    .note {
      font-size: 11px;
      color: #9ca3af;
      margin-bottom: 4px;
    }
    .insight-group {
      margin: 8px 0 12px 0;
      padding: 8px 12px;
      background: #eef2ff;
      border: 1px solid #c7d2fe;
      border-radius: 4px;
    }
    .insight-label {
      font-weight: bold;
      font-size: 13px;
      margin-bottom: 4px;
    }
    ul { padding-left: 16px; font-size: 13px; }
    li { margin: 2px 0; }
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

  <h1>学期授業レポート: ${escapeHtml(title)}</h1>
  <div class="subtitle">ナゾトキ探偵団 | 出力日: ${now}</div>

  ${summaryHtml}
  ${buildTermComparisonHtml(comparison)}
  ${monthlyHtml}
  ${insightsHtml}
  ${improvementsHtml}
  ${classHtml}
  ${scenarioHtml}
  ${studentHtml}

  <div class="footer">
    ナゾトキ探偵団 学期レポート | ${escapeHtml(title)} | ${now}
  </div>
</body>
</html>`;
}

export function exportTermReportPDF(report: TermReportData, comparison?: TermComparison | null) {
  const html = buildTermReportHtml(report, comparison);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

// ============================================================
// Annual Report PDF Export
// ============================================================

function buildAnnualComparisonHtml(comparison?: AnnualComparison | null): string {
  if (!comparison) return '';

  const { deltas, classDeltas, scenarioDeltas, insights, improvements, previousLabel } = comparison;

  const fmtDelta = (d: { delta: number | null }, unit: 'pct' | 'time' | 'count'): string => {
    if (d.delta == null) return '--';
    const sign = d.delta > 0 ? '+' : '';
    if (unit === 'pct') return `${sign}${Math.round(d.delta * 100)}pt`;
    if (unit === 'time') {
      const abs = Math.abs(Math.round(d.delta));
      const m = Math.floor(abs / 60);
      const s = abs % 60;
      return `${sign}${Math.round(d.delta) < 0 ? '-' : ''}${m}:${String(s).padStart(2, '0')}`;
    }
    return `${sign}${Math.round(d.delta)}`;
  };

  // Summary delta cards
  const deltaItems = [
    { label: '正解率', val: fmtDelta(deltas.accuracyRate, 'pct') },
    { label: '議論時間', val: fmtDelta(deltas.discussTime, 'time') },
    { label: '探索時間', val: fmtDelta(deltas.exploreTime, 'time') },
    { label: '理由記入率', val: fmtDelta(deltas.voteReasonRate, 'pct') },
    { label: '証拠発見数', val: fmtDelta(deltas.evidenceCount, 'count') },
    { label: '授業回数', val: fmtDelta(deltas.sessions, 'count') },
  ];

  const deltaCardsHtml = `
    <div class="cards" style="grid-template-columns:repeat(3,1fr);">
      ${deltaItems.map((d) => `<div class="card"><div class="card-value" style="font-size:16px;">${d.val}</div><div class="card-label">${d.label}</div></div>`).join('')}
    </div>
  `;

  // Insights
  let insightsHtml = '';
  if (insights.length > 0) {
    insightsHtml = `<ul>${insights.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>`;
  }

  // Improvements
  let improvementsHtml = '';
  if (improvements.length > 0) {
    improvementsHtml = `
      <div class="insight-group" style="margin-top:8px;">
        <div class="insight-label">次年度への改善提案（比較分析）</div>
        <ul>${improvements.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>
      </div>
    `;
  }

  // Class comparison table
  let classTableHtml = '';
  if (classDeltas.length > 0) {
    const rows = classDeltas.map((cd) => `
      <tr>
        <td>${escapeHtml(cd.className)}</td>
        <td style="text-align:center">${cd.currentSessions}回</td>
        <td style="text-align:center">${cd.previousSessions}回</td>
        <td style="text-align:center">${cd.accuracyDelta != null ? `${cd.accuracyDelta > 0 ? '+' : ''}${Math.round(cd.accuracyDelta * 100)}pt` : '--'}</td>
      </tr>
    `).join('');

    classTableHtml = `
      <table>
        <thead><tr><th>クラス</th><th style="text-align:center">今年度</th><th style="text-align:center">前年度</th><th style="text-align:center">正解率差分</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // Scenario comparison table
  let scenarioTableHtml = '';
  if (scenarioDeltas.length > 0) {
    const rows = scenarioDeltas.map((sd) => `
      <tr>
        <td>${escapeHtml(sd.title)}</td>
        <td style="text-align:center">${sd.currentSessions}回</td>
        <td style="text-align:center">${sd.previousSessions}回</td>
        <td style="text-align:center">${sd.accuracyDelta != null ? `${sd.accuracyDelta > 0 ? '+' : ''}${Math.round(sd.accuracyDelta * 100)}pt` : '--'}</td>
      </tr>
    `).join('');

    scenarioTableHtml = `
      <table>
        <thead><tr><th>シナリオ</th><th style="text-align:center">今年度</th><th style="text-align:center">前年度</th><th style="text-align:center">正解率差分</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  return `
    <h2>前年度比較 (vs ${escapeHtml(previousLabel)})</h2>
    ${deltaCardsHtml}
    ${insightsHtml}
    ${improvementsHtml}
    ${classTableHtml}
    ${scenarioTableHtml.length > 0 ? `<h2>シナリオ別前年度比較</h2>${scenarioTableHtml}` : ''}
  `;
}

// ============================================================
// Annual Comparison CSV Export
// ============================================================

type AnnualSummaryMetricDef = {
  key: keyof AnnualComparison['deltas'];
  nameJa: string;
  unit: 'count' | 'rate' | 'time';
  metricType: 'positive' | 'neutral';
};

const ANNUAL_SUMMARY_METRICS: AnnualSummaryMetricDef[] = [
  { key: 'sessions', nameJa: '授業回数', unit: 'count', metricType: 'positive' },
  { key: 'classes', nameJa: 'クラス数', unit: 'count', metricType: 'positive' },
  { key: 'students', nameJa: '参加生徒数', unit: 'count', metricType: 'positive' },
  { key: 'accuracyRate', nameJa: '平均正解率', unit: 'rate', metricType: 'positive' },
  { key: 'duration', nameJa: '平均授業時間', unit: 'time', metricType: 'neutral' },
  { key: 'discussTime', nameJa: '平均議論時間', unit: 'time', metricType: 'neutral' },
  { key: 'exploreTime', nameJa: '平均探索時間', unit: 'time', metricType: 'neutral' },
  { key: 'voteReasonRate', nameJa: '投票理由記入率', unit: 'rate', metricType: 'positive' },
  { key: 'evidenceCount', nameJa: '平均証拠発見数', unit: 'count', metricType: 'positive' },
];

function annualMetricValue(v: number | null, unit: 'count' | 'rate' | 'time'): number | null {
  if (v == null) return null;
  if (unit === 'rate') return Math.round(v * 1000) / 10; // e.g. 0.75 → 75.0
  if (unit === 'time') return Math.round(v);
  return Math.round(v * 10) / 10;
}

function annualDeltaDisplay(delta: number | null, unit: 'count' | 'rate' | 'time'): string {
  if (delta == null) return '';
  if (unit === 'rate') {
    const pt = Math.round(delta * 1000) / 10;
    return `${pt > 0 ? '+' : ''}${pt}pt`;
  }
  if (unit === 'time') {
    const s = Math.round(delta);
    const sign = s > 0 ? '+' : '';
    const m = Math.floor(Math.abs(s) / 60);
    const sec = Math.abs(s) % 60;
    if (m > 0) return `${sign}${s < 0 ? '-' : ''}${m}:${String(sec).padStart(2, '0')}`;
    return `${sign}${s}秒`;
  }
  const r = Math.round(delta * 10) / 10;
  return `${r > 0 ? '+' : ''}${r}`;
}

function annualInterpretation(
  delta: number | null,
  previous: number | null,
  metricType: 'positive' | 'neutral',
): string {
  if (previous == null) return 'no_previous_data';
  if (delta == null) return 'neutral';
  if (Math.abs(delta) < 0.001) return 'stable';
  if (metricType === 'neutral') return delta > 0 ? 'increased' : 'decreased';
  return delta > 0 ? 'improved' : 'declined';
}

export function buildAnnualComparisonSummaryRows(
  comparison: AnnualComparison,
): (string | number | null)[][] {
  return ANNUAL_SUMMARY_METRICS.map((m) => {
    const dv = comparison.deltas[m.key];
    const curVal = annualMetricValue(dv.current, m.unit);
    const prevVal = annualMetricValue(dv.previous, m.unit);
    const deltaVal = annualMetricValue(dv.delta, m.unit);
    return [
      comparison.currentLabel,
      comparison.previousLabel,
      m.nameJa,
      curVal,
      prevVal,
      deltaVal,
      annualDeltaDisplay(dv.delta, m.unit),
      dv.delta == null ? 'neutral' : dv.delta > 0 ? 'positive' : dv.delta < 0 ? 'negative' : 'neutral',
      annualInterpretation(dv.delta, dv.previous, m.metricType),
    ];
  });
}

export function exportAnnualComparisonSummaryCSV(comparison: AnnualComparison) {
  const headers = [
    '今年度', '前年度', '指標名',
    '今年度値', '前年度値', '差分値', '差分表示',
    '方向', '解釈',
  ];
  const rows = buildAnnualComparisonSummaryRows(comparison);
  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(csv, `年度間比較サマリー_${comparison.currentLabel}vs${comparison.previousLabel}_${date}.csv`);
}

export function buildAnnualComparisonClassRows(
  comparison: AnnualComparison,
): (string | number | null)[][] {
  return comparison.classDeltas.map((cd) => [
    cd.className,
    cd.gradeLabel,
    comparison.currentLabel,
    comparison.previousLabel,
    cd.currentSessions,
    cd.previousSessions,
    cd.currentSessions - cd.previousSessions,
    annualMetricValue(cd.currentAccuracy, 'rate'),
    annualMetricValue(cd.previousAccuracy, 'rate'),
    cd.accuracyDelta != null ? Math.round(cd.accuracyDelta * 1000) / 10 : null,
    cd.currentDiscussTime != null ? Math.round(cd.currentDiscussTime) : null,
    cd.previousDiscussTime != null ? Math.round(cd.previousDiscussTime) : null,
    cd.discussDelta != null ? Math.round(cd.discussDelta) : null,
    cd.currentExploreTime != null ? Math.round(cd.currentExploreTime) : null,
    cd.previousExploreTime != null ? Math.round(cd.previousExploreTime) : null,
    cd.exploreDelta != null ? Math.round(cd.exploreDelta) : null,
  ]);
}

export function exportAnnualComparisonClassCSV(comparison: AnnualComparison) {
  const headers = [
    'クラス名', '学年', '今年度', '前年度',
    '今年度回数', '前年度回数', '回数差分',
    '今年度正解率(%)', '前年度正解率(%)', '正解率差分(pt)',
    '今年度議論(秒)', '前年度議論(秒)', '議論差分(秒)',
    '今年度探索(秒)', '前年度探索(秒)', '探索差分(秒)',
  ];
  const rows = buildAnnualComparisonClassRows(comparison);
  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(csv, `クラス別年度間比較_${comparison.currentLabel}vs${comparison.previousLabel}_${date}.csv`);
}

export function buildAnnualComparisonScenarioRows(
  comparison: AnnualComparison,
): (string | number | null)[][] {
  return comparison.scenarioDeltas.map((sd) => [
    sd.title,
    sd.slug,
    comparison.currentLabel,
    comparison.previousLabel,
    sd.currentSessions,
    sd.previousSessions,
    sd.currentSessions - sd.previousSessions,
    annualMetricValue(sd.currentAccuracy, 'rate'),
    annualMetricValue(sd.previousAccuracy, 'rate'),
    sd.accuracyDelta != null ? Math.round(sd.accuracyDelta * 1000) / 10 : null,
    sd.currentDuration != null ? Math.round(sd.currentDuration) : null,
    sd.previousDuration != null ? Math.round(sd.previousDuration) : null,
    sd.durationDelta != null ? Math.round(sd.durationDelta) : null,
  ]);
}

export function exportAnnualComparisonScenarioCSV(comparison: AnnualComparison) {
  const headers = [
    'シナリオ名', 'スラッグ', '今年度', '前年度',
    '今年度回数', '前年度回数', '回数差分',
    '今年度正解率(%)', '前年度正解率(%)', '正解率差分(pt)',
    '今年度授業時間(秒)', '前年度授業時間(秒)', '授業時間差分(秒)',
  ];
  const rows = buildAnnualComparisonScenarioRows(comparison);
  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(csv, `シナリオ別年度間比較_${comparison.currentLabel}vs${comparison.previousLabel}_${date}.csv`);
}

// ============================================================
// Monthly Comparison CSV Export
// ============================================================

type MonthlySummaryMetricDef = {
  key: keyof MonthlyComparison['deltas'];
  nameJa: string;
  unit: 'count' | 'rate' | 'time';
  metricType: 'positive' | 'neutral';
};

const MONTHLY_SUMMARY_METRICS: MonthlySummaryMetricDef[] = [
  { key: 'sessions', nameJa: '授業回数', unit: 'count', metricType: 'positive' },
  { key: 'classes', nameJa: 'クラス数', unit: 'count', metricType: 'positive' },
  { key: 'students', nameJa: '参加生徒数', unit: 'count', metricType: 'positive' },
  { key: 'accuracyRate', nameJa: '平均正解率', unit: 'rate', metricType: 'positive' },
  { key: 'duration', nameJa: '平均授業時間', unit: 'time', metricType: 'neutral' },
  { key: 'discussTime', nameJa: '平均議論時間', unit: 'time', metricType: 'neutral' },
  { key: 'exploreTime', nameJa: '平均探索時間', unit: 'time', metricType: 'neutral' },
  { key: 'voteReasonRate', nameJa: '投票理由記入率', unit: 'rate', metricType: 'positive' },
  { key: 'evidenceCount', nameJa: '平均証拠発見数', unit: 'count', metricType: 'positive' },
];

export function buildMonthlyComparisonSummaryRows(
  comparison: MonthlyComparison,
): (string | number | null)[][] {
  return MONTHLY_SUMMARY_METRICS.map((m) => {
    const dv = comparison.deltas[m.key];
    const curVal = annualMetricValue(dv.current, m.unit);
    const prevVal = annualMetricValue(dv.previous, m.unit);
    const deltaVal = annualMetricValue(dv.delta, m.unit);
    return [
      comparison.currentLabel,
      comparison.previousLabel,
      m.nameJa,
      curVal,
      prevVal,
      deltaVal,
      annualDeltaDisplay(dv.delta, m.unit),
      dv.delta == null ? 'neutral' : dv.delta > 0 ? 'positive' : dv.delta < 0 ? 'negative' : 'neutral',
      annualInterpretation(dv.delta, dv.previous, m.metricType),
    ];
  });
}

export function exportMonthlyComparisonSummaryCSV(comparison: MonthlyComparison) {
  const headers = [
    '今月', '前月', '指標名',
    '今月値', '前月値', '差分値', '差分表示',
    '方向', '解釈',
  ];
  const rows = buildMonthlyComparisonSummaryRows(comparison);
  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(csv, `月次比較サマリー_${comparison.currentLabel}vs${comparison.previousLabel}_${date}.csv`);
}

export function buildMonthlyComparisonClassRows(
  comparison: MonthlyComparison,
): (string | number | null)[][] {
  return comparison.classDeltas.map((cd) => [
    cd.className,
    cd.gradeLabel,
    comparison.currentLabel,
    comparison.previousLabel,
    cd.currentSessions,
    cd.previousSessions,
    cd.currentSessions - cd.previousSessions,
    annualMetricValue(cd.currentAccuracy, 'rate'),
    annualMetricValue(cd.previousAccuracy, 'rate'),
    cd.accuracyDelta != null ? Math.round(cd.accuracyDelta * 1000) / 10 : null,
    cd.currentDiscussTime != null ? Math.round(cd.currentDiscussTime) : null,
    cd.previousDiscussTime != null ? Math.round(cd.previousDiscussTime) : null,
    cd.discussDelta != null ? Math.round(cd.discussDelta) : null,
    cd.currentExploreTime != null ? Math.round(cd.currentExploreTime) : null,
    cd.previousExploreTime != null ? Math.round(cd.previousExploreTime) : null,
    cd.exploreDelta != null ? Math.round(cd.exploreDelta) : null,
  ]);
}

export function exportMonthlyComparisonClassCSV(comparison: MonthlyComparison) {
  const headers = [
    'クラス名', '学年', '今月', '前月',
    '今月回数', '前月回数', '回数差分',
    '今月正解率(%)', '前月正解率(%)', '正解率差分(pt)',
    '今月議論(秒)', '前月議論(秒)', '議論差分(秒)',
    '今月探索(秒)', '前月探索(秒)', '探索差分(秒)',
  ];
  const rows = buildMonthlyComparisonClassRows(comparison);
  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(csv, `クラス別月次比較_${comparison.currentLabel}vs${comparison.previousLabel}_${date}.csv`);
}

export function buildMonthlyComparisonScenarioRows(
  comparison: MonthlyComparison,
): (string | number | null)[][] {
  return comparison.scenarioDeltas.map((sd) => [
    sd.title,
    sd.slug,
    comparison.currentLabel,
    comparison.previousLabel,
    sd.currentSessions,
    sd.previousSessions,
    sd.currentSessions - sd.previousSessions,
    annualMetricValue(sd.currentAccuracy, 'rate'),
    annualMetricValue(sd.previousAccuracy, 'rate'),
    sd.accuracyDelta != null ? Math.round(sd.accuracyDelta * 1000) / 10 : null,
    sd.currentDuration != null ? Math.round(sd.currentDuration) : null,
    sd.previousDuration != null ? Math.round(sd.previousDuration) : null,
    sd.durationDelta != null ? Math.round(sd.durationDelta) : null,
  ]);
}

export function exportMonthlyComparisonScenarioCSV(comparison: MonthlyComparison) {
  const headers = [
    'シナリオ名', 'スラッグ', '今月', '前月',
    '今月回数', '前月回数', '回数差分',
    '今月正解率(%)', '前月正解率(%)', '正解率差分(pt)',
    '今月授業時間(秒)', '前月授業時間(秒)', '授業時間差分(秒)',
  ];
  const rows = buildMonthlyComparisonScenarioRows(comparison);
  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(csv, `シナリオ別月次比較_${comparison.currentLabel}vs${comparison.previousLabel}_${date}.csv`);
}

// ============================================================
// Term Comparison CSV Export
// ============================================================

type TermSummaryMetricDef = {
  key: keyof TermSummaryDeltas;
  nameJa: string;
  unit: 'count' | 'rate' | 'time';
  metricType: 'positive' | 'neutral';
};

const TERM_SUMMARY_METRICS: TermSummaryMetricDef[] = [
  { key: 'sessions', nameJa: '授業回数', unit: 'count', metricType: 'positive' },
  { key: 'classes', nameJa: 'クラス数', unit: 'count', metricType: 'positive' },
  { key: 'students', nameJa: '参加生徒数', unit: 'count', metricType: 'positive' },
  { key: 'accuracyRate', nameJa: '平均正解率', unit: 'rate', metricType: 'positive' },
  { key: 'duration', nameJa: '平均授業時間', unit: 'time', metricType: 'neutral' },
  { key: 'discussTime', nameJa: '平均議論時間', unit: 'time', metricType: 'neutral' },
  { key: 'exploreTime', nameJa: '平均探索時間', unit: 'time', metricType: 'neutral' },
  { key: 'voteReasonRate', nameJa: '投票理由記入率', unit: 'rate', metricType: 'positive' },
  { key: 'evidenceCount', nameJa: '平均証拠発見数', unit: 'count', metricType: 'positive' },
];

export function buildTermComparisonSummaryRows(
  comparison: TermComparison,
): (string | number | null)[][] {
  return TERM_SUMMARY_METRICS.map((m) => {
    const dv = comparison.deltas[m.key];
    const curVal = annualMetricValue(dv.current, m.unit);
    const prevVal = annualMetricValue(dv.previous, m.unit);
    const deltaVal = annualMetricValue(dv.delta, m.unit);
    return [
      comparison.currentLabel,
      comparison.previousLabel,
      m.nameJa,
      curVal,
      prevVal,
      deltaVal,
      annualDeltaDisplay(dv.delta, m.unit),
      dv.delta == null ? 'neutral' : dv.delta > 0 ? 'positive' : dv.delta < 0 ? 'negative' : 'neutral',
      annualInterpretation(dv.delta, dv.previous, m.metricType),
    ];
  });
}

export function exportTermComparisonSummaryCSV(comparison: TermComparison) {
  const headers = [
    '今学期', '前学期', '指標名',
    '今学期値', '前学期値', '差分値', '差分表示',
    '方向', '解釈',
  ];
  const rows = buildTermComparisonSummaryRows(comparison);
  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(csv, `学期比較サマリー_${comparison.currentLabel}vs${comparison.previousLabel}_${date}.csv`);
}

export function buildTermComparisonClassRows(
  comparison: TermComparison,
): (string | number | null)[][] {
  return comparison.classDeltas.map((cd) => [
    cd.className,
    cd.gradeLabel,
    comparison.currentLabel,
    comparison.previousLabel,
    cd.currentSessions,
    cd.previousSessions,
    cd.currentSessions - cd.previousSessions,
    annualMetricValue(cd.currentAccuracy, 'rate'),
    annualMetricValue(cd.previousAccuracy, 'rate'),
    cd.accuracyDelta != null ? Math.round(cd.accuracyDelta * 1000) / 10 : null,
    cd.currentDiscussTime != null ? Math.round(cd.currentDiscussTime) : null,
    cd.previousDiscussTime != null ? Math.round(cd.previousDiscussTime) : null,
    cd.discussDelta != null ? Math.round(cd.discussDelta) : null,
    cd.currentExploreTime != null ? Math.round(cd.currentExploreTime) : null,
    cd.previousExploreTime != null ? Math.round(cd.previousExploreTime) : null,
    cd.exploreDelta != null ? Math.round(cd.exploreDelta) : null,
  ]);
}

export function exportTermComparisonClassCSV(comparison: TermComparison) {
  const headers = [
    'クラス名', '学年', '今学期', '前学期',
    '今学期回数', '前学期回数', '回数差分',
    '今学期正解率(%)', '前学期正解率(%)', '正解率差分(pt)',
    '今学期議論(秒)', '前学期議論(秒)', '議論差分(秒)',
    '今学期探索(秒)', '前学期探索(秒)', '探索差分(秒)',
  ];
  const rows = buildTermComparisonClassRows(comparison);
  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(csv, `クラス別学期比較_${comparison.currentLabel}vs${comparison.previousLabel}_${date}.csv`);
}

export function buildTermComparisonScenarioRows(
  comparison: TermComparison,
): (string | number | null)[][] {
  return comparison.scenarioDeltas.map((sd) => [
    sd.title,
    sd.slug,
    comparison.currentLabel,
    comparison.previousLabel,
    sd.currentSessions,
    sd.previousSessions,
    sd.currentSessions - sd.previousSessions,
    annualMetricValue(sd.currentAccuracy, 'rate'),
    annualMetricValue(sd.previousAccuracy, 'rate'),
    sd.accuracyDelta != null ? Math.round(sd.accuracyDelta * 1000) / 10 : null,
    sd.currentDuration != null ? Math.round(sd.currentDuration) : null,
    sd.previousDuration != null ? Math.round(sd.previousDuration) : null,
    sd.durationDelta != null ? Math.round(sd.durationDelta) : null,
  ]);
}

export function exportTermComparisonScenarioCSV(comparison: TermComparison) {
  const headers = [
    'シナリオ名', 'スラッグ', '今学期', '前学期',
    '今学期回数', '前学期回数', '回数差分',
    '今学期正解率(%)', '前学期正解率(%)', '正解率差分(pt)',
    '今学期授業時間(秒)', '前学期授業時間(秒)', '授業時間差分(秒)',
  ];
  const rows = buildTermComparisonScenarioRows(comparison);
  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(csv, `シナリオ別学期比較_${comparison.currentLabel}vs${comparison.previousLabel}_${date}.csv`);
}

// ============================================================
// Monthly Report (Single Month) CSV Export
// ============================================================

export function buildMonthlySummaryRows(
  report: MonthlyReportData,
): (string | number | null)[][] {
  const s = report.summary;
  return [[
    monthLabel(report.year, report.month),
    report.year,
    report.month,
    s.totalSessions,
    s.totalClasses,
    s.totalStudents,
    s.avgAccuracyRate != null ? Math.round(s.avgAccuracyRate * 1000) / 10 : null,
    s.avgDuration != null ? Math.round(s.avgDuration) : null,
    s.avgDiscussTime != null ? Math.round(s.avgDiscussTime) : null,
    report.generatedAt,
  ]];
}

export function exportMonthlySummaryCSV(report: MonthlyReportData) {
  const headers = [
    '対象月', '年', '月', '授業回数', 'クラス数', '参加生徒数',
    '平均正解率(%)', '平均授業時間(秒)', '平均議論時間(秒)',
    '出力日時',
  ];
  const rows = buildMonthlySummaryRows(report);
  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  const label = monthLabel(report.year, report.month);
  downloadCSV(csv, `月次サマリー_${label}_${date}.csv`);
}

export function buildMonthlyClassRows(
  report: MonthlyReportData,
): (string | number | null)[][] {
  return report.classBreakdown.map((c) => [
    monthLabel(report.year, report.month),
    c.className,
    c.gradeLabel,
    c.sessionCount,
    c.avgAccuracyRate != null ? Math.round(c.avgAccuracyRate * 1000) / 10 : null,
    c.avgDiscussTime != null ? Math.round(c.avgDiscussTime) : null,
    c.avgExploreTime != null ? Math.round(c.avgExploreTime) : null,
    c.avgDuration != null ? Math.round(c.avgDuration) : null,
    c.lastSessionDate,
    c.scenarioCounts.length > 0 ? c.scenarioCounts[0].title : null,
  ]);
}

export function exportMonthlyClassCSV(report: MonthlyReportData) {
  const headers = [
    '対象月', 'クラス名', '学年', '授業回数',
    '平均正解率(%)', '平均議論時間(秒)', '平均探索時間(秒)', '平均授業時間(秒)',
    '最終授業日', '最多シナリオ',
  ];
  const rows = buildMonthlyClassRows(report);
  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  const label = monthLabel(report.year, report.month);
  downloadCSV(csv, `クラス別月次分析_${label}_${date}.csv`);
}

export function buildMonthlyScenarioRows(
  report: MonthlyReportData,
): (string | number | null)[][] {
  return report.scenarioBreakdown.map((s) => [
    monthLabel(report.year, report.month),
    s.title,
    s.slug,
    s.sessionCount,
    s.avgAccuracyRate != null ? Math.round(s.avgAccuracyRate * 1000) / 10 : null,
    s.avgDuration != null ? Math.round(s.avgDuration) : null,
    s.avgDiscussTime != null ? Math.round(s.avgDiscussTime) : null,
    s.avgEvidenceCount,
    s.avgVoteReasonRate != null ? Math.round(s.avgVoteReasonRate * 1000) / 10 : null,
  ]);
}

export function exportMonthlyScenarioCSV(report: MonthlyReportData) {
  const headers = [
    '対象月', 'シナリオ名', 'スラッグ', '実施回数',
    '平均正解率(%)', '平均授業時間(秒)', '平均議論時間(秒)',
    '平均証拠発見数', '投票理由記入率(%)',
  ];
  const rows = buildMonthlyScenarioRows(report);
  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  const label = monthLabel(report.year, report.month);
  downloadCSV(csv, `シナリオ別月次分析_${label}_${date}.csv`);
}

export function buildMonthlyStudentRows(
  report: MonthlyReportData,
): (string | number | null)[][] {
  const sorted = [...report.studentBreakdown].sort(
    (a, b) => b.participationCount - a.participationCount,
  );
  return sorted.map((s) => [
    monthLabel(report.year, report.month),
    s.className,
    s.studentName,
    s.participationCount,
    s.correctCount,
    s.accuracyRate != null ? Math.round(s.accuracyRate * 1000) / 10 : null,
    s.lastSessionDate,
  ]);
}

export function exportMonthlyStudentCSV(report: MonthlyReportData) {
  const headers = [
    '対象月', 'クラス名', '生徒名', '参加回数', '正解数',
    '正解率(%)', '直近参加日',
  ];
  const rows = buildMonthlyStudentRows(report);
  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  const label = monthLabel(report.year, report.month);
  downloadCSV(csv, `生徒参加月次_${label}_${date}.csv`);
}

// ============================================================
// Term Report (Single Term) CSV Export
// ============================================================

export function buildTermSummaryRows(
  report: TermReportData,
): (string | number | null)[][] {
  const s = report.summary;
  const label = termLabel(report.schoolYear, report.term);
  const monthLabels = report.monthlyBreakdown
    .map((m) => `${m.month}月`)
    .join('・');

  return [[
    `${report.schoolYear}年度`,
    `${report.term}学期`,
    s.totalSessions,
    s.totalClasses,
    s.totalStudents,
    s.avgAccuracyRate != null ? Math.round(s.avgAccuracyRate * 1000) / 10 : null,
    s.avgDuration != null ? Math.round(s.avgDuration) : null,
    s.avgDiscussTime != null ? Math.round(s.avgDiscussTime) : null,
    monthLabels || null,
    report.generatedAt,
  ]];
}

export function exportTermSummaryCSV(report: TermReportData) {
  const headers = [
    '年度', '学期', '授業回数', 'クラス数', '参加生徒数',
    '平均正解率(%)', '平均授業時間(秒)', '平均議論時間(秒)',
    '対象月', '出力日時',
  ];
  const rows = buildTermSummaryRows(report);
  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  const label = termLabel(report.schoolYear, report.term);
  downloadCSV(csv, `学期サマリー_${label}_${date}.csv`);
}

export function buildTermClassRows(
  report: TermReportData,
): (string | number | null)[][] {
  return report.classBreakdown.map((c) => [
    `${report.schoolYear}年度`,
    `${report.term}学期`,
    c.className,
    c.gradeLabel,
    c.sessionCount,
    c.avgAccuracyRate != null ? Math.round(c.avgAccuracyRate * 1000) / 10 : null,
    c.avgDiscussTime != null ? Math.round(c.avgDiscussTime) : null,
    c.avgExploreTime != null ? Math.round(c.avgExploreTime) : null,
    c.avgDuration != null ? Math.round(c.avgDuration) : null,
    c.lastSessionDate,
    c.scenarioCounts.length > 0 ? c.scenarioCounts[0].title : null,
  ]);
}

export function exportTermClassCSV(report: TermReportData) {
  const headers = [
    '年度', '学期', 'クラス名', '学年', '授業回数',
    '平均正解率(%)', '平均議論時間(秒)', '平均探索時間(秒)', '平均授業時間(秒)',
    '最終授業日', '最多シナリオ',
  ];
  const rows = buildTermClassRows(report);
  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  const label = termLabel(report.schoolYear, report.term);
  downloadCSV(csv, `クラス別学期分析_${label}_${date}.csv`);
}

export function buildTermScenarioRows(
  report: TermReportData,
): (string | number | null)[][] {
  return report.scenarioBreakdown.map((s) => [
    `${report.schoolYear}年度`,
    `${report.term}学期`,
    s.title,
    s.slug,
    s.sessionCount,
    s.avgAccuracyRate != null ? Math.round(s.avgAccuracyRate * 1000) / 10 : null,
    s.avgDuration != null ? Math.round(s.avgDuration) : null,
    s.avgDiscussTime != null ? Math.round(s.avgDiscussTime) : null,
    s.avgEvidenceCount,
    s.avgVoteReasonRate != null ? Math.round(s.avgVoteReasonRate * 1000) / 10 : null,
  ]);
}

export function exportTermScenarioCSV(report: TermReportData) {
  const headers = [
    '年度', '学期', 'シナリオ名', 'スラッグ', '実施回数',
    '平均正解率(%)', '平均授業時間(秒)', '平均議論時間(秒)',
    '平均証拠発見数', '投票理由記入率(%)',
  ];
  const rows = buildTermScenarioRows(report);
  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  const label = termLabel(report.schoolYear, report.term);
  downloadCSV(csv, `シナリオ別学期分析_${label}_${date}.csv`);
}

export function buildTermStudentRows(
  report: TermReportData,
): (string | number | null)[][] {
  const sorted = [...report.studentBreakdown].sort(
    (a, b) => b.participationCount - a.participationCount,
  );
  return sorted.map((s) => [
    `${report.schoolYear}年度`,
    `${report.term}学期`,
    s.className,
    s.studentName,
    s.participationCount,
    s.correctCount,
    s.accuracyRate != null ? Math.round(s.accuracyRate * 1000) / 10 : null,
    s.lastSessionDate,
  ]);
}

export function exportTermStudentCSV(report: TermReportData) {
  const headers = [
    '年度', '学期', 'クラス名', '生徒名', '参加回数', '正解数',
    '正解率(%)', '直近参加日',
  ];
  const rows = buildTermStudentRows(report);
  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  const label = termLabel(report.schoolYear, report.term);
  downloadCSV(csv, `生徒参加学期_${label}_${date}.csv`);
}

// ============================================================
// Annual Report (Single Year) CSV Export
// ============================================================

export function buildAnnualSummaryRows(
  report: AnnualReportData,
): (string | number | null)[][] {
  const s = report.summary;
  const termSessions = (term: 1 | 2 | 3) =>
    report.termBreakdown.find((t) => t.term === term)?.sessionCount ?? 0;

  return [[
    annualLabel(report.schoolYear),
    s.totalSessions,
    s.totalClasses,
    s.totalStudents,
    s.avgAccuracyRate != null ? Math.round(s.avgAccuracyRate * 1000) / 10 : null,
    s.avgDuration != null ? Math.round(s.avgDuration) : null,
    s.avgDiscussTime != null ? Math.round(s.avgDiscussTime) : null,
    s.avgExploreTime != null ? Math.round(s.avgExploreTime) : null,
    s.avgVoteReasonRate != null ? Math.round(s.avgVoteReasonRate * 1000) / 10 : null,
    s.avgEvidenceCount,
    termSessions(1),
    termSessions(2),
    termSessions(3),
    report.generatedAt,
  ]];
}

export function exportAnnualSummaryCSV(report: AnnualReportData) {
  const headers = [
    '年度', '授業回数', 'クラス数', '参加生徒数',
    '平均正解率(%)', '平均授業時間(秒)', '平均議論時間(秒)', '平均探索時間(秒)',
    '投票理由記入率(%)', '平均証拠発見数',
    '1学期回数', '2学期回数', '3学期回数',
    '出力日時',
  ];
  const rows = buildAnnualSummaryRows(report);
  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(csv, `年度サマリー_${annualLabel(report.schoolYear)}_${date}.csv`);
}

export function buildAnnualClassRows(
  report: AnnualReportData,
): (string | number | null)[][] {
  return report.classBreakdown.map((c) => [
    annualLabel(report.schoolYear),
    c.className,
    c.gradeLabel,
    c.sessionCount,
    c.avgAccuracyRate != null ? Math.round(c.avgAccuracyRate * 1000) / 10 : null,
    c.avgDiscussTime != null ? Math.round(c.avgDiscussTime) : null,
    c.avgExploreTime != null ? Math.round(c.avgExploreTime) : null,
    c.avgDuration != null ? Math.round(c.avgDuration) : null,
    c.lastSessionDate,
    c.scenarioCounts.length > 0 ? c.scenarioCounts[0].title : null,
  ]);
}

export function exportAnnualClassCSV(report: AnnualReportData) {
  const headers = [
    '年度', 'クラス名', '学年', '授業回数',
    '平均正解率(%)', '平均議論時間(秒)', '平均探索時間(秒)', '平均授業時間(秒)',
    '最終授業日', '最多シナリオ',
  ];
  const rows = buildAnnualClassRows(report);
  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(csv, `クラス別年度分析_${annualLabel(report.schoolYear)}_${date}.csv`);
}

export function buildAnnualScenarioRows(
  report: AnnualReportData,
): (string | number | null)[][] {
  return report.scenarioBreakdown.map((s) => [
    annualLabel(report.schoolYear),
    s.title,
    s.slug,
    s.sessionCount,
    s.avgAccuracyRate != null ? Math.round(s.avgAccuracyRate * 1000) / 10 : null,
    s.avgDuration != null ? Math.round(s.avgDuration) : null,
    s.avgDiscussTime != null ? Math.round(s.avgDiscussTime) : null,
    s.avgEvidenceCount,
    s.avgVoteReasonRate != null ? Math.round(s.avgVoteReasonRate * 1000) / 10 : null,
  ]);
}

export function exportAnnualScenarioCSV(report: AnnualReportData) {
  const headers = [
    '年度', 'シナリオ名', 'スラッグ', '実施回数',
    '平均正解率(%)', '平均授業時間(秒)', '平均議論時間(秒)',
    '平均証拠発見数', '投票理由記入率(%)',
  ];
  const rows = buildAnnualScenarioRows(report);
  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(csv, `シナリオ別年度分析_${annualLabel(report.schoolYear)}_${date}.csv`);
}

export function buildAnnualStudentRows(
  report: AnnualReportData,
): (string | number | null)[][] {
  const sorted = [...report.studentBreakdown].sort(
    (a, b) => b.participationCount - a.participationCount,
  );
  return sorted.map((s) => [
    annualLabel(report.schoolYear),
    s.className,
    s.studentName,
    s.participationCount,
    s.correctCount,
    s.accuracyRate != null ? Math.round(s.accuracyRate * 1000) / 10 : null,
    s.lastSessionDate,
  ]);
}

export function exportAnnualStudentCSV(report: AnnualReportData) {
  const headers = [
    '年度', 'クラス名', '生徒名', '参加回数', '正解数',
    '正解率(%)', '直近参加日',
  ];
  const rows = buildAnnualStudentRows(report);
  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(csv, `生徒参加年度_${annualLabel(report.schoolYear)}_${date}.csv`);
}

export function buildAnnualReportHtml(report: AnnualReportData, comparison?: AnnualComparison | null): string {
  const { summary, termBreakdown, classBreakdown, scenarioBreakdown, studentBreakdown, classInsights, insights, improvements } = report;
  const title = annualLabel(report.schoolYear);
  const now = new Date().toLocaleDateString('ja-JP');

  // Summary cards (9 metrics)
  const summaryHtml = `
    <div class="cards" style="grid-template-columns:repeat(3,1fr);">
      <div class="card"><div class="card-value">${summary.totalSessions}</div><div class="card-label">授業回数</div></div>
      <div class="card"><div class="card-value">${summary.totalClasses}</div><div class="card-label">実施クラス数</div></div>
      <div class="card"><div class="card-value">${summary.totalStudents}</div><div class="card-label">参加生徒数</div></div>
      <div class="card"><div class="card-value">${formatPercent(summary.avgAccuracyRate)}</div><div class="card-label">平均正解率</div></div>
      <div class="card"><div class="card-value">${formatMinSec(summary.avgDuration)}</div><div class="card-label">平均授業時間</div></div>
      <div class="card"><div class="card-value">${formatMinSec(summary.avgDiscussTime)}</div><div class="card-label">平均議論時間</div></div>
      <div class="card"><div class="card-value">${formatMinSec(summary.avgExploreTime)}</div><div class="card-label">平均探索時間</div></div>
      <div class="card"><div class="card-value">${summary.avgEvidenceCount != null ? summary.avgEvidenceCount : '--'}</div><div class="card-label">平均証拠発見数</div></div>
      <div class="card"><div class="card-value">${formatPercent(summary.avgVoteReasonRate)}</div><div class="card-label">投票理由記入率</div></div>
    </div>
  `;

  // Term breakdown table
  let termHtml = '';
  if (termBreakdown.length > 0) {
    const rows = termBreakdown.map((t) => `
      <tr>
        <td>${escapeHtml(t.label)}</td>
        <td style="text-align:center">${t.sessionCount}</td>
        <td style="text-align:center">${formatPercent(t.avgAccuracyRate)}</td>
        <td style="text-align:center">${formatMinSec(t.avgDiscussTime)}</td>
        <td style="text-align:center">${formatMinSec(t.avgExploreTime)}</td>
        <td style="text-align:center">${t.avgEvidenceCount != null ? t.avgEvidenceCount : '--'}</td>
        <td style="text-align:center">${formatPercent(t.avgVoteReasonRate)}</td>
      </tr>
    `).join('');

    termHtml = `
      <h2>学期推移</h2>
      <table>
        <thead><tr>
          <th>学期</th><th style="text-align:center">授業回数</th><th style="text-align:center">正解率</th>
          <th style="text-align:center">議論時間</th><th style="text-align:center">探索時間</th>
          <th style="text-align:center">証拠数</th><th style="text-align:center">理由記入率</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // Insights
  let insightsHtml = '';
  if (insights.length > 0) {
    insightsHtml = `
      <h2>年度所見</h2>
      <ul>${insights.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>
    `;
  }

  // Improvements
  let improvementsHtml = '';
  if (improvements.length > 0) {
    improvementsHtml = `
      <h2>次年度への改善提案</h2>
      <div class="insight-group">
        <ul>${improvements.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>
      </div>
    `;
  }

  // Class breakdown table
  let classHtml = '';
  if (classBreakdown.length > 0) {
    const rows = classBreakdown.map((m) => `
      <tr>
        <td>${escapeHtml(m.className)}${m.gradeLabel ? ` (${escapeHtml(m.gradeLabel)})` : ''}</td>
        <td style="text-align:center">${m.sessionCount}</td>
        <td style="text-align:center">${formatPercent(m.avgAccuracyRate)}</td>
        <td style="text-align:center">${formatMinSec(m.avgDiscussTime)}</td>
        <td style="text-align:center">${formatMinSec(m.avgExploreTime)}</td>
      </tr>
    `).join('');

    classHtml = `
      <h2>クラス別年度分析</h2>
      <table>
        <thead><tr><th>クラス</th><th style="text-align:center">実施数</th><th style="text-align:center">正解率</th><th style="text-align:center">議論</th><th style="text-align:center">探索</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    // Class insights
    const classInsightItems: string[] = [];
    classBreakdown.forEach((cm) => {
      const ci = classInsights.get(cm.classId);
      if (!ci) return;
      const allIns = [...ci.observations, ...ci.suggestions, ...ci.recommendations];
      if (allIns.length > 0) {
        classInsightItems.push(`
          <div class="insight-group">
            <div class="insight-label">${escapeHtml(cm.className)}</div>
            <ul>${allIns.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>
          </div>
        `);
      }
    });
    if (classInsightItems.length > 0) {
      classHtml += `<h2>クラス別インサイト</h2>${classInsightItems.join('')}`;
    }
  }

  // Scenario breakdown table
  let scenarioHtml = '';
  if (scenarioBreakdown.length > 0) {
    const rows = scenarioBreakdown.map((m) => `
      <tr>
        <td>${escapeHtml(m.title)}</td>
        <td style="text-align:center">${m.sessionCount}</td>
        <td style="text-align:center">${formatMinSec(m.avgDuration)}</td>
        <td style="text-align:center">${formatPercent(m.avgAccuracyRate)}</td>
      </tr>
    `).join('');

    scenarioHtml = `
      <h2>シナリオ別年度分析</h2>
      <table>
        <thead><tr><th>シナリオ</th><th style="text-align:center">実施数</th><th style="text-align:center">平均時間</th><th style="text-align:center">正解率</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // Student breakdown table (top 20)
  let studentHtml = '';
  if (studentBreakdown.length > 0) {
    const sorted = [...studentBreakdown].sort((a, b) => b.participationCount - a.participationCount);
    const top = sorted.slice(0, 20);
    const rows = top.map((m) => `
      <tr>
        <td>${escapeHtml(m.studentName)}</td>
        <td>${escapeHtml(m.className)}</td>
        <td style="text-align:center">${m.participationCount}</td>
        <td style="text-align:center">${formatPercent(m.accuracyRate)}</td>
      </tr>
    `).join('');

    studentHtml = `
      <h2>生徒参加要約${sorted.length > 20 ? ` (上位20名 / 全${sorted.length}名)` : ''}</h2>
      <p class="note">参加ログの記録です。成績評価ではありません。</p>
      <table>
        <thead><tr><th>生徒名</th><th>クラス</th><th style="text-align:center">参加回数</th><th style="text-align:center">正解率</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>年度レポート - ${escapeHtml(title)}</title>
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
      border-bottom: 3px solid #059669;
      padding-bottom: 8px;
      margin-bottom: 4px;
    }
    .subtitle {
      font-size: 13px;
      color: #666;
      margin-bottom: 24px;
    }
    h2 {
      font-size: 16px;
      margin-top: 28px;
      margin-bottom: 8px;
      padding: 4px 8px;
      background: #f9fafb;
      border-left: 4px solid #059669;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin: 16px 0;
    }
    .card {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 12px;
      text-align: center;
    }
    .card-value {
      font-size: 20px;
      font-weight: 900;
      color: #059669;
    }
    .card-label {
      font-size: 11px;
      color: #6b7280;
      margin-top: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 13px;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 5px 8px;
      text-align: left;
    }
    th { background: #f3f4f6; font-weight: bold; font-size: 12px; }
    .note {
      font-size: 11px;
      color: #9ca3af;
      margin-bottom: 4px;
    }
    .insight-group {
      margin: 8px 0 12px 0;
      padding: 8px 12px;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      border-radius: 4px;
    }
    .insight-label {
      font-weight: bold;
      font-size: 13px;
      margin-bottom: 4px;
    }
    ul { padding-left: 16px; font-size: 13px; }
    li { margin: 2px 0; }
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
    <button onclick="window.print()" style="background:#059669;color:white;border:none;padding:8px 20px;border-radius:6px;font-weight:bold;cursor:pointer;">
      印刷 / PDF保存
    </button>
  </div>

  <h1>年度授業レポート: ${escapeHtml(title)}</h1>
  <div class="subtitle">ナゾトキ探偵団 | 出力日: ${now}</div>

  ${summaryHtml}
  ${buildAnnualComparisonHtml(comparison)}
  ${termHtml}
  ${insightsHtml}
  ${improvementsHtml}
  ${classHtml}
  ${scenarioHtml}
  ${studentHtml}

  <div class="footer">
    ナゾトキ探偵団 年度レポート | ${escapeHtml(title)} | ${now}
  </div>
</body>
</html>`;
}

export function exportAnnualReportPDF(report: AnnualReportData, comparison?: AnnualComparison | null) {
  const html = buildAnnualReportHtml(report, comparison);
  const pw = window.open('', '_blank');
  if (pw) {
    pw.document.write(html);
    pw.document.close();
  }
}

// ============================================================
// School Report — CSV build/export + HTML
// ============================================================

export function buildSchoolSummaryRows(report: SchoolReportData): string[][] {
  const s = report.summary;
  const now = new Date().toLocaleString('ja-JP');
  return [[
    '学校全体',
    String(s.totalSessions),
    String(s.totalClasses),
    String(s.totalStudents),
    s.avgAccuracyRate != null ? String(Math.round(s.avgAccuracyRate * 100)) : '',
    s.avgDuration != null ? String(s.avgDuration) : '',
    s.avgDiscussTime != null ? String(s.avgDiscussTime) : '',
    s.avgExploreTime != null ? String(s.avgExploreTime) : '',
    s.avgEvidenceCount != null ? String(s.avgEvidenceCount) : '',
    s.avgVoteReasonRate != null ? String(Math.round(s.avgVoteReasonRate * 100)) : '',
    String(s.uniqueScenarioCount),
    now,
  ]];
}

const SCHOOL_SUMMARY_HEADERS = [
  'スコープ', '総授業回数', 'クラス数', '参加生徒数',
  '平均正解率(%)', '平均授業時間(秒)', '平均議論時間(秒)', '平均探索時間(秒)',
  '平均証拠発見数', '投票理由記入率(%)', '利用シナリオ数', '出力日時',
];

export function exportSchoolSummaryCSV(report: SchoolReportData, rangeLabel?: string) {
  const suffix = rangeLabel && rangeLabel !== '全期間' ? `_${rangeLabel}` : '';
  downloadCSV(toCSV(SCHOOL_SUMMARY_HEADERS, buildSchoolSummaryRows(report)), `学校サマリー${suffix}`);
}

export function buildSchoolClassRows(report: SchoolReportData): string[][] {
  return report.classBreakdown.map((c) => {
    const topScenario = c.scenarioCounts.length > 0 ? c.scenarioCounts[0].title : '';
    return [
      c.className,
      c.gradeLabel || '',
      String(c.sessionCount),
      c.avgAccuracyRate != null ? String(Math.round(c.avgAccuracyRate * 100)) : '',
      c.avgDiscussTime != null ? String(c.avgDiscussTime) : '',
      c.avgExploreTime != null ? String(c.avgExploreTime) : '',
      c.avgDuration != null ? String(c.avgDuration) : '',
      c.lastSessionDate ? new Date(c.lastSessionDate).toLocaleDateString('ja-JP') : '',
      topScenario,
    ];
  });
}

const SCHOOL_CLASS_HEADERS = [
  'クラス名', '学年', '授業回数',
  '平均正解率(%)', '平均議論時間(秒)', '平均探索時間(秒)', '平均授業時間(秒)',
  '最終授業日', '最多シナリオ',
];

export function exportSchoolClassCSV(report: SchoolReportData, rangeLabel?: string) {
  const suffix = rangeLabel && rangeLabel !== '全期間' ? `_${rangeLabel}` : '';
  downloadCSV(toCSV(SCHOOL_CLASS_HEADERS, buildSchoolClassRows(report)), `クラス別学校分析${suffix}`);
}

export function buildSchoolScenarioRows(report: SchoolReportData): string[][] {
  return report.scenarioBreakdown.map((s) => [
    s.title,
    s.slug,
    String(s.sessionCount),
    String(s.classCount),
    s.avgAccuracyRate != null ? String(Math.round(s.avgAccuracyRate * 100)) : '',
    s.avgDuration != null ? String(s.avgDuration) : '',
    s.avgDiscussTime != null ? String(s.avgDiscussTime) : '',
    s.avgEvidenceCount != null ? String(s.avgEvidenceCount) : '',
    s.avgVoteReasonRate != null ? String(Math.round(s.avgVoteReasonRate * 100)) : '',
  ]);
}

const SCHOOL_SCENARIO_HEADERS = [
  'シナリオ名', 'スラッグ', '実施回数', '実施クラス数',
  '平均正解率(%)', '平均授業時間(秒)', '平均議論時間(秒)',
  '平均証拠発見数', '投票理由記入率(%)',
];

export function exportSchoolScenarioCSV(report: SchoolReportData, rangeLabel?: string) {
  const suffix = rangeLabel && rangeLabel !== '全期間' ? `_${rangeLabel}` : '';
  downloadCSV(toCSV(SCHOOL_SCENARIO_HEADERS, buildSchoolScenarioRows(report)), `シナリオ別学校分析${suffix}`);
}

// ============================================================
// School Report HTML
// ============================================================

export function buildSchoolReportHtml(report: SchoolReportData, rangeLabel?: string): string {
  const { summary, classBreakdown, scenarioBreakdown, insights } = report;
  const now = new Date().toLocaleDateString('ja-JP');
  const periodText = rangeLabel && rangeLabel !== '全期間' ? ` (${rangeLabel})` : '';

  // Summary cards (5x2 grid)
  const summaryHtml = `
    <div class="cards" style="grid-template-columns: repeat(5, 1fr);">
      <div class="card"><div class="card-value">${summary.totalSessions}</div><div class="card-label">総授業回数</div></div>
      <div class="card"><div class="card-value">${summary.totalClasses}</div><div class="card-label">クラス数</div></div>
      <div class="card"><div class="card-value">${summary.totalStudents}</div><div class="card-label">参加生徒数</div></div>
      <div class="card"><div class="card-value">${formatPercent(summary.avgAccuracyRate)}</div><div class="card-label">平均正解率</div></div>
      <div class="card"><div class="card-value">${formatMinSec(summary.avgDuration)}</div><div class="card-label">平均授業時間</div></div>
      <div class="card"><div class="card-value">${formatMinSec(summary.avgDiscussTime)}</div><div class="card-label">平均議論時間</div></div>
      <div class="card"><div class="card-value">${formatMinSec(summary.avgExploreTime)}</div><div class="card-label">平均探索時間</div></div>
      <div class="card"><div class="card-value">${summary.avgEvidenceCount != null ? summary.avgEvidenceCount : '--'}</div><div class="card-label">平均証拠発見数</div></div>
      <div class="card"><div class="card-value">${formatPercent(summary.avgVoteReasonRate)}</div><div class="card-label">投票理由記入率</div></div>
      <div class="card"><div class="card-value">${summary.uniqueScenarioCount}</div><div class="card-label">利用シナリオ数</div></div>
    </div>
  `;

  // Insights
  const observations = insights.filter((i) => i.type === 'observation');
  const suggestions = insights.filter((i) => i.type === 'suggestion');
  let insightsHtml = '';
  if (observations.length > 0) {
    insightsHtml += `
      <h2>学校全体の傾向</h2>
      <ul>${observations.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>
    `;
  }
  if (suggestions.length > 0) {
    insightsHtml += `
      <h2>改善の提案</h2>
      <div class="insight-group">
        <ul>${suggestions.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>
      </div>
    `;
  }

  // Class table
  let classHtml = '';
  if (classBreakdown.length > 0) {
    const rows = classBreakdown.map((c) => `
      <tr>
        <td>${escapeHtml(c.className)}${c.gradeLabel ? ` (${escapeHtml(c.gradeLabel)})` : ''}</td>
        <td style="text-align:center">${c.sessionCount}</td>
        <td style="text-align:center">${formatPercent(c.avgAccuracyRate)}</td>
        <td style="text-align:center">${formatMinSec(c.avgDiscussTime)}</td>
        <td style="text-align:center">${formatMinSec(c.avgExploreTime)}</td>
        <td style="text-align:center">${c.lastSessionDate ? formatDate(c.lastSessionDate) : '--'}</td>
      </tr>
    `).join('');
    classHtml = `
      <h2>クラス別分析</h2>
      <table>
        <thead><tr>
          <th>クラス</th><th style="text-align:center">授業回数</th><th style="text-align:center">正解率</th>
          <th style="text-align:center">議論</th><th style="text-align:center">探索</th><th style="text-align:center">最終実施日</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // Scenario table
  let scenarioHtml = '';
  if (scenarioBreakdown.length > 0) {
    const rows = scenarioBreakdown.map((s) => `
      <tr>
        <td>${escapeHtml(s.title)}</td>
        <td style="text-align:center">${s.sessionCount}</td>
        <td style="text-align:center">${s.classCount}</td>
        <td style="text-align:center">${formatPercent(s.avgAccuracyRate)}</td>
        <td style="text-align:center">${formatMinSec(s.avgDuration)}</td>
        <td style="text-align:center">${formatMinSec(s.avgDiscussTime)}</td>
      </tr>
    `).join('');
    scenarioHtml = `
      <h2>シナリオ別分析</h2>
      <table>
        <thead><tr>
          <th>シナリオ</th><th style="text-align:center">実施回数</th><th style="text-align:center">実施クラス</th>
          <th style="text-align:center">正解率</th><th style="text-align:center">平均時間</th><th style="text-align:center">議論</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>学校全体レポート${periodText}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif;
      padding: 40px;
      color: #333;
      max-width: 900px;
      margin: 0 auto;
      line-height: 1.6;
    }
    h1 {
      font-size: 22px;
      border-bottom: 3px solid #0ea5e9;
      padding-bottom: 8px;
      margin-bottom: 4px;
    }
    .subtitle {
      font-size: 13px;
      color: #666;
      margin-bottom: 24px;
    }
    h2 {
      font-size: 16px;
      margin-top: 28px;
      margin-bottom: 8px;
      padding: 4px 8px;
      background: #f0f9ff;
      border-left: 4px solid #0ea5e9;
    }
    .cards {
      display: grid;
      gap: 8px;
      margin: 16px 0;
    }
    .card {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 12px;
      text-align: center;
    }
    .card-value {
      font-size: 20px;
      font-weight: 900;
      color: #0284c7;
    }
    .card-label {
      font-size: 11px;
      color: #6b7280;
      margin-top: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 13px;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 5px 8px;
      text-align: left;
    }
    th { background: #f3f4f6; font-weight: bold; font-size: 12px; }
    .insight-group {
      margin: 8px 0 12px 0;
      padding: 8px 12px;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 4px;
    }
    ul { padding-left: 16px; font-size: 13px; }
    li { margin: 2px 0; }
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
      .cards { grid-template-columns: repeat(5, 1fr) !important; }
    }
  </style>
</head>
<body>
  <h1>学校全体レポート${periodText}</h1>
  <div class="subtitle">ナゾトキ探偵団 | 出力日: ${now}${periodText ? ` | 対象期間: ${rangeLabel}` : ''}</div>

  ${summaryHtml}
  ${insightsHtml}
  ${classHtml}
  ${scenarioHtml}

  <div class="footer">
    ナゾトキ探偵団 学校全体レポート${periodText} | ${now}
  </div>
</body>
</html>`;
}

export function exportSchoolReportPDF(report: SchoolReportData, rangeLabel?: string) {
  const html = buildSchoolReportHtml(report, rangeLabel);
  const pw = window.open('', '_blank');
  if (pw) {
    pw.document.write(html);
    pw.document.close();
  }
}

// ============================================================
// School Comparison CSV / HTML
// ============================================================

import type {
  SchoolComparison,
  SchoolSummaryDeltas,
  SchoolClassDelta,
  SchoolScenarioDelta,
} from './school-comparison';
import { formatDeltaDisplay } from './monthly-comparison';

const SCHOOL_CMP_SUMMARY_HEADERS = [
  '現在期間', '比較期間', '指標名',
  '現在値', '比較値', '差分値', '差分表示',
  '方向',
];

function fmtDelta(d: { current: number | null; previous: number | null; delta: number | null }, unit: 'pct' | 'time' | 'count' | 'pctPt') {
  return formatDeltaDisplay(d, unit);
}

function summaryDeltaRow(
  curLabel: string, prevLabel: string, name: string,
  d: { current: number | null; previous: number | null; delta: number | null },
  unit: 'pct' | 'time' | 'count' | 'pctPt',
): (string | number | null)[] {
  const display = fmtDelta(d, unit);
  return [
    curLabel, prevLabel, name,
    d.current != null ? (unit === 'pct' || unit === 'pctPt' ? Math.round(d.current * 100) : d.current) : null,
    d.previous != null ? (unit === 'pct' || unit === 'pctPt' ? Math.round(d.previous * 100) : d.previous) : null,
    d.delta != null ? (unit === 'pct' || unit === 'pctPt' ? Math.round(d.delta * 100) : Math.round(d.delta)) : null,
    display.text,
    display.color,
  ];
}

export function buildSchoolComparisonSummaryRows(cmp: SchoolComparison): (string | number | null)[][] {
  const c = cmp.currentLabel;
  const p = cmp.previousLabel;
  const d = cmp.deltas;
  return [
    summaryDeltaRow(c, p, '総授業回数', d.sessions, 'count'),
    summaryDeltaRow(c, p, 'クラス数', d.classes, 'count'),
    summaryDeltaRow(c, p, '参加生徒数', d.students, 'count'),
    summaryDeltaRow(c, p, '平均正解率(%)', d.accuracyRate, 'pctPt'),
    summaryDeltaRow(c, p, '平均授業時間(秒)', d.duration, 'time'),
    summaryDeltaRow(c, p, '平均議論時間(秒)', d.discussTime, 'time'),
    summaryDeltaRow(c, p, '平均探索時間(秒)', d.exploreTime, 'time'),
    summaryDeltaRow(c, p, '平均証拠発見数', d.evidenceCount, 'count'),
    summaryDeltaRow(c, p, '投票理由記入率(%)', d.voteReasonRate, 'pctPt'),
    summaryDeltaRow(c, p, '利用シナリオ数', d.scenarioCount, 'count'),
  ];
}

export function exportSchoolComparisonSummaryCSV(cmp: SchoolComparison) {
  const csv = toCSV(SCHOOL_CMP_SUMMARY_HEADERS, buildSchoolComparisonSummaryRows(cmp));
  const label = `${cmp.currentLabel}_vs_${cmp.previousLabel}`;
  downloadCSV(csv, `学校比較サマリー_${label}`);
}

const SCHOOL_CMP_CLASS_HEADERS = [
  'クラス名', '学年', '現在期間', '比較期間',
  '現在回数', '比較回数', '回数差分',
  '現在正解率(%)', '比較正解率(%)', '正解率差分(pt)',
  '現在議論(秒)', '比較議論(秒)', '議論差分(秒)',
  '現在探索(秒)', '比較探索(秒)', '探索差分(秒)',
];

export function buildSchoolComparisonClassRows(cmp: SchoolComparison): (string | number | null)[][] {
  return cmp.classDeltas.map((cd) => [
    cd.className,
    cd.gradeLabel || '',
    cmp.currentLabel,
    cmp.previousLabel,
    cd.currentSessions,
    cd.previousSessions,
    cd.currentSessions - cd.previousSessions,
    cd.currentAccuracy != null ? Math.round(cd.currentAccuracy * 100) : null,
    cd.previousAccuracy != null ? Math.round(cd.previousAccuracy * 100) : null,
    cd.accuracyDelta != null ? Math.round(cd.accuracyDelta * 100) : null,
    cd.currentDiscussTime,
    cd.previousDiscussTime,
    cd.discussDelta != null ? Math.round(cd.discussDelta) : null,
    cd.currentExploreTime,
    cd.previousExploreTime,
    cd.exploreDelta != null ? Math.round(cd.exploreDelta) : null,
  ]);
}

export function exportSchoolComparisonClassCSV(cmp: SchoolComparison) {
  const csv = toCSV(SCHOOL_CMP_CLASS_HEADERS, buildSchoolComparisonClassRows(cmp));
  const label = `${cmp.currentLabel}_vs_${cmp.previousLabel}`;
  downloadCSV(csv, `クラス別学校比較_${label}`);
}

const SCHOOL_CMP_SCENARIO_HEADERS = [
  'シナリオ名', 'スラッグ', '現在期間', '比較期間',
  '現在回数', '比較回数', '回数差分',
  '現在正解率(%)', '比較正解率(%)', '正解率差分(pt)',
  '現在授業時間(秒)', '比較授業時間(秒)', '授業時間差分(秒)',
];

export function buildSchoolComparisonScenarioRows(cmp: SchoolComparison): (string | number | null)[][] {
  return cmp.scenarioDeltas.map((sd) => [
    sd.title,
    sd.slug,
    cmp.currentLabel,
    cmp.previousLabel,
    sd.currentSessions,
    sd.previousSessions,
    sd.currentSessions - sd.previousSessions,
    sd.currentAccuracy != null ? Math.round(sd.currentAccuracy * 100) : null,
    sd.previousAccuracy != null ? Math.round(sd.previousAccuracy * 100) : null,
    sd.accuracyDelta != null ? Math.round(sd.accuracyDelta * 100) : null,
    sd.currentDuration,
    sd.previousDuration,
    sd.durationDelta != null ? Math.round(sd.durationDelta) : null,
  ]);
}

export function exportSchoolComparisonScenarioCSV(cmp: SchoolComparison) {
  const csv = toCSV(SCHOOL_CMP_SCENARIO_HEADERS, buildSchoolComparisonScenarioRows(cmp));
  const label = `${cmp.currentLabel}_vs_${cmp.previousLabel}`;
  downloadCSV(csv, `シナリオ別学校比較_${label}`);
}

// ============================================================
// School Comparison HTML
// ============================================================

export function buildSchoolComparisonHtml(
  report: SchoolReportData,
  cmp: SchoolComparison,
): string {
  const now = new Date().toLocaleDateString('ja-JP');
  const { summary } = report;
  const d = cmp.deltas;

  // Helper for delta badge
  function badge(dv: { current: number | null; previous: number | null; delta: number | null }, unit: 'pct' | 'time' | 'count' | 'pctPt'): string {
    const display = fmtDelta(dv, unit);
    const color = display.color === 'up' ? '#16a34a' : display.color === 'down' ? '#ef4444' : '#9ca3af';
    return `<span style="color:${color}; font-weight:bold; font-size:12px;">${display.text}</span>`;
  }

  // Summary cards with deltas
  const summaryHtml = `
    <div class="cards" style="grid-template-columns: repeat(5, 1fr);">
      <div class="card"><div class="card-value">${summary.totalSessions}</div><div class="card-delta">${badge(d.sessions, 'count')}</div><div class="card-label">総授業回数</div></div>
      <div class="card"><div class="card-value">${summary.totalClasses}</div><div class="card-delta">${badge(d.classes, 'count')}</div><div class="card-label">クラス数</div></div>
      <div class="card"><div class="card-value">${summary.totalStudents}</div><div class="card-delta">${badge(d.students, 'count')}</div><div class="card-label">参加生徒数</div></div>
      <div class="card"><div class="card-value">${formatPercent(summary.avgAccuracyRate)}</div><div class="card-delta">${badge(d.accuracyRate, 'pctPt')}</div><div class="card-label">平均正解率</div></div>
      <div class="card"><div class="card-value">${formatMinSec(summary.avgDuration)}</div><div class="card-delta">${badge(d.duration, 'time')}</div><div class="card-label">平均授業時間</div></div>
      <div class="card"><div class="card-value">${formatMinSec(summary.avgDiscussTime)}</div><div class="card-delta">${badge(d.discussTime, 'time')}</div><div class="card-label">平均議論時間</div></div>
      <div class="card"><div class="card-value">${formatMinSec(summary.avgExploreTime)}</div><div class="card-delta">${badge(d.exploreTime, 'time')}</div><div class="card-label">平均探索時間</div></div>
      <div class="card"><div class="card-value">${summary.avgEvidenceCount != null ? summary.avgEvidenceCount : '--'}</div><div class="card-delta">${badge(d.evidenceCount, 'count')}</div><div class="card-label">平均証拠発見数</div></div>
      <div class="card"><div class="card-value">${formatPercent(summary.avgVoteReasonRate)}</div><div class="card-delta">${badge(d.voteReasonRate, 'pctPt')}</div><div class="card-label">投票理由記入率</div></div>
      <div class="card"><div class="card-value">${summary.uniqueScenarioCount}</div><div class="card-delta">${badge(d.scenarioCount, 'count')}</div><div class="card-label">利用シナリオ数</div></div>
    </div>
  `;

  // Comparison insights
  const observations = cmp.insights.filter((i) => i.type === 'observation');
  const suggestions = cmp.insights.filter((i) => i.type === 'suggestion');
  let insightsHtml = '';
  if (observations.length > 0) {
    insightsHtml += `
      <h2>比較所見</h2>
      <ul>${observations.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>
    `;
  }
  if (suggestions.length > 0) {
    insightsHtml += `
      <h2>改善の提案</h2>
      <div class="insight-group">
        <ul>${suggestions.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>
      </div>
    `;
  }

  // Class comparison table
  let classHtml = '';
  if (cmp.classDeltas.length > 0) {
    const rows = cmp.classDeltas.map((cd) => {
      const accColor = cd.accuracyDelta != null ? (cd.accuracyDelta > 0 ? '#16a34a' : cd.accuracyDelta < 0 ? '#ef4444' : '#666') : '#999';
      return `
      <tr>
        <td>${escapeHtml(cd.className)}${cd.gradeLabel ? ` (${escapeHtml(cd.gradeLabel)})` : ''}</td>
        <td style="text-align:center">${cd.currentSessions}</td>
        <td style="text-align:center">${cd.previousSessions}</td>
        <td style="text-align:center">${cd.currentAccuracy != null ? Math.round(cd.currentAccuracy * 100) + '%' : '--'}</td>
        <td style="text-align:center">${cd.previousAccuracy != null ? Math.round(cd.previousAccuracy * 100) + '%' : '--'}</td>
        <td style="text-align:center; color:${accColor}; font-weight:bold;">${cd.accuracyDelta != null ? (cd.accuracyDelta > 0 ? '+' : '') + Math.round(cd.accuracyDelta * 100) + 'pt' : '--'}</td>
      </tr>
      `;
    }).join('');
    classHtml = `
      <h2>クラス別比較</h2>
      <table>
        <thead><tr>
          <th>クラス</th>
          <th style="text-align:center">${escapeHtml(cmp.currentLabel)}回数</th>
          <th style="text-align:center">${escapeHtml(cmp.previousLabel)}回数</th>
          <th style="text-align:center">${escapeHtml(cmp.currentLabel)}正解率</th>
          <th style="text-align:center">${escapeHtml(cmp.previousLabel)}正解率</th>
          <th style="text-align:center">正解率差分</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>学校比較レポート (${cmp.currentLabel} vs ${cmp.previousLabel})</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif;
      padding: 40px;
      color: #333;
      max-width: 900px;
      margin: 0 auto;
      line-height: 1.6;
    }
    h1 {
      font-size: 22px;
      border-bottom: 3px solid #0ea5e9;
      padding-bottom: 8px;
      margin-bottom: 4px;
    }
    .subtitle {
      font-size: 13px;
      color: #666;
      margin-bottom: 24px;
    }
    h2 {
      font-size: 16px;
      margin-top: 28px;
      margin-bottom: 8px;
      padding: 4px 8px;
      background: #f0f9ff;
      border-left: 4px solid #0ea5e9;
    }
    .cards {
      display: grid;
      gap: 8px;
      margin: 16px 0;
    }
    .card {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 12px;
      text-align: center;
    }
    .card-value {
      font-size: 20px;
      font-weight: 900;
      color: #0284c7;
    }
    .card-delta {
      margin-top: 2px;
    }
    .card-label {
      font-size: 11px;
      color: #6b7280;
      margin-top: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 13px;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 5px 8px;
      text-align: left;
    }
    th { background: #f3f4f6; font-weight: bold; font-size: 12px; }
    .insight-group {
      margin: 8px 0 12px 0;
      padding: 8px 12px;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 4px;
    }
    ul { padding-left: 16px; font-size: 13px; }
    li { margin: 2px 0; }
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
      .cards { grid-template-columns: repeat(5, 1fr) !important; }
    }
  </style>
</head>
<body>
  <h1>学校比較レポート</h1>
  <div class="subtitle">ナゾトキ探偵団 | ${cmp.currentLabel} vs ${cmp.previousLabel} | 出力日: ${now}</div>

  ${summaryHtml}
  ${insightsHtml}
  ${classHtml}

  <div class="footer">
    ナゾトキ探偵団 学校比較レポート (${cmp.currentLabel} vs ${cmp.previousLabel}) | ${now}
  </div>
</body>
</html>`;
}
