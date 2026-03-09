/**
 * Admin Dashboard Export — CSV, HTML, and ZIP export for admin dashboard.
 *
 * Pure build functions + download triggers.
 * Reuses toCSV/downloadCSV/escapeHtml from analytics-export.ts
 * and downloadZip/ZipEntry from zip-export.ts.
 */

import { toCSV, downloadCSV, escapeHtml } from './analytics-export';
import { downloadZip, type ZipEntry } from './zip-export';
import { formatMinSec, formatPercent, formatDate } from './session-analytics';
import type { AdminKPI, ClassStatus, ScenarioStatus } from './admin-dashboard';
import type { Insight } from './session-insights';
import type { AdminKPIDeltas, AdminClassDelta, AdminComparison } from './admin-comparison';

// ============================================================
// Helpers
// ============================================================

function dateSuffix(): string {
  return new Date().toISOString().slice(0, 10);
}

function rangeSuffix(rangeLabel: string): string {
  return rangeLabel && rangeLabel !== '全期間' ? `_${rangeLabel}` : '';
}

function pctOrNull(rate: number | null): string {
  if (rate == null) return '';
  return String(Math.round(rate * 100));
}

// ============================================================
// 1. Admin Summary CSV
// ============================================================

const SUMMARY_HEADERS = [
  'スコープ', '期間タイプ', '期間',
  '総授業回数', '実施クラス数', '参加生徒数',
  '平均正解率(%)', '平均議論時間(秒)', '平均探索時間(秒)',
  '利用シナリオ数', '直近30日授業回数', '低活用クラス数',
  'クラス間格差(pt)', '出力日時', 'レポート種別',
];

export function buildAdminSummaryRows(
  kpi: AdminKPI,
  rangeType: string,
  rangeLabel: string,
): (string | number | null)[][] {
  return [[
    '管理職ダッシュボード',
    rangeType,
    rangeLabel,
    kpi.totalSessions,
    kpi.activeClassCount,
    kpi.totalStudents,
    pctOrNull(kpi.avgAccuracyRate),
    kpi.avgDiscussTime ?? '',
    kpi.avgExploreTime ?? '',
    kpi.uniqueScenarioCount,
    kpi.last30DaySessions,
    kpi.lowActivityClassCount,
    kpi.classGapPt ?? '',
    new Date().toISOString(),
    '管理職ダッシュボード',
  ]];
}

export function exportAdminSummaryCSV(
  kpi: AdminKPI,
  rangeType: string,
  rangeLabel: string,
): void {
  const rows = buildAdminSummaryRows(kpi, rangeType, rangeLabel);
  const csv = toCSV(SUMMARY_HEADERS, rows);
  const suffix = rangeSuffix(rangeLabel);
  downloadCSV(csv, `管理サマリー${suffix}_${dateSuffix()}.csv`);
}

// ============================================================
// 2. Class Status CSV
// ============================================================

const CLASS_HEADERS = [
  'スコープ', '期間タイプ', '期間',
  'クラス名', '学年', '授業回数',
  '平均正解率(%)', '平均議論時間(秒)', '平均探索時間(秒)',
  '最終実施日', '活用状況',
];

export function buildAdminClassRows(
  statuses: ClassStatus[],
  rangeType: string,
  rangeLabel: string,
): (string | number | null)[][] {
  return statuses.map((s) => [
    '管理職ダッシュボード',
    rangeType,
    rangeLabel,
    s.className,
    s.gradeLabel ?? '',
    s.sessionCount,
    pctOrNull(s.avgAccuracyRate),
    s.avgDiscussTime ?? '',
    s.avgExploreTime ?? '',
    s.lastSessionDate ? s.lastSessionDate.slice(0, 10) : '',
    s.statusLabel,
  ]);
}

export function exportAdminClassCSV(
  statuses: ClassStatus[],
  rangeType: string,
  rangeLabel: string,
): void {
  const rows = buildAdminClassRows(statuses, rangeType, rangeLabel);
  const csv = toCSV(CLASS_HEADERS, rows);
  const suffix = rangeSuffix(rangeLabel);
  downloadCSV(csv, `クラス活用状況${suffix}_${dateSuffix()}.csv`);
}

// ============================================================
// 3. Scenario Status CSV
// ============================================================

const SCENARIO_HEADERS = [
  'スコープ', '期間タイプ', '期間',
  'シナリオ名', 'スラッグ', '使用回数', '実施クラス数',
  '平均正解率(%)', '平均授業時間(秒)', '活用状況',
];

export function buildAdminScenarioRows(
  statuses: ScenarioStatus[],
  rangeType: string,
  rangeLabel: string,
): (string | number | null)[][] {
  return statuses.map((s) => [
    '管理職ダッシュボード',
    rangeType,
    rangeLabel,
    s.title || s.slug,
    s.slug,
    s.sessionCount,
    s.classCount,
    pctOrNull(s.avgAccuracyRate),
    s.avgDuration ?? '',
    s.statusLabel,
  ]);
}

export function exportAdminScenarioCSV(
  statuses: ScenarioStatus[],
  rangeType: string,
  rangeLabel: string,
): void {
  const rows = buildAdminScenarioRows(statuses, rangeType, rangeLabel);
  const csv = toCSV(SCENARIO_HEADERS, rows);
  const suffix = rangeSuffix(rangeLabel);
  downloadCSV(csv, `シナリオ活用状況${suffix}_${dateSuffix()}.csv`);
}

// ============================================================
// 4. Admin Dashboard HTML
// ============================================================

export function buildAdminDashboardHtml(
  kpi: AdminKPI,
  classStatuses: ClassStatus[],
  scenarioStatuses: ScenarioStatus[],
  insights: Insight[],
  rangeLabel: string,
): string {
  const periodText = rangeLabel !== '全期間' ? ` (${escapeHtml(rangeLabel)})` : '';
  const now = new Date().toLocaleString('ja-JP');
  const observations = insights.filter((i) => i.type === 'observation');
  const suggestions = insights.filter((i) => i.type === 'suggestion');

  const kpiCards = [
    { label: '総授業回数', value: `${kpi.totalSessions}回` },
    { label: '実施クラス数', value: `${kpi.activeClassCount}クラス` },
    { label: '参加生徒数', value: `${kpi.totalStudents}人` },
    { label: '平均正解率', value: kpi.avgAccuracyRate != null ? formatPercent(kpi.avgAccuracyRate) : '-' },
    { label: '平均議論時間', value: kpi.avgDiscussTime != null ? formatMinSec(kpi.avgDiscussTime) : '-' },
    { label: '平均探索時間', value: kpi.avgExploreTime != null ? formatMinSec(kpi.avgExploreTime) : '-' },
    { label: '利用シナリオ数', value: `${kpi.uniqueScenarioCount}種類` },
    { label: '直近30日', value: `${kpi.last30DaySessions}回` },
    { label: '低活用クラス', value: `${kpi.lowActivityClassCount}クラス` },
    { label: 'クラス間格差', value: kpi.classGapPt != null ? `${kpi.classGapPt}pt` : '-' },
  ];

  const kpiHtml = kpiCards.map((c) =>
    `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center;">
      <div style="font-size:20px;font-weight:900;color:#0369a1;">${escapeHtml(c.value)}</div>
      <div style="font-size:11px;color:#64748b;margin-top:4px;">${escapeHtml(c.label)}</div>
    </div>`
  ).join('\n');

  const obsHtml = observations.length > 0
    ? observations.map((o) => `<div style="margin:4px 0;"><span style="color:#0ea5e9;">●</span> ${escapeHtml(o.text)}</div>`).join('\n')
    : '';

  const sugHtml = suggestions.length > 0
    ? `<div style="margin-top:8px;font-size:12px;font-weight:bold;color:#0284c7;">提案</div>\n` +
      suggestions.map((s) => `<div style="margin:4px 0;"><span style="color:#f59e0b;">▶</span> ${escapeHtml(s.text)}</div>`).join('\n')
    : '';

  const classTableHtml = classStatuses.length > 0
    ? `<h2 style="font-size:14px;margin-top:24px;">クラス活用状況</h2>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
<thead><tr style="border-bottom:2px solid #e2e8f0;color:#64748b;">
  <th style="text-align:left;padding:6px;">クラス名</th>
  <th style="text-align:left;padding:6px;">学年</th>
  <th style="text-align:right;padding:6px;">授業回数</th>
  <th style="text-align:right;padding:6px;">正解率</th>
  <th style="text-align:right;padding:6px;">議論時間</th>
  <th style="text-align:right;padding:6px;">探索時間</th>
  <th style="text-align:right;padding:6px;">最終実施日</th>
  <th style="text-align:center;padding:6px;">状況</th>
</tr></thead>
<tbody>
${classStatuses.map((s) => {
  const bg = s.statusLabel === '活用中' ? '#dcfce7' : s.statusLabel === '導入段階' ? '#fef9c3' : '#fee2e2';
  const fg = s.statusLabel === '活用中' ? '#15803d' : s.statusLabel === '導入段階' ? '#a16207' : '#dc2626';
  return `<tr style="border-bottom:1px solid #f1f5f9;">
  <td style="padding:6px;font-weight:bold;">${escapeHtml(s.className)}</td>
  <td style="padding:6px;color:#64748b;">${escapeHtml(s.gradeLabel || '-')}</td>
  <td style="padding:6px;text-align:right;">${s.sessionCount}</td>
  <td style="padding:6px;text-align:right;">${s.avgAccuracyRate != null ? formatPercent(s.avgAccuracyRate) : '-'}</td>
  <td style="padding:6px;text-align:right;">${s.avgDiscussTime != null ? formatMinSec(s.avgDiscussTime) : '-'}</td>
  <td style="padding:6px;text-align:right;">${s.avgExploreTime != null ? formatMinSec(s.avgExploreTime) : '-'}</td>
  <td style="padding:6px;text-align:right;color:#64748b;">${s.lastSessionDate ? formatDate(s.lastSessionDate) : '-'}</td>
  <td style="padding:6px;text-align:center;"><span style="background:${bg};color:${fg};padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:bold;">${escapeHtml(s.statusLabel)}</span></td>
</tr>`;
}).join('\n')}
</tbody></table>`
    : '';

  const scenarioTableHtml = scenarioStatuses.length > 0
    ? `<h2 style="font-size:14px;margin-top:24px;">シナリオ活用状況</h2>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
<thead><tr style="border-bottom:2px solid #e2e8f0;color:#64748b;">
  <th style="text-align:left;padding:6px;">シナリオ名</th>
  <th style="text-align:right;padding:6px;">使用回数</th>
  <th style="text-align:right;padding:6px;">実施クラス</th>
  <th style="text-align:right;padding:6px;">正解率</th>
  <th style="text-align:right;padding:6px;">平均時間</th>
  <th style="text-align:center;padding:6px;">状況</th>
</tr></thead>
<tbody>
${scenarioStatuses.map((s) => {
  const bg = s.statusLabel === 'よく使われている' ? '#dcfce7' : s.statusLabel === '継続活用候補' ? '#fef9c3' : '#f1f5f9';
  const fg = s.statusLabel === 'よく使われている' ? '#15803d' : s.statusLabel === '継続活用候補' ? '#a16207' : '#64748b';
  return `<tr style="border-bottom:1px solid #f1f5f9;">
  <td style="padding:6px;font-weight:bold;">${escapeHtml(s.title || s.slug)}</td>
  <td style="padding:6px;text-align:right;">${s.sessionCount}</td>
  <td style="padding:6px;text-align:right;">${s.classCount}</td>
  <td style="padding:6px;text-align:right;">${s.avgAccuracyRate != null ? formatPercent(s.avgAccuracyRate) : '-'}</td>
  <td style="padding:6px;text-align:right;">${s.avgDuration != null ? formatMinSec(s.avgDuration) : '-'}</td>
  <td style="padding:6px;text-align:center;"><span style="background:${bg};color:${fg};padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:bold;">${escapeHtml(s.statusLabel)}</span></td>
</tr>`;
}).join('\n')}
</tbody></table>`
    : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>管理職ダッシュボード${periodText}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 900px; margin: 0 auto; padding: 24px; color: #1e293b; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<h1 style="font-size:18px;margin-bottom:4px;">管理職ダッシュボード${periodText}</h1>
<p style="font-size:12px;color:#94a3b8;margin-bottom:16px;">出力日時: ${escapeHtml(now)}</p>

<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:20px;">
${kpiHtml}
</div>

${(obsHtml || sugHtml) ? `<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin-bottom:20px;">
<h2 style="font-size:13px;font-weight:900;color:#0369a1;margin-bottom:8px;">学校全体の傾向</h2>
${obsHtml}
${sugHtml}
</div>` : ''}

${classTableHtml}
${scenarioTableHtml}

<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;">
  ナゾトキ探偵団 管理職ダッシュボード — ${escapeHtml(now)}
</div>
</body>
</html>`;
}

// ============================================================
// 5. HTML Download
// ============================================================

export function exportAdminDashboardHtml(
  kpi: AdminKPI,
  classStatuses: ClassStatus[],
  scenarioStatuses: ScenarioStatus[],
  insights: Insight[],
  rangeLabel: string,
): void {
  const html = buildAdminDashboardHtml(kpi, classStatuses, scenarioStatuses, insights, rangeLabel);
  const suffix = rangeSuffix(rangeLabel);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `管理ダッシュボード${suffix}_${dateSuffix()}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// 6. Admin Dashboard ZIP
// ============================================================

export function exportAdminDashboardZip(
  kpi: AdminKPI,
  classStatuses: ClassStatus[],
  scenarioStatuses: ScenarioStatus[],
  insights: Insight[],
  rangeType: string,
  rangeLabel: string,
): void {
  const suffix = rangeSuffix(rangeLabel);
  const date = dateSuffix();
  const entries: ZipEntry[] = [];

  // Summary CSV (always included)
  const summaryRows = buildAdminSummaryRows(kpi, rangeType, rangeLabel);
  entries.push({
    filename: `管理サマリー${suffix}_${date}.csv`,
    content: toCSV(SUMMARY_HEADERS, summaryRows),
  });

  // Class CSV (if data exists)
  if (classStatuses.length > 0) {
    const classRows = buildAdminClassRows(classStatuses, rangeType, rangeLabel);
    entries.push({
      filename: `クラス活用状況${suffix}_${date}.csv`,
      content: toCSV(CLASS_HEADERS, classRows),
    });
  }

  // Scenario CSV (if data exists)
  if (scenarioStatuses.length > 0) {
    const scenarioRows = buildAdminScenarioRows(scenarioStatuses, rangeType, rangeLabel);
    entries.push({
      filename: `シナリオ活用状況${suffix}_${date}.csv`,
      content: toCSV(SCENARIO_HEADERS, scenarioRows),
    });
  }

  // HTML (always included)
  const html = buildAdminDashboardHtml(kpi, classStatuses, scenarioStatuses, insights, rangeLabel);
  entries.push({
    filename: `管理ダッシュボード${suffix}_${date}.html`,
    content: html,
  });

  downloadZip(entries, `管理ダッシュボード一式${suffix}_${date}.zip`);
}

// ============================================================
// 7. Comparison Summary CSV
// ============================================================

const COMPARISON_SUMMARY_HEADERS = [
  '指標', '当期', '前期', '差分',
];

function deltaStr(current: number | null, previous: number | null, isPct = false): string {
  if (current == null || previous == null) return '';
  const d = current - previous;
  if (isPct) return String(Math.round(d * 100));
  return String(Math.round(d * 100) / 100);
}

export function buildAdminComparisonSummaryRows(
  deltas: AdminKPIDeltas,
): (string | number | null)[][] {
  const d = deltas;
  return [
    ['授業回数', d.sessions.current, d.sessions.previous, d.sessions.delta],
    ['実施クラス数', d.activeClasses.current, d.activeClasses.previous, d.activeClasses.delta],
    ['参加生徒数', d.students.current, d.students.previous, d.students.delta],
    ['平均正解率(%)', pctOrNull(d.accuracyRate.current), pctOrNull(d.accuracyRate.previous), deltaStr(d.accuracyRate.current, d.accuracyRate.previous, true)],
    ['平均議論時間(秒)', d.discussTime.current ?? '', d.discussTime.previous ?? '', d.discussTime.delta ?? ''],
    ['平均探索時間(秒)', d.exploreTime.current ?? '', d.exploreTime.previous ?? '', d.exploreTime.delta ?? ''],
    ['利用シナリオ数', d.scenarioCount.current, d.scenarioCount.previous, d.scenarioCount.delta],
    ['低活用クラス数', d.lowActivityClasses.current, d.lowActivityClasses.previous, d.lowActivityClasses.delta],
    ['クラス間格差(pt)', d.classGapPt.current ?? '', d.classGapPt.previous ?? '', d.classGapPt.delta ?? ''],
  ];
}

export function exportAdminComparisonSummaryCSV(
  comparison: AdminComparison,
): void {
  const rows = buildAdminComparisonSummaryRows(comparison.deltas);
  const headers = [
    '指標',
    comparison.currentLabel,
    comparison.previousLabel,
    '差分',
  ];
  const csv = toCSV(headers, rows);
  downloadCSV(csv, `管理比較サマリー_${dateSuffix()}.csv`);
}

// ============================================================
// 8. Class Comparison CSV
// ============================================================

const CLASS_COMPARISON_HEADERS = [
  'クラス名', '学年',
  '当期授業数', '前期授業数', '授業数差分',
  '当期正解率(%)', '前期正解率(%)', '正解率差分(pt)',
  '当期議論時間', '前期議論時間', '議論時間差分',
  '当期探索時間', '前期探索時間', '探索時間差分',
  '活用状況',
];

export function buildAdminClassComparisonRows(
  classDeltas: AdminClassDelta[],
): (string | number | null)[][] {
  return classDeltas.map((c) => [
    c.className,
    c.gradeLabel ?? '',
    c.currentSessions,
    c.previousSessions,
    c.sessionsDelta,
    pctOrNull(c.currentAccuracy),
    pctOrNull(c.previousAccuracy),
    c.accuracyDelta != null ? String(Math.round(c.accuracyDelta * 100)) : '',
    c.currentDiscussTime ?? '',
    c.previousDiscussTime ?? '',
    c.discussDelta != null ? String(Math.round(c.discussDelta)) : '',
    c.currentExploreTime ?? '',
    c.previousExploreTime ?? '',
    c.exploreDelta != null ? String(Math.round(c.exploreDelta)) : '',
    c.statusLabel,
  ]);
}

export function exportAdminClassComparisonCSV(
  comparison: AdminComparison,
): void {
  const rows = buildAdminClassComparisonRows(comparison.classDeltas);
  const csv = toCSV(CLASS_COMPARISON_HEADERS, rows);
  downloadCSV(csv, `クラス比較_${dateSuffix()}.csv`);
}

// ============================================================
// 9. Comparison HTML
// ============================================================

export function buildAdminComparisonHtml(
  comparison: AdminComparison,
): string {
  const { currentLabel, previousLabel, deltas, classDeltas, insights } = comparison;
  const now = new Date().toLocaleString('ja-JP');
  const observations = insights.filter((i) => i.type === 'observation');
  const suggestions = insights.filter((i) => i.type === 'suggestion');

  function fmtDelta(d: { current: number | null; previous: number | null; delta: number | null }, isPct = false): string {
    if (d.delta == null) return '-';
    const val = isPct ? Math.round(d.delta * 100) : Math.round(d.delta * 100) / 100;
    const sign = val > 0 ? '+' : '';
    const unit = isPct ? 'pt' : '';
    return `${sign}${val}${unit}`;
  }

  function deltaColor(val: number | null, positive: boolean): string {
    if (val == null || val === 0) return '#64748b';
    if (positive) return val > 0 ? '#16a34a' : '#dc2626';
    return val < 0 ? '#16a34a' : '#dc2626'; // negative metrics: lower is better
  }

  const summaryRows = [
    { label: '授業回数', d: deltas.sessions, isPct: false, positive: true },
    { label: '実施クラス数', d: deltas.activeClasses, isPct: false, positive: true },
    { label: '参加生徒数', d: deltas.students, isPct: false, positive: true },
    { label: '平均正解率', d: deltas.accuracyRate, isPct: true, positive: true },
    { label: '平均議論時間', d: deltas.discussTime, isPct: false, positive: true },
    { label: '平均探索時間', d: deltas.exploreTime, isPct: false, positive: true },
    { label: '利用シナリオ数', d: deltas.scenarioCount, isPct: false, positive: true },
    { label: '低活用クラス数', d: deltas.lowActivityClasses, isPct: false, positive: false },
    { label: 'クラス間格差', d: deltas.classGapPt, isPct: false, positive: false },
  ];

  const summaryTableHtml = summaryRows.map((r) => {
    const curVal = r.isPct ? pctOrNull(r.d.current) + '%' : (r.d.current ?? '-');
    const prevVal = r.isPct ? pctOrNull(r.d.previous) + '%' : (r.d.previous ?? '-');
    const dVal = fmtDelta(r.d, r.isPct);
    const dColor = deltaColor(r.d.delta, r.positive);
    return `<tr style="border-bottom:1px solid #f1f5f9;">
  <td style="padding:6px;font-weight:bold;">${escapeHtml(r.label)}</td>
  <td style="padding:6px;text-align:right;">${curVal}</td>
  <td style="padding:6px;text-align:right;color:#64748b;">${prevVal}</td>
  <td style="padding:6px;text-align:right;font-weight:bold;color:${dColor};">${dVal}</td>
</tr>`;
  }).join('\n');

  const classTableHtml = classDeltas.length > 0
    ? `<h2 style="font-size:14px;margin-top:24px;">クラス別比較</h2>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
<thead><tr style="border-bottom:2px solid #e2e8f0;color:#64748b;">
  <th style="text-align:left;padding:6px;">クラス名</th>
  <th style="text-align:right;padding:6px;">当期</th>
  <th style="text-align:right;padding:6px;">前期</th>
  <th style="text-align:right;padding:6px;">授業差分</th>
  <th style="text-align:right;padding:6px;">正解率差分</th>
  <th style="text-align:center;padding:6px;">状況</th>
</tr></thead>
<tbody>
${classDeltas.map((c) => {
  const bg = c.statusLabel === '活用中' ? '#dcfce7' : c.statusLabel === '導入段階' ? '#fef9c3' : '#fee2e2';
  const fg = c.statusLabel === '活用中' ? '#15803d' : c.statusLabel === '導入段階' ? '#a16207' : '#dc2626';
  const accDelta = c.accuracyDelta != null ? `${c.accuracyDelta > 0 ? '+' : ''}${Math.round(c.accuracyDelta * 100)}pt` : '-';
  const accColor = c.accuracyDelta != null ? (c.accuracyDelta > 0 ? '#16a34a' : c.accuracyDelta < 0 ? '#dc2626' : '#64748b') : '#64748b';
  const sesDelta = c.sessionsDelta > 0 ? `+${c.sessionsDelta}` : String(c.sessionsDelta);
  const sesColor = c.sessionsDelta > 0 ? '#16a34a' : c.sessionsDelta < 0 ? '#dc2626' : '#64748b';
  return `<tr style="border-bottom:1px solid #f1f5f9;">
  <td style="padding:6px;font-weight:bold;">${escapeHtml(c.className)}</td>
  <td style="padding:6px;text-align:right;">${c.currentSessions}</td>
  <td style="padding:6px;text-align:right;color:#64748b;">${c.previousSessions}</td>
  <td style="padding:6px;text-align:right;font-weight:bold;color:${sesColor};">${sesDelta}</td>
  <td style="padding:6px;text-align:right;font-weight:bold;color:${accColor};">${accDelta}</td>
  <td style="padding:6px;text-align:center;"><span style="background:${bg};color:${fg};padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:bold;">${escapeHtml(c.statusLabel)}</span></td>
</tr>`;
}).join('\n')}
</tbody></table>`
    : '';

  const obsHtml = observations.length > 0
    ? observations.map((o) => `<div style="margin:4px 0;"><span style="color:#0ea5e9;">●</span> ${escapeHtml(o.text)}</div>`).join('\n')
    : '';

  const sugHtml = suggestions.length > 0
    ? `<div style="margin-top:8px;font-size:12px;font-weight:bold;color:#0284c7;">提案</div>\n` +
      suggestions.map((s) => `<div style="margin:4px 0;"><span style="color:#f59e0b;">▶</span> ${escapeHtml(s.text)}</div>`).join('\n')
    : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>管理職ダッシュボード 期間比較（${escapeHtml(currentLabel)} vs ${escapeHtml(previousLabel)}）</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 900px; margin: 0 auto; padding: 24px; color: #1e293b; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<h1 style="font-size:18px;margin-bottom:4px;">管理職ダッシュボード 期間比較</h1>
<p style="font-size:12px;color:#94a3b8;margin-bottom:16px;">${escapeHtml(currentLabel)} vs ${escapeHtml(previousLabel)} — 出力日時: ${escapeHtml(now)}</p>

<h2 style="font-size:14px;margin-bottom:8px;">KPI比較サマリー</h2>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
<thead><tr style="border-bottom:2px solid #e2e8f0;color:#64748b;">
  <th style="text-align:left;padding:6px;">指標</th>
  <th style="text-align:right;padding:6px;">${escapeHtml(currentLabel)}</th>
  <th style="text-align:right;padding:6px;">${escapeHtml(previousLabel)}</th>
  <th style="text-align:right;padding:6px;">差分</th>
</tr></thead>
<tbody>
${summaryTableHtml}
</tbody></table>

${(obsHtml || sugHtml) ? `<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin-bottom:20px;">
<h2 style="font-size:13px;font-weight:900;color:#0369a1;margin-bottom:8px;">比較インサイト</h2>
${obsHtml}
${sugHtml}
</div>` : ''}

${classTableHtml}

<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;">
  ナゾトキ探偵団 管理職ダッシュボード 期間比較 — ${escapeHtml(now)}
</div>
</body>
</html>`;
}

// ============================================================
// 10. Comparison HTML Download
// ============================================================

export function exportAdminComparisonHtml(
  comparison: AdminComparison,
): void {
  const html = buildAdminComparisonHtml(comparison);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `管理比較_${dateSuffix()}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// 11. Comparison ZIP
// ============================================================

export function exportAdminComparisonZip(
  comparison: AdminComparison,
  kpi: AdminKPI,
  classStatuses: ClassStatus[],
  scenarioStatuses: ScenarioStatus[],
  adminInsights: Insight[],
  rangeType: string,
  rangeLabel: string,
): void {
  const date = dateSuffix();
  const suffix = rangeSuffix(rangeLabel);
  const entries: ZipEntry[] = [];

  // Current period dashboard files
  const summaryRows = buildAdminSummaryRows(kpi, rangeType, rangeLabel);
  entries.push({
    filename: `管理サマリー${suffix}_${date}.csv`,
    content: toCSV(SUMMARY_HEADERS, summaryRows),
  });

  if (classStatuses.length > 0) {
    entries.push({
      filename: `クラス活用状況${suffix}_${date}.csv`,
      content: toCSV(CLASS_HEADERS, classStatuses.map((s) => [
        '管理職ダッシュボード', rangeType, rangeLabel,
        s.className, s.gradeLabel ?? '', s.sessionCount,
        pctOrNull(s.avgAccuracyRate), s.avgDiscussTime ?? '', s.avgExploreTime ?? '',
        s.lastSessionDate ? s.lastSessionDate.slice(0, 10) : '', s.statusLabel,
      ])),
    });
  }

  if (scenarioStatuses.length > 0) {
    entries.push({
      filename: `シナリオ活用状況${suffix}_${date}.csv`,
      content: toCSV(SCENARIO_HEADERS, buildAdminScenarioRows(scenarioStatuses, rangeType, rangeLabel)),
    });
  }

  entries.push({
    filename: `管理ダッシュボード${suffix}_${date}.html`,
    content: buildAdminDashboardHtml(kpi, classStatuses, scenarioStatuses, adminInsights, rangeLabel),
  });

  // Comparison files
  const compSummaryRows = buildAdminComparisonSummaryRows(comparison.deltas);
  const compHeaders = ['指標', comparison.currentLabel, comparison.previousLabel, '差分'];
  entries.push({
    filename: `管理比較サマリー_${date}.csv`,
    content: toCSV(compHeaders, compSummaryRows),
  });

  if (comparison.classDeltas.length > 0) {
    entries.push({
      filename: `クラス比較_${date}.csv`,
      content: toCSV(CLASS_COMPARISON_HEADERS, buildAdminClassComparisonRows(comparison.classDeltas)),
    });
  }

  entries.push({
    filename: `管理比較_${date}.html`,
    content: buildAdminComparisonHtml(comparison),
  });

  downloadZip(entries, `管理ダッシュボード比較一式${suffix}_${date}.zip`);
}
