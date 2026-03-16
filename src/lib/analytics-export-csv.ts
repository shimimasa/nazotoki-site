/**
 * Analytics Export CSV utilities and direct CSV exporters.
 */

import type { SessionLogRow } from './supabase';
import type { StudentAggregateMetrics } from './session-analytics';
import type { ClassTrend, ScenarioTrend } from './session-trends';
export {
  exportAnnualComparisonSummaryCSV,
  exportAnnualComparisonClassCSV,
  exportAnnualComparisonScenarioCSV,
  exportMonthlyComparisonSummaryCSV,
  exportMonthlyComparisonClassCSV,
  exportMonthlyComparisonScenarioCSV,
  exportTermComparisonSummaryCSV,
  exportTermComparisonClassCSV,
  exportTermComparisonScenarioCSV,
  exportMonthlySummaryCSV,
  exportMonthlyClassCSV,
  exportMonthlyScenarioCSV,
  exportMonthlyStudentCSV,
  exportTermSummaryCSV,
  exportTermClassCSV,
  exportTermScenarioCSV,
  exportTermStudentCSV,
  exportAnnualSummaryCSV,
  exportAnnualClassCSV,
  exportAnnualScenarioCSV,
  exportAnnualStudentCSV,
  exportSchoolSummaryCSV,
  exportSchoolClassCSV,
  exportSchoolScenarioCSV,
  exportSchoolComparisonSummaryCSV,
  exportSchoolComparisonClassCSV,
  exportSchoolComparisonScenarioCSV,
} from './analytics-export-reports';

export type DateRangeType = 'all' | 'last30' | 'last90' | 'thisTerm' | 'thisYear' | 'custom';

export interface DateRange {
  type: DateRangeType;
  start?: string; // ISO date string for custom
  end?: string;   // ISO date string for custom
}

// ============================================================
// Date Range Filter
// ============================================================

function getDateRangeBounds(range: DateRange): { start: Date | null; end: Date | null } {
  const now = new Date();

  switch (range.type) {
    case 'all':
      return { start: null, end: null };

    case 'last30': {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      return { start, end: null };
    }

    case 'last90': {
      const start = new Date(now);
      start.setDate(start.getDate() - 90);
      start.setHours(0, 0, 0, 0);
      return { start, end: null };
    }

    case 'thisTerm': {
      // Current Japanese school term
      const m = now.getMonth() + 1; // 1-based
      const year = m >= 4 ? now.getFullYear() : now.getFullYear() - 1;
      let termStart: Date;
      if (m >= 4 && m <= 8) {
        termStart = new Date(year, 3, 1); // 1学期: April 1
      } else if (m >= 9 && m <= 12) {
        termStart = new Date(year, 8, 1); // 2学期: September 1
      } else {
        termStart = new Date(year + 1, 0, 1); // 3学期: January 1
      }
      return { start: termStart, end: null };
    }

    case 'thisYear': {
      // Japanese school year: April 1 to March 31
      const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      const start = new Date(year, 3, 1); // April 1
      return { start, end: null };
    }

    case 'custom': {
      const start = range.start ? new Date(range.start) : null;
      const end = range.end ? new Date(range.end + 'T23:59:59') : null;
      return { start, end };
    }

    default:
      return { start: null, end: null };
  }
}

export function filterSessionsByRange(
  logs: SessionLogRow[],
  range: DateRange,
): SessionLogRow[] {
  if (range.type === 'all') return logs;

  const { start, end } = getDateRangeBounds(range);

  return logs.filter((log) => {
    const dateStr = log.start_time || log.created_at;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
}

export function filterStudentLogsByRange(
  studentLogs: { student_id: string; is_correct: boolean | null; vote_reason: string | null; created_at: string }[],
  range: DateRange,
): typeof studentLogs {
  if (range.type === 'all') return studentLogs;

  const { start, end } = getDateRangeBounds(range);

  return studentLogs.filter((sl) => {
    const d = new Date(sl.created_at);
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
}

/** Human-readable label for a date range */
export function dateRangeLabel(range: DateRange): string {
  switch (range.type) {
    case 'all': return '全期間';
    case 'last30': return '直近30日';
    case 'last90': return '直近90日';
    case 'thisTerm': return '今学期';
    case 'thisYear': return '今年度';
    case 'custom': {
      const s = range.start || '?';
      const e = range.end || '?';
      return `${s} 〜 ${e}`;
    }
    default: return '全期間';
  }
}

// ============================================================
// CSV Export Helpers
// ============================================================

function escapeCSV(value: string | number | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const bom = '\uFEFF'; // UTF-8 BOM for Excel compatibility
  const headerLine = headers.map(escapeCSV).join(',');
  const dataLines = rows.map((row) => row.map(escapeCSV).join(',')).join('\n');
  return bom + headerLine + '\n' + dataLines;
}

export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// CSV Export Functions
// ============================================================

export function exportClassTrendCSV(trends: ClassTrend[]) {
  const headers = [
    'クラス名', '学年', '回数', '日付', 'シナリオ',
    '正解率', '議論時間(秒)', '探索時間(秒)', '証拠数',
    '理由記入率', '授業時間(秒)',
  ];

  const rows: (string | number | null)[][] = [];
  for (const t of trends) {
    for (const p of t.points) {
      rows.push([
        t.className,
        t.gradeLabel,
        p.sessionNumber,
        p.date,
        p.scenarioTitle,
        p.accuracyRate != null ? Math.round(p.accuracyRate * 100) : null,
        p.discussTime,
        p.exploreTime,
        p.evidenceCount,
        p.voteReasonRate != null ? Math.round(p.voteReasonRate * 100) : null,
        p.duration,
      ]);
    }
  }

  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(csv, `クラス成長トレンド_${date}.csv`);
}

export function exportScenarioTrendCSV(trends: ScenarioTrend[], logs: SessionLogRow[]) {
  const headers = [
    'シナリオ', '回数', '日付', 'クラス名',
    '正解率', '議論時間(秒)', '授業時間(秒)',
  ];

  // Build class_id → class_name map from logs
  const classMap = new Map<string, string>();
  logs.forEach((l) => {
    if (l.class_id) classMap.set(l.class_id, '');
  });

  const rows: (string | number | null)[][] = [];
  for (const t of trends) {
    for (const p of t.points) {
      // Find matching log for class name
      const matchLog = logs.find(
        (l) =>
          l.scenario_slug === t.slug &&
          (l.start_time || l.created_at) === p.date,
      );
      const className = matchLog?.class_id ? (matchLog.class_id) : '';

      rows.push([
        t.title,
        p.sessionNumber,
        p.date,
        className,
        p.accuracyRate != null ? Math.round(p.accuracyRate * 100) : null,
        p.discussTime,
        p.duration,
      ]);
    }
  }

  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(csv, `シナリオ傾向_${date}.csv`);
}

export function exportStudentCSV(metrics: StudentAggregateMetrics[]) {
  const headers = [
    '生徒名', 'クラス名', '参加回数', '正解数',
    '正解率', '直近参加日',
  ];

  const sorted = [...metrics].sort((a, b) => b.participationCount - a.participationCount);

  const rows: (string | number | null)[][] = sorted.map((m) => [
    m.studentName,
    m.className,
    m.participationCount,
    m.correctCount,
    m.accuracyRate != null ? Math.round(m.accuracyRate * 100) : null,
    m.lastSessionDate,
  ]);

  const csv = toCSV(headers, rows);
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(csv, `生徒参加状況_${date}.csv`);
}
