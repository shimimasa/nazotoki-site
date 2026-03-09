/**
 * ZIP Export — Bundle multiple CSVs into a single ZIP download.
 *
 * Uses fflate for lightweight browser-side ZIP generation.
 * Reuses existing build*Rows functions and toCSV helper.
 */

import { zipSync, strToU8 } from 'fflate';
import { monthLabel, buildMonthlyReport, getAvailableMonths } from './monthly-report';
import { termLabel, buildTermReport, getAvailableTerms, type TermNumber } from './term-report';
import { annualLabel, buildAnnualReport, getAvailableSchoolYears } from './annual-report';
import type { MonthlyReportData } from './monthly-report';
import { compareMonthlyReports, getPreviousMonth, type MonthlyComparison } from './monthly-comparison';
import type { TermReportData } from './term-report';
import { compareTermReports, getPreviousTerm, type TermComparison } from './term-comparison';
import type { AnnualReportData } from './annual-report';
import { compareAnnualReports, getPreviousSchoolYear, type AnnualComparison } from './annual-comparison';
import type { SchoolReportData } from './school-report';
import type { SessionLogRow } from './supabase';
import type { StudentLogSummary } from './supabase';

import {
  toCSV,
  // Monthly single
  buildMonthlySummaryRows,
  buildMonthlyClassRows,
  buildMonthlyScenarioRows,
  buildMonthlyStudentRows,
  // Monthly comparison
  buildMonthlyComparisonSummaryRows,
  buildMonthlyComparisonClassRows,
  buildMonthlyComparisonScenarioRows,
  // Term single
  buildTermSummaryRows,
  buildTermClassRows,
  buildTermScenarioRows,
  buildTermStudentRows,
  // Term comparison
  buildTermComparisonSummaryRows,
  buildTermComparisonClassRows,
  buildTermComparisonScenarioRows,
  // Annual single
  buildAnnualSummaryRows,
  buildAnnualClassRows,
  buildAnnualScenarioRows,
  buildAnnualStudentRows,
  // Annual comparison
  buildAnnualComparisonSummaryRows,
  buildAnnualComparisonClassRows,
  buildAnnualComparisonScenarioRows,
  // HTML report builders
  buildMonthlyReportHtml,
  buildTermReportHtml,
  buildAnnualReportHtml,
  // School report
  buildSchoolSummaryRows,
  buildSchoolClassRows,
  buildSchoolScenarioRows,
  buildSchoolReportHtml,
} from './analytics-export';

// ============================================================
// Types
// ============================================================

export interface ZipEntry {
  filename: string;
  /** File content (CSV or HTML) */
  content: string;
}

/** Export selection state — controls what goes into the ZIP */
export interface ExportSelection {
  includeMonthly: boolean;
  includeTerm: boolean;
  includeAnnual: boolean;
  includeCSV: boolean;
  includeHTML: boolean;
  includeComparison: boolean;
}

export const DEFAULT_EXPORT_SELECTION: ExportSelection = {
  includeMonthly: true,
  includeTerm: true,
  includeAnnual: true,
  includeCSV: true,
  includeHTML: true,
  includeComparison: true,
};

/** Returns true if at least one report unit and one file type are selected */
export function isValidExportSelection(sel: ExportSelection): boolean {
  const hasUnit = sel.includeMonthly || sel.includeTerm || sel.includeAnnual;
  const hasFormat = sel.includeCSV || sel.includeHTML;
  return hasUnit && hasFormat;
}

/** Filter ZipEntry[] based on file type and comparison selection */
function filterEntries(entries: ZipEntry[], sel: ExportSelection): ZipEntry[] {
  return entries.filter((e) => {
    const isHTML = e.filename.endsWith('.html');
    const isCSV = e.filename.endsWith('.csv');
    // Check file type
    if (isCSV && !sel.includeCSV) return false;
    if (isHTML && !sel.includeHTML) return false;
    // Check comparison (comparison CSVs have 比較 in filename)
    if (!sel.includeComparison && isCSV && e.filename.includes('比較')) return false;
    return true;
  });
}

// ============================================================
// ZIP download helper
// ============================================================

export function downloadZip(entries: ZipEntry[], zipFilename: string) {
  const files: Record<string, Uint8Array> = {};
  for (const entry of entries) {
    files[entry.filename] = strToU8(entry.content);
  }
  const zipped = zipSync(files);
  const blob = new Blob([zipped], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================
// Monthly ZIP
// ============================================================

// Headers (matching existing export functions)
const MONTHLY_SUMMARY_HEADERS = [
  '対象月', '年', '月', '授業回数', 'クラス数', '参加生徒数',
  '平均正解率(%)', '平均授業時間(秒)', '平均議論時間(秒)',
  '出力日時',
];

const MONTHLY_CLASS_HEADERS = [
  '対象月', 'クラス名', '学年', '授業回数',
  '平均正解率(%)', '平均議論時間(秒)', '平均探索時間(秒)', '平均授業時間(秒)',
  '最終授業日', '最多シナリオ',
];

const MONTHLY_SCENARIO_HEADERS = [
  '対象月', 'シナリオ名', 'スラッグ', '実施回数',
  '平均正解率(%)', '平均授業時間(秒)', '平均議論時間(秒)',
  '平均証拠発見数', '投票理由記入率(%)',
];

const MONTHLY_STUDENT_HEADERS = [
  '対象月', 'クラス名', '生徒名', '参加回数', '正解数',
  '正解率(%)', '直近参加日',
];

const MONTHLY_CMP_SUMMARY_HEADERS = [
  '今月', '前月', '指標名',
  '今月値', '前月値', '差分値', '差分表示',
  '方向', '解釈',
];

const MONTHLY_CMP_CLASS_HEADERS = [
  'クラス名', '学年', '今月', '前月',
  '今月回数', '前月回数', '回数差分',
  '今月正解率(%)', '前月正解率(%)', '正解率差分(pt)',
  '今月議論(秒)', '前月議論(秒)', '議論差分(秒)',
  '今月探索(秒)', '前月探索(秒)', '探索差分(秒)',
];

const MONTHLY_CMP_SCENARIO_HEADERS = [
  'シナリオ名', 'スラッグ', '今月', '前月',
  '今月回数', '前月回数', '回数差分',
  '今月正解率(%)', '前月正解率(%)', '正解率差分(pt)',
  '今月授業時間(秒)', '前月授業時間(秒)', '授業時間差分(秒)',
];

export function buildMonthlyZipEntries(
  report: MonthlyReportData,
  comparison: MonthlyComparison | null,
): ZipEntry[] {
  const label = monthLabel(report.year, report.month);
  const entries: ZipEntry[] = [
    { filename: `月次サマリー_${label}.csv`, content: toCSV(MONTHLY_SUMMARY_HEADERS, buildMonthlySummaryRows(report)) },
    { filename: `クラス別月次分析_${label}.csv`, content: toCSV(MONTHLY_CLASS_HEADERS, buildMonthlyClassRows(report)) },
    { filename: `シナリオ別月次分析_${label}.csv`, content: toCSV(MONTHLY_SCENARIO_HEADERS, buildMonthlyScenarioRows(report)) },
    { filename: `生徒参加月次_${label}.csv`, content: toCSV(MONTHLY_STUDENT_HEADERS, buildMonthlyStudentRows(report)) },
    { filename: `月次レポート_${label}.html`, content: buildMonthlyReportHtml(report, comparison) },
  ];

  if (comparison) {
    const cmpLabel = `${comparison.currentLabel}vs${comparison.previousLabel}`;
    entries.push(
      { filename: `月次比較サマリー_${cmpLabel}.csv`, content: toCSV(MONTHLY_CMP_SUMMARY_HEADERS, buildMonthlyComparisonSummaryRows(comparison)) },
      { filename: `クラス別月次比較_${cmpLabel}.csv`, content: toCSV(MONTHLY_CMP_CLASS_HEADERS, buildMonthlyComparisonClassRows(comparison)) },
      { filename: `シナリオ別月次比較_${cmpLabel}.csv`, content: toCSV(MONTHLY_CMP_SCENARIO_HEADERS, buildMonthlyComparisonScenarioRows(comparison)) },
    );
  }

  return entries;
}

export function exportMonthlyZip(
  report: MonthlyReportData,
  comparison: MonthlyComparison | null,
) {
  const entries = buildMonthlyZipEntries(report, comparison);
  const label = monthLabel(report.year, report.month);
  const date = new Date().toISOString().slice(0, 10);
  downloadZip(entries, `月次レポート一式_${label}_${date}.zip`);
}

// ============================================================
// Term ZIP
// ============================================================

const TERM_SUMMARY_HEADERS = [
  '年度', '学期', '授業回数', 'クラス数', '参加生徒数',
  '平均正解率(%)', '平均授業時間(秒)', '平均議論時間(秒)',
  '対象月', '出力日時',
];

const TERM_CLASS_HEADERS = [
  '年度', '学期', 'クラス名', '学年', '授業回数',
  '平均正解率(%)', '平均議論時間(秒)', '平均探索時間(秒)', '平均授業時間(秒)',
  '最終授業日', '最多シナリオ',
];

const TERM_SCENARIO_HEADERS = [
  '年度', '学期', 'シナリオ名', 'スラッグ', '実施回数',
  '平均正解率(%)', '平均授業時間(秒)', '平均議論時間(秒)',
  '平均証拠発見数', '投票理由記入率(%)',
];

const TERM_STUDENT_HEADERS = [
  '年度', '学期', 'クラス名', '生徒名', '参加回数', '正解数',
  '正解率(%)', '直近参加日',
];

const TERM_CMP_SUMMARY_HEADERS = [
  '今学期', '前学期', '指標名',
  '今学期値', '前学期値', '差分値', '差分表示',
  '方向', '解釈',
];

const TERM_CMP_CLASS_HEADERS = [
  'クラス名', '学年', '今学期', '前学期',
  '今学期回数', '前学期回数', '回数差分',
  '今学期正解率(%)', '前学期正解率(%)', '正解率差分(pt)',
  '今学期議論(秒)', '前学期議論(秒)', '議論差分(秒)',
  '今学期探索(秒)', '前学期探索(秒)', '探索差分(秒)',
];

const TERM_CMP_SCENARIO_HEADERS = [
  'シナリオ名', 'スラッグ', '今学期', '前学期',
  '今学期回数', '前学期回数', '回数差分',
  '今学期正解率(%)', '前学期正解率(%)', '正解率差分(pt)',
  '今学期授業時間(秒)', '前学期授業時間(秒)', '授業時間差分(秒)',
];

export function buildTermZipEntries(
  report: TermReportData,
  comparison: TermComparison | null,
): ZipEntry[] {
  const label = termLabel(report.schoolYear, report.term);
  const entries: ZipEntry[] = [
    { filename: `学期サマリー_${label}.csv`, content: toCSV(TERM_SUMMARY_HEADERS, buildTermSummaryRows(report)) },
    { filename: `クラス別学期分析_${label}.csv`, content: toCSV(TERM_CLASS_HEADERS, buildTermClassRows(report)) },
    { filename: `シナリオ別学期分析_${label}.csv`, content: toCSV(TERM_SCENARIO_HEADERS, buildTermScenarioRows(report)) },
    { filename: `生徒参加学期_${label}.csv`, content: toCSV(TERM_STUDENT_HEADERS, buildTermStudentRows(report)) },
    { filename: `学期レポート_${label}.html`, content: buildTermReportHtml(report, comparison) },
  ];

  if (comparison) {
    const cmpLabel = `${comparison.currentLabel}vs${comparison.previousLabel}`;
    entries.push(
      { filename: `学期比較サマリー_${cmpLabel}.csv`, content: toCSV(TERM_CMP_SUMMARY_HEADERS, buildTermComparisonSummaryRows(comparison)) },
      { filename: `クラス別学期比較_${cmpLabel}.csv`, content: toCSV(TERM_CMP_CLASS_HEADERS, buildTermComparisonClassRows(comparison)) },
      { filename: `シナリオ別学期比較_${cmpLabel}.csv`, content: toCSV(TERM_CMP_SCENARIO_HEADERS, buildTermComparisonScenarioRows(comparison)) },
    );
  }

  return entries;
}

export function exportTermZip(
  report: TermReportData,
  comparison: TermComparison | null,
) {
  const entries = buildTermZipEntries(report, comparison);
  const label = termLabel(report.schoolYear, report.term);
  const date = new Date().toISOString().slice(0, 10);
  downloadZip(entries, `学期レポート一式_${label}_${date}.zip`);
}

// ============================================================
// Annual ZIP
// ============================================================

const ANNUAL_SUMMARY_HEADERS = [
  '年度', '授業回数', 'クラス数', '参加生徒数',
  '平均正解率(%)', '平均授業時間(秒)', '平均議論時間(秒)', '平均探索時間(秒)',
  '投票理由記入率(%)', '平均証拠発見数',
  '1学期回数', '2学期回数', '3学期回数',
  '出力日時',
];

const ANNUAL_CLASS_HEADERS = [
  '年度', 'クラス名', '学年', '授業回数',
  '平均正解率(%)', '平均議論時間(秒)', '平均探索時間(秒)', '平均授業時間(秒)',
  '最終授業日', '最多シナリオ',
];

const ANNUAL_SCENARIO_HEADERS = [
  '年度', 'シナリオ名', 'スラッグ', '実施回数',
  '平均正解率(%)', '平均授業時間(秒)', '平均議論時間(秒)',
  '平均証拠発見数', '投票理由記入率(%)',
];

const ANNUAL_STUDENT_HEADERS = [
  '年度', 'クラス名', '生徒名', '参加回数', '正解数',
  '正解率(%)', '直近参加日',
];

const ANNUAL_CMP_SUMMARY_HEADERS = [
  '今年度', '前年度', '指標名',
  '今年度値', '前年度値', '差分値', '差分表示',
  '方向', '解釈',
];

const ANNUAL_CMP_CLASS_HEADERS = [
  'クラス名', '学年', '今年度', '前年度',
  '今年度回数', '前年度回数', '回数差分',
  '今年度正解率(%)', '前年度正解率(%)', '正解率差分(pt)',
  '今年度議論(秒)', '前年度議論(秒)', '議論差分(秒)',
  '今年度探索(秒)', '前年度探索(秒)', '探索差分(秒)',
];

const ANNUAL_CMP_SCENARIO_HEADERS = [
  'シナリオ名', 'スラッグ', '今年度', '前年度',
  '今年度回数', '前年度回数', '回数差分',
  '今年度正解率(%)', '前年度正解率(%)', '正解率差分(pt)',
  '今年度授業時間(秒)', '前年度授業時間(秒)', '授業時間差分(秒)',
];

export function buildAnnualZipEntries(
  report: AnnualReportData,
  comparison: AnnualComparison | null,
): ZipEntry[] {
  const label = annualLabel(report.schoolYear);
  const entries: ZipEntry[] = [
    { filename: `年度サマリー_${label}.csv`, content: toCSV(ANNUAL_SUMMARY_HEADERS, buildAnnualSummaryRows(report)) },
    { filename: `クラス別年度分析_${label}.csv`, content: toCSV(ANNUAL_CLASS_HEADERS, buildAnnualClassRows(report)) },
    { filename: `シナリオ別年度分析_${label}.csv`, content: toCSV(ANNUAL_SCENARIO_HEADERS, buildAnnualScenarioRows(report)) },
    { filename: `生徒参加年度_${label}.csv`, content: toCSV(ANNUAL_STUDENT_HEADERS, buildAnnualStudentRows(report)) },
    { filename: `年度レポート_${label}.html`, content: buildAnnualReportHtml(report, comparison) },
  ];

  if (comparison) {
    const cmpLabel = `${comparison.currentLabel}vs${comparison.previousLabel}`;
    entries.push(
      { filename: `年度比較サマリー_${cmpLabel}.csv`, content: toCSV(ANNUAL_CMP_SUMMARY_HEADERS, buildAnnualComparisonSummaryRows(comparison)) },
      { filename: `クラス別年度比較_${cmpLabel}.csv`, content: toCSV(ANNUAL_CMP_CLASS_HEADERS, buildAnnualComparisonClassRows(comparison)) },
      { filename: `シナリオ別年度比較_${cmpLabel}.csv`, content: toCSV(ANNUAL_CMP_SCENARIO_HEADERS, buildAnnualComparisonScenarioRows(comparison)) },
    );
  }

  return entries;
}

export function exportAnnualZip(
  report: AnnualReportData,
  comparison: AnnualComparison | null,
) {
  const entries = buildAnnualZipEntries(report, comparison);
  const label = annualLabel(report.schoolYear);
  const date = new Date().toISOString().slice(0, 10);
  downloadZip(entries, `年度レポート一式_${label}_${date}.zip`);
}

// ============================================================
// All Reports ZIP — Bundle all monthly/term/annual CSVs
// ============================================================

export interface AllReportsZipParams {
  logs: SessionLogRow[];
  classes: { id: string; class_name: string; grade_label: string | null }[];
  students: { id: string; student_name: string; className: string }[];
  studentLogs: StudentLogSummary[];
}

/** Prefix each entry filename with a folder path */
function prefixEntries(entries: ZipEntry[], prefix: string): ZipEntry[] {
  return entries.map((e) => ({ ...e, filename: `${prefix}${e.filename}` }));
}

/** Build folder key for monthly: "monthly/2026-03/" */
function monthlyFolderKey(year: number, month: number): string {
  return `monthly/${year}-${String(month).padStart(2, '0')}/`;
}

/** Build folder key for term: "term/2025_3term/" */
function termFolderKey(schoolYear: number, term: TermNumber): string {
  return `term/${schoolYear}_${term}term/`;
}

/** Build folder key for annual: "annual/2025/" */
function annualFolderKey(schoolYear: number): string {
  return `annual/${schoolYear}/`;
}

export function buildAllReportsZipEntries(
  params: AllReportsZipParams,
  selection: ExportSelection = DEFAULT_EXPORT_SELECTION,
): ZipEntry[] {
  const { logs, classes, students, studentLogs } = params;
  const allEntries: ZipEntry[] = [];

  // --- Monthly ---
  if (selection.includeMonthly) {
    const availableMonths = getAvailableMonths(logs);
    const monthSet = new Set(availableMonths.map((m) => `${m.year}-${m.month}`));

    for (const { year, month } of availableMonths) {
      const report = buildMonthlyReport(logs, classes, students, studentLogs, year, month);

      // Comparison: check if previous month has data
      const prev = getPreviousMonth(year, month);
      const hasPrev = monthSet.has(`${prev.year}-${prev.month}`);
      let comparison: MonthlyComparison | null = null;
      if (hasPrev) {
        const prevReport = buildMonthlyReport(logs, classes, students, studentLogs, prev.year, prev.month);
        comparison = compareMonthlyReports(report, prevReport);
      }

      const entries = filterEntries(buildMonthlyZipEntries(report, comparison), selection);
      allEntries.push(...prefixEntries(entries, monthlyFolderKey(year, month)));
    }
  }

  // --- Term ---
  if (selection.includeTerm) {
    const availableTerms = getAvailableTerms(logs);
    const termSet = new Set(availableTerms.map((t) => `${t.schoolYear}-${t.term}`));

    for (const { schoolYear, term } of availableTerms) {
      const report = buildTermReport(logs, classes, students, studentLogs, schoolYear, term as TermNumber);

      const prev = getPreviousTerm(schoolYear, term as TermNumber);
      const hasPrev = termSet.has(`${prev.schoolYear}-${prev.term}`);
      let comparison: TermComparison | null = null;
      if (hasPrev) {
        const prevReport = buildTermReport(logs, classes, students, studentLogs, prev.schoolYear, prev.term as TermNumber);
        comparison = compareTermReports(report, prevReport);
      }

      const entries = filterEntries(buildTermZipEntries(report, comparison), selection);
      allEntries.push(...prefixEntries(entries, termFolderKey(schoolYear, term as TermNumber)));
    }
  }

  // --- Annual ---
  if (selection.includeAnnual) {
    const availableYears = getAvailableSchoolYears(logs);

    for (const schoolYear of availableYears) {
      const report = buildAnnualReport(logs, classes, students, studentLogs, schoolYear);

      const prevYear = getPreviousSchoolYear(logs, schoolYear);
      let comparison: AnnualComparison | null = null;
      if (prevYear != null) {
        const prevReport = buildAnnualReport(logs, classes, students, studentLogs, prevYear);
        comparison = compareAnnualReports(report, prevReport);
      }

      const entries = filterEntries(buildAnnualZipEntries(report, comparison), selection);
      allEntries.push(...prefixEntries(entries, annualFolderKey(schoolYear)));
    }
  }

  return allEntries;
}

export function exportAllReportsZip(params: AllReportsZipParams) {
  const entries = buildAllReportsZipEntries(params);
  if (entries.length === 0) return;
  const date = new Date().toISOString().slice(0, 10);
  downloadZip(entries, `全レポート一式_${date}.zip`);
}

/** Export with custom selection — only include selected units/formats */
export function exportSelectedReportsZip(
  params: AllReportsZipParams,
  selection: ExportSelection,
) {
  if (!isValidExportSelection(selection)) return;
  const entries = buildAllReportsZipEntries(params, selection);
  if (entries.length === 0) return;
  const date = new Date().toISOString().slice(0, 10);

  // Use different filename when selection is customized
  const isFullSelection =
    selection.includeMonthly && selection.includeTerm && selection.includeAnnual &&
    selection.includeCSV && selection.includeHTML && selection.includeComparison;
  const zipName = isFullSelection
    ? `全レポート一式_${date}.zip`
    : `選択レポート一式_${date}.zip`;
  downloadZip(entries, zipName);
}

// ============================================================
// School Report ZIP
// ============================================================

const SCHOOL_SUMMARY_HEADERS = [
  'スコープ', '総授業回数', 'クラス数', '参加生徒数',
  '平均正解率(%)', '平均授業時間(秒)', '平均議論時間(秒)', '平均探索時間(秒)',
  '平均証拠発見数', '投票理由記入率(%)', '利用シナリオ数', '出力日時',
];

const SCHOOL_CLASS_HEADERS = [
  'クラス名', '学年', '授業回数',
  '平均正解率(%)', '平均議論時間(秒)', '平均探索時間(秒)', '平均授業時間(秒)',
  '最終授業日', '最多シナリオ',
];

const SCHOOL_SCENARIO_HEADERS = [
  'シナリオ名', 'スラッグ', '実施回数', '実施クラス数',
  '平均正解率(%)', '平均授業時間(秒)', '平均議論時間(秒)',
  '平均証拠発見数', '投票理由記入率(%)',
];

export function buildSchoolZipEntries(report: SchoolReportData, rangeLabel?: string): ZipEntry[] {
  const date = new Date().toISOString().slice(0, 10);
  const suffix = rangeLabel && rangeLabel !== '全期間' ? `_${rangeLabel}` : '';
  const entries: ZipEntry[] = [
    { filename: `学校サマリー${suffix}_${date}.csv`, content: toCSV(SCHOOL_SUMMARY_HEADERS, buildSchoolSummaryRows(report)) },
  ];

  if (report.classBreakdown.length > 0) {
    entries.push({
      filename: `クラス別学校分析${suffix}_${date}.csv`,
      content: toCSV(SCHOOL_CLASS_HEADERS, buildSchoolClassRows(report)),
    });
  }

  if (report.scenarioBreakdown.length > 0) {
    entries.push({
      filename: `シナリオ別学校分析${suffix}_${date}.csv`,
      content: toCSV(SCHOOL_SCENARIO_HEADERS, buildSchoolScenarioRows(report)),
    });
  }

  entries.push({
    filename: `学校レポート${suffix}_${date}.html`,
    content: buildSchoolReportHtml(report, rangeLabel),
  });

  return entries;
}

export function exportSchoolZip(report: SchoolReportData, rangeLabel?: string, comparison?: SchoolComparison | null) {
  const entries = buildSchoolZipEntries(report, rangeLabel);
  if (comparison) {
    entries.push(...buildSchoolComparisonZipEntries(report, comparison));
  }
  if (entries.length === 0) return;
  const date = new Date().toISOString().slice(0, 10);
  const suffix = rangeLabel && rangeLabel !== '全期間' ? `_${rangeLabel}` : '';
  downloadZip(entries, `学校レポート一式${suffix}_${date}.zip`);
}

// ============================================================
// School Comparison ZIP
// ============================================================

import type { SchoolComparison } from './school-comparison';
import {
  buildSchoolComparisonSummaryRows,
  buildSchoolComparisonClassRows,
  buildSchoolComparisonScenarioRows,
  buildSchoolComparisonHtml,
} from './analytics-export';

const SCHOOL_CMP_SUMMARY_HEADERS = [
  '現在期間', '比較期間', '指標名',
  '現在値', '比較値', '差分値', '差分表示',
  '方向',
];

const SCHOOL_CMP_CLASS_HEADERS = [
  'クラス名', '学年', '現在期間', '比較期間',
  '現在回数', '比較回数', '回数差分',
  '現在正解率(%)', '比較正解率(%)', '正解率差分(pt)',
  '現在議論(秒)', '比較議論(秒)', '議論差分(秒)',
  '現在探索(秒)', '比較探索(秒)', '探索差分(秒)',
];

const SCHOOL_CMP_SCENARIO_HEADERS = [
  'シナリオ名', 'スラッグ', '現在期間', '比較期間',
  '現在回数', '比較回数', '回数差分',
  '現在正解率(%)', '比較正解率(%)', '正解率差分(pt)',
  '現在授業時間(秒)', '比較授業時間(秒)', '授業時間差分(秒)',
];

function buildSchoolComparisonZipEntries(report: SchoolReportData, cmp: SchoolComparison): ZipEntry[] {
  const date = new Date().toISOString().slice(0, 10);
  const label = `${cmp.currentLabel}_vs_${cmp.previousLabel}`;
  const entries: ZipEntry[] = [
    { filename: `学校比較サマリー_${label}_${date}.csv`, content: toCSV(SCHOOL_CMP_SUMMARY_HEADERS, buildSchoolComparisonSummaryRows(cmp)) },
  ];

  if (cmp.classDeltas.length > 0) {
    entries.push({
      filename: `クラス別学校比較_${label}_${date}.csv`,
      content: toCSV(SCHOOL_CMP_CLASS_HEADERS, buildSchoolComparisonClassRows(cmp)),
    });
  }

  if (cmp.scenarioDeltas.length > 0) {
    entries.push({
      filename: `シナリオ別学校比較_${label}_${date}.csv`,
      content: toCSV(SCHOOL_CMP_SCENARIO_HEADERS, buildSchoolComparisonScenarioRows(cmp)),
    });
  }

  entries.push({
    filename: `学校比較レポート_${label}_${date}.html`,
    content: buildSchoolComparisonHtml(report, cmp),
  });

  return entries;
}

export function exportSchoolComparisonZip(report: SchoolReportData, cmp: SchoolComparison) {
  const entries = buildSchoolComparisonZipEntries(report, cmp);
  if (entries.length === 0) return;
  const date = new Date().toISOString().slice(0, 10);
  const label = `${cmp.currentLabel}_vs_${cmp.previousLabel}`;
  downloadZip(entries, `学校比較レポート一式_${label}_${date}.zip`);
}
