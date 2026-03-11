import { useState, useEffect } from 'preact/hooks';
import {
  fetchRubricEvaluations,
  upsertRubricEvaluations,
  fetchStudentSessionLogs,
  fetchStudents,
  type RubricEvaluationRow,
  type RubricEvaluationUpsert,
  type StudentRow,
} from '../../lib/supabase';

interface Props {
  sessionLogId: string;
  teacherId: string;
  scenarioSlug: string;
  classId: string | null;
}

const GRADE_OPTIONS = [
  { value: 4, label: 'A', desc: '十分満足' },
  { value: 3, label: 'B', desc: '概ね満足' },
  { value: 2, label: 'C', desc: '努力を要する' },
  { value: 1, label: 'D', desc: '一層の努力を要する' },
];

interface EvalState {
  thinking: number;
  expression: number;
  collaboration: number;
  comment: string;
}

export default function RubricEvaluator({ sessionLogId, teacherId, scenarioSlug, classId }: Props) {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [participantIds, setParticipantIds] = useState<Set<string>>(new Set());
  const [evals, setEvals] = useState<Record<string, EvalState>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!classId) { setLoading(false); return; }
    Promise.all([
      fetchStudents(classId),
      fetchStudentSessionLogs(sessionLogId),
      fetchRubricEvaluations(sessionLogId),
    ]).then(([allStudents, sessionLogs, existing]) => {
      const pIds = new Set(sessionLogs.map((l) => l.student_id));
      setParticipantIds(pIds);
      const participants = allStudents.filter((s) => pIds.has(s.id));
      setStudents(participants);

      const init: Record<string, EvalState> = {};
      for (const s of participants) {
        const ex = existing.find((e) => e.student_id === s.id);
        init[s.id] = ex
          ? { thinking: ex.thinking, expression: ex.expression, collaboration: ex.collaboration, comment: ex.comment || '' }
          : { thinking: 3, expression: 3, collaboration: 3, comment: '' };
      }
      setEvals(init);
      setLoading(false);
    });
  }, [classId, sessionLogId]);

  if (!classId) {
    return <p class="text-sm text-gray-500">クラス未設定のためルーブリック評価は利用できません</p>;
  }

  if (loading) {
    return <p class="text-sm text-gray-400">読み込み中...</p>;
  }

  if (students.length === 0) {
    return <p class="text-sm text-gray-500">この授業に参加した生徒がいません</p>;
  }

  const updateEval = (studentId: string, field: keyof EvalState, value: number | string) => {
    setEvals((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], [field]: value },
    }));
    setSaved(false);
  };

  const setAllB = () => {
    setEvals((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        next[id] = { ...next[id], thinking: 3, expression: 3, collaboration: 3 };
      }
      return next;
    });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const data: RubricEvaluationUpsert[] = Object.entries(evals).map(([studentId, ev]) => ({
      teacher_id: teacherId,
      student_id: studentId,
      session_log_id: sessionLogId,
      scenario_slug: scenarioSlug,
      thinking: ev.thinking,
      expression: ev.expression,
      collaboration: ev.collaboration,
      comment: ev.comment,
    }));
    const ok = await upsertRubricEvaluations(data);
    setSaving(false);
    if (ok) setSaved(true);
  };

  return (
    <div class="space-y-4">
      <div class="flex items-center gap-2">
        <button
          onClick={setAllB}
          class="px-3 py-1.5 text-xs font-bold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
        >
          一括B設定
        </button>
        <div class="text-xs text-gray-400">
          A=十分満足 B=概ね満足 C=努力を要する D=一層の努力
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-500 border-b border-gray-200">
              <th class="py-2 pr-3">生徒名</th>
              <th class="py-2 px-2 text-center">思考力</th>
              <th class="py-2 px-2 text-center">表現力</th>
              <th class="py-2 px-2 text-center">協働力</th>
              <th class="py-2 pl-3">コメント</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const ev = evals[s.id];
              if (!ev) return null;
              return (
                <tr key={s.id} class="border-b border-gray-100">
                  <td class="py-2 pr-3 font-medium">{s.student_name}</td>
                  {(['thinking', 'expression', 'collaboration'] as const).map((field) => (
                    <td key={field} class="py-2 px-2 text-center">
                      <select
                        value={ev[field]}
                        onChange={(e: Event) => updateEval(s.id, field, Number((e.target as HTMLSelectElement).value))}
                        class="px-2 py-1 border border-gray-200 rounded text-sm text-center"
                      >
                        {GRADE_OPTIONS.map((g) => (
                          <option key={g.value} value={g.value}>{g.label}</option>
                        ))}
                      </select>
                    </td>
                  ))}
                  <td class="py-2 pl-3">
                    <input
                      type="text"
                      value={ev.comment}
                      onInput={(e: Event) => updateEval(s.id, 'comment', (e.target as HTMLInputElement).value)}
                      class="w-full px-2 py-1 border border-gray-200 rounded text-sm"
                      placeholder="コメント"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div class="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          class="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 transition-colors disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存'}
        </button>
        {saved && (
          <span class="text-sm text-green-600 font-bold">保存しました</span>
        )}
      </div>
    </div>
  );
}
