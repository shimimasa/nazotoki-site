import { useState, useEffect } from 'preact/hooks';
import {
  fetchSessionLogsByClass,
  fetchStudents,
  updateClass,
  type ClassWithStats,
  type SessionLogRow,
  type StudentRow,
} from '../../lib/supabase';
import SessionHistoryList from './SessionHistoryList';
import SessionLogDetail from './SessionLogDetail';
import StudentList from './StudentList';

interface Props {
  classId: string;
  classData: ClassWithStats;
  onBack: () => void;
}

type DetailTab = 'sessions' | 'students';

export default function ClassDetail({ classId, classData, onBack }: Props) {
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
            </div>
            <button
              onClick={() => setEditing(true)}
              class="px-3 py-1.5 text-xs text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
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
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          授業履歴 ({sessions.length})
        </button>
        <button
          onClick={() => setTab('students')}
          class={`flex-1 py-3 text-sm font-bold transition-colors ${
            tab === 'students'
              ? 'text-amber-700 border-b-2 border-amber-500'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          生徒名簿 ({students.length})
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div class="text-center py-8 text-gray-400">読み込み中...</div>
      ) : tab === 'sessions' ? (
        <SessionHistoryList logs={sessions} onSelect={setSelectedLogId} />
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

// Inline StudentDetail component (shows student's participation history)
import { fetchStudentHistory, type StudentSessionLogRow } from '../../lib/supabase';

function StudentDetail({ student, onBack }: { student: StudentRow; onBack: () => void }) {
  const [history, setHistory] = useState<(StudentSessionLogRow & { session_log: SessionLogRow })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStudentHistory(student.id).then((h) => {
      setHistory(h);
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
        <h2 class="text-2xl font-black">{student.student_name}</h2>
        <p class="text-sm text-gray-500 mt-1">参加履歴: {history.length} 回</p>
      </div>

      {loading ? (
        <div class="text-center py-8 text-gray-400">読み込み中...</div>
      ) : history.length === 0 ? (
        <div class="text-center py-8 text-gray-400">
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
                  <div class="mt-1 text-xs text-gray-400">
                    理由: 「{h.vote_reason}」
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
