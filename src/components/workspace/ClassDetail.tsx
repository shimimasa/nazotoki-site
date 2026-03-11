import { useState, useEffect } from 'preact/hooks';
import {
  fetchSessionLogsByClass,
  fetchStudents,
  updateClass,
  fetchSoloSessionsForStudents,
  fetchRubricEvaluationsByStudents,
  type ClassWithStats,
  type SessionLogRow,
  type StudentRow,
  type SoloSessionRow,
  type RubricEvaluationRow,
} from '../../lib/supabase';
import SessionHistoryList from './SessionHistoryList';
import SessionLogDetail from './SessionLogDetail';
import StudentList from './StudentList';
import AssignmentManager from './AssignmentManager';
import SoloProgressView from './SoloProgressView';
import ParentReport from './ParentReport';
import PortfolioGenerator from './PortfolioGenerator';

interface ScenarioItem {
  slug: string;
  title: string;
  series: string;
  seriesName: string;
  difficulty: string;
}

interface Props {
  classId: string;
  classData: ClassWithStats;
  teacherId: string;
  scenarios?: ScenarioItem[];
  onBack: () => void;
}

type DetailTab = 'sessions' | 'students' | 'assignments' | 'solo-progress';

export default function ClassDetail({ classId, classData, teacherId, scenarios = [], onBack }: Props) {
  const [tab, setTab] = useState<DetailTab>('sessions');
  const [sessions, setSessions] = useState<SessionLogRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(classData.class_name);
  const [editGrade, setEditGrade] = useState(classData.grade_label || '');
  const [editDesc, setEditDesc] = useState(classData.description || '');
  const [showParentReport, setShowParentReport] = useState<string | null>(null);
  const [showPortfolio, setShowPortfolio] = useState(false);
  const [gradeExporting, setGradeExporting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchSessionLogsByClass(classId),
      fetchStudents(classId),
    ]).then(([s, st]) => {
      setSessions(s);
      setStudents(st);
      setLoading(false);
    });
  }, [classId]);

  const handleSaveEdit = async () => {
    await updateClass(classId, {
      class_name: editName.trim(),
      grade_label: editGrade || undefined,
      description: editDesc.trim() || undefined,
    });
    setEditing(false);
  };

  // Phase 102: Grade Export
  const handleGradeExport = async () => {
    if (students.length === 0) return;
    setGradeExporting(true);
    try {
      const studentIds = students.map((s) => s.id);
      const [soloData, rubricData] = await Promise.all([
        fetchSoloSessionsForStudents(studentIds),
        fetchRubricEvaluationsByStudents(studentIds),
      ]);
      const rows: string[] = [];
      rows.push('\uFEFF生徒名,セッション参加数,ソロクリア数,思考力(平均),表現力(平均),協働力(平均),総合評価,累計RP');
      for (const st of students) {
        const solo = soloData.filter((s) => s.student_id === st.id);
        const rubrics = rubricData.filter((r) => r.student_id === st.id);
        const soloClear = solo.length;
        const totalRp = solo.reduce((sum, s) => sum + (s.rp_earned || 0), 0);
        const sessionCount = rubrics.length;
        let thinkAvg = '', exprAvg = '', collabAvg = '', overall = '';
        if (rubrics.length > 0) {
          const tAvg = rubrics.reduce((s, r) => s + r.thinking, 0) / rubrics.length;
          const eAvg = rubrics.reduce((s, r) => s + r.expression, 0) / rubrics.length;
          const cAvg = rubrics.reduce((s, r) => s + r.collaboration, 0) / rubrics.length;
          thinkAvg = tAvg.toFixed(1);
          exprAvg = eAvg.toFixed(1);
          collabAvg = cAvg.toFixed(1);
          const totalAvg = (tAvg + eAvg + cAvg) / 3;
          overall = totalAvg >= 3.5 ? 'A' : totalAvg >= 2.5 ? 'B' : totalAvg >= 1.5 ? 'C' : 'D';
        }
        const esc = (v: string) => {
          v = v.replace(/^[\s\uFEFF\xA0]+/, '');
          if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
          return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
        };
        rows.push([esc(st.student_name), sessionCount, soloClear, thinkAvg, exprAvg, collabAvg, overall, totalRp].join(','));
      }
      const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${classData.class_name}_成績データ.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGradeExporting(false);
    }
  };

  // Portfolio view (Phase 101)
  if (showPortfolio) {
    return (
      <PortfolioGenerator
        classId={classId}
        className={classData.class_name}
        schoolName=""
        teacherId={teacherId}
        onBack={() => setShowPortfolio(false)}
      />
    );
  }

  // Parent report view (Phase 96)
  if (showParentReport) {
    const student = students.find((s) => s.id === showParentReport);
    if (student) {
      return (
        <ParentReport
          student={student}
          className={classData.class_name}
          sessions={sessions}
          onBack={() => setShowParentReport(null)}
        />
      );
    }
  }

  if (selectedLogId) {
    const log = sessions.find((s) => s.id === selectedLogId);
    return (
      <SessionLogDetail
        logId={selectedLogId}
        cachedLog={log || null}
        onBack={() => setSelectedLogId(null)}
      />
    );
  }

  if (selectedStudentId) {
    const student = students.find((s) => s.id === selectedStudentId);
    if (student) {
      return (
        <StudentDetail
          student={student}
          sessions={sessions}
          onShowParentReport={(id) => { setSelectedStudentId(null); setShowParentReport(id); }}
          onBack={() => setSelectedStudentId(null)}
        />
      );
    }
  }

  return (
    <div class="space-y-4">
      {/* Header */}
      <div class="flex items-center gap-3">
        <button
          onClick={onBack}
          class="text-amber-600 font-bold hover:text-amber-700"
        >
          ← クラス一覧
        </button>
      </div>

      {/* Class info */}
      <div class="bg-white rounded-xl border border-gray-200 p-5">
        {editing ? (
          <div class="space-y-3">
            <input
              type="text"
              value={editName}
              onInput={(e) => setEditName((e.target as HTMLInputElement).value)}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg font-bold text-lg"
            />
            <select
              value={editGrade}
              onChange={(e) => setEditGrade((e.target as HTMLSelectElement).value)}
              class="px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">未設定</option>
              {['小1','小2','小3','小4','小5','小6','中1','中2','中3','混合'].map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <input
              type="text"
              value={editDesc}
              onInput={(e) => setEditDesc((e.target as HTMLInputElement).value)}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="説明"
            />
            <div class="flex gap-2">
              <button onClick={handleSaveEdit} class="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold">保存</button>
              <button onClick={() => setEditing(false)} class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold">キャンセル</button>
            </div>
          </div>
        ) : (
          <div class="flex items-start justify-between">
            <div>
              <h2 class="text-2xl font-black">{classData.class_name}</h2>
              <div class="flex flex-wrap gap-2 mt-2">
                {classData.grade_label && (
                  <span class="inline-block bg-blue-50 text-blue-700 text-xs font-bold px-2 py-0.5 rounded">
                    {classData.grade_label}
                  </span>
                )}
                {classData.description && (
                  <span class="text-sm text-gray-500">{classData.description}</span>
                )}
              </div>
              <div class="flex gap-4 mt-3 text-sm text-gray-600">
                <span>授業回数: <strong class="text-amber-600">{sessions.length}</strong></span>
                <span>生徒数: <strong class="text-blue-600">{students.length}</strong></span>
              </div>
              {/* Phase 101/102 action buttons */}
              <div class="flex flex-wrap gap-2 mt-3">
                <button
                  onClick={() => setShowPortfolio(true)}
                  disabled={students.length === 0}
                  class="px-3 py-1.5 text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-40"
                >
                  学期末ポートフォリオ
                </button>
                <button
                  onClick={handleGradeExport}
                  disabled={gradeExporting || students.length === 0}
                  class="px-3 py-1.5 text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors disabled:opacity-40"
                >
                  {gradeExporting ? 'エクスポート中...' : '成績エクスポート'}
                </button>
              </div>
            </div>
            <button
              onClick={() => setEditing(true)}
              class="px-3 py-1.5 text-xs text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors shrink-0"
            >
              編集
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div class="flex border-b border-gray-200">
        <button
          onClick={() => setTab('sessions')}
          class={`flex-1 py-3 text-sm font-bold transition-colors ${
            tab === 'sessions'
              ? 'text-amber-700 border-b-2 border-amber-500'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          授業履歴 ({sessions.length})
        </button>
        <button
          onClick={() => setTab('students')}
          class={`flex-1 py-3 text-sm font-bold transition-colors ${
            tab === 'students'
              ? 'text-amber-700 border-b-2 border-amber-500'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          生徒名簿 ({students.length})
        </button>
        <button
          onClick={() => setTab('assignments')}
          class={`flex-1 py-3 text-sm font-bold transition-colors ${
            tab === 'assignments'
              ? 'text-amber-700 border-b-2 border-amber-500'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          課題配信
        </button>
        <button
          onClick={() => setTab('solo-progress')}
          class={`flex-1 py-3 text-sm font-bold transition-colors ${
            tab === 'solo-progress'
              ? 'text-amber-700 border-b-2 border-amber-500'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          ソロ進捗
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div class="text-center py-8 text-gray-500">読み込み中...</div>
      ) : tab === 'sessions' ? (
        <SessionHistoryList logs={sessions} onSelect={setSelectedLogId} />
      ) : tab === 'assignments' ? (
        <AssignmentManager
          classId={classId}
          teacherId={teacherId}
          scenarios={scenarios}
        />
      ) : tab === 'solo-progress' ? (
        <SoloProgressView students={students} classId={classId} />
      ) : (
        <StudentList
          classId={classId}
          students={students}
          onStudentsChange={setStudents}
          onSelectStudent={setSelectedStudentId}
        />
      )}
    </div>
  );
}

// Inline StudentDetail component (shows student's participation history + solo history)
import {
  fetchStudentHistory,
  type StudentSessionLogRow,
} from '../../lib/supabase';

function StudentDetail({ student, sessions, onShowParentReport, onBack }: { student: StudentRow; sessions: SessionLogRow[]; onShowParentReport: (id: string) => void; onBack: () => void }) {
  const [history, setHistory] = useState<(StudentSessionLogRow & { session_log: SessionLogRow })[]>([]);
  const [soloSessions, setSoloSessions] = useState<SoloSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailTab, setDetailTab] = useState<'classroom' | 'solo'>('classroom');

  useEffect(() => {
    Promise.all([
      fetchStudentHistory(student.id),
      fetchSoloSessionsForStudents([student.id]),
    ]).then(([h, solo]) => {
      setHistory(h);
      setSoloSessions(solo);
      setLoading(false);
    });
  }, [student.id]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <div class="space-y-4">
      <button onClick={onBack} class="text-amber-600 font-bold hover:text-amber-700">
        ← 生徒名簿に戻る
      </button>

      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <div class="flex items-start justify-between">
          <div>
            <h2 class="text-2xl font-black">{student.student_name}</h2>
            <div class="flex gap-4 mt-2 text-sm text-gray-600">
              <span>授業参加: <strong class="text-blue-600">{history.length} 回</strong></span>
              <span>ソロプレイ: <strong class="text-amber-600">{soloSessions.length} 回</strong></span>
              {soloSessions.length > 0 && (
                <span>累計RP: <strong class="text-amber-600">{soloSessions.reduce((sum, s) => sum + (s.rp_earned || 0), 0)}</strong></span>
              )}
            </div>
          </div>
          <button
            onClick={() => onShowParentReport(student.id)}
            class="px-3 py-1.5 text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors shrink-0"
          >
            保護者レポート
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div class="flex border-b border-gray-200">
        <button
          onClick={() => setDetailTab('classroom')}
          class={`flex-1 py-3 text-sm font-bold transition-colors ${
            detailTab === 'classroom'
              ? 'text-blue-700 border-b-2 border-blue-500'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          授業履歴 ({history.length})
        </button>
        <button
          onClick={() => setDetailTab('solo')}
          class={`flex-1 py-3 text-sm font-bold transition-colors ${
            detailTab === 'solo'
              ? 'text-amber-700 border-b-2 border-amber-500'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          ソロ履歴 ({soloSessions.length})
        </button>
      </div>

      {loading ? (
        <div class="text-center py-8 text-gray-500">読み込み中...</div>
      ) : detailTab === 'classroom' ? (
        history.length === 0 ? (
          <div class="text-center py-8 text-gray-500">
            <p class="font-bold">まだ授業参加記録がありません</p>
          </div>
        ) : (
          <div class="space-y-3">
            {history.map((h) => {
              const title = h.session_log?.scenario_title || h.session_log?.scenario_slug || '不明';
              const date = h.session_log?.start_time || h.created_at;
              return (
                <div key={h.id} class="bg-white rounded-xl border border-gray-200 p-4">
                  <div class="flex items-start justify-between">
                    <div>
                      <div class="font-bold">{title}</div>
                      <div class="text-xs text-gray-500 mt-1">{formatDate(date)}</div>
                    </div>
                    <div class="text-right">
                      {h.is_correct != null && (
                        <span class={`text-sm font-black ${h.is_correct ? 'text-green-600' : 'text-amber-600'}`}>
                          {h.is_correct ? '○ 正解' : '△ 不正解'}
                        </span>
                      )}
                    </div>
                  </div>
                  {h.voted_for && (
                    <div class="mt-2 text-sm text-gray-600">
                      投票先: <strong>{h.voted_for}</strong>
                    </div>
                  )}
                  {h.vote_reason && (
                    <div class="mt-1 text-xs text-gray-500">
                      理由: 「{h.vote_reason}」
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        soloSessions.length === 0 ? (
          <div class="text-center py-8 text-gray-500">
            <p class="font-bold">まだソロモードのプレイ記録がありません</p>
          </div>
        ) : (
          <div class="space-y-3">
            {soloSessions.map((s) => (
              <div key={s.id} class="bg-white rounded-xl border border-gray-200 p-4">
                <div class="flex items-start justify-between">
                  <div>
                    <p class="font-bold text-gray-900">{s.scenario_slug}</p>
                    <div class="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      {s.completed_at && <span>{formatDate(s.completed_at)}</span>}
                      {s.duration_seconds != null && (
                        <span>{Math.floor(s.duration_seconds / 60)}分{s.duration_seconds % 60}秒</span>
                      )}
                      {s.vote && <span>投票: {s.vote}</span>}
                    </div>
                    {s.vote_reason && (
                      <p class="text-xs text-gray-500 mt-1">理由: 「{s.vote_reason}」</p>
                    )}
                  </div>
                  <span class="text-sm font-black text-amber-600 shrink-0">{s.rp_earned} RP</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
