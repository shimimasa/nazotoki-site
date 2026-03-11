import { useState, useEffect, useMemo } from 'preact/hooks';
import {
  fetchRubricEvaluationsByStudents,
  fetchStudents,
  type RubricEvaluationRow,
  type StudentRow,
  type ClassWithStats,
} from '../../lib/supabase';

interface Props {
  classes: ClassWithStats[];
  teacherId: string;
}

function gradeLabel(avg: number): string {
  if (avg >= 3.5) return 'A';
  if (avg >= 2.5) return 'B';
  if (avg >= 1.5) return 'C';
  return 'D';
}

function gradeBg(avg: number): string {
  if (avg >= 3.5) return 'bg-green-100 text-green-800';
  if (avg >= 2.5) return 'bg-yellow-100 text-yellow-800';
  if (avg >= 1.5) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
}

export default function CompetencyDashboard({ classes, teacherId }: Props) {
  const [selectedClassId, setSelectedClassId] = useState(classes.length > 0 ? classes[0].id : '');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [evaluations, setEvaluations] = useState<RubricEvaluationRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedClassId) return;
    setLoading(true);
    fetchStudents(selectedClassId).then((sts) => {
      setStudents(sts);
      const ids = sts.map((s) => s.id);
      if (ids.length === 0) {
        setEvaluations([]);
        setLoading(false);
        return;
      }
      fetchRubricEvaluationsByStudents(ids).then((evs) => {
        setEvaluations(evs);
        setLoading(false);
      });
    });
  }, [selectedClassId]);

  const studentData = useMemo(() => {
    if (evaluations.length === 0) return [];
    return students.map((s) => {
      const evs = evaluations.filter((e) => e.student_id === s.id);
      if (evs.length === 0) return null;
      const thinkAvg = evs.reduce((sum, e) => sum + e.thinking, 0) / evs.length;
      const exprAvg = evs.reduce((sum, e) => sum + e.expression, 0) / evs.length;
      const collabAvg = evs.reduce((sum, e) => sum + e.collaboration, 0) / evs.length;
      const totalAvg = (thinkAvg + exprAvg + collabAvg) / 3;
      return {
        id: s.id,
        name: s.student_name,
        thinking: thinkAvg,
        expression: exprAvg,
        collaboration: collabAvg,
        average: totalAvg,
        count: evs.length,
      };
    }).filter(Boolean) as {
      id: string; name: string; thinking: number; expression: number;
      collaboration: number; average: number; count: number;
    }[];
  }, [students, evaluations]);

  const classAvg = useMemo(() => {
    if (studentData.length === 0) return null;
    const t = studentData.reduce((s, d) => s + d.thinking, 0) / studentData.length;
    const e = studentData.reduce((s, d) => s + d.expression, 0) / studentData.length;
    const c = studentData.reduce((s, d) => s + d.collaboration, 0) / studentData.length;
    return { thinking: t, expression: e, collaboration: c };
  }, [studentData]);

  const weakness = useMemo(() => {
    if (!classAvg) return null;
    const entries = [
      { key: '思考力', val: classAvg.thinking },
      { key: '表現力', val: classAvg.expression },
      { key: '協働力', val: classAvg.collaboration },
    ];
    entries.sort((a, b) => a.val - b.val);
    return entries[0];
  }, [classAvg]);

  if (classes.length === 0) {
    return null;
  }

  return (
    <div class="bg-white rounded-xl p-6 border border-gray-200">
      <h3 class="font-bold text-lg mb-4">観点別到達度</h3>

      {/* Class Selector */}
      <div class="mb-4">
        <select
          value={selectedClassId}
          onChange={(e: Event) => setSelectedClassId((e.target as HTMLSelectElement).value)}
          class="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.class_name}{c.grade_label ? ` (${c.grade_label})` : ''}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p class="text-sm text-gray-400">読み込み中...</p>
      ) : evaluations.length === 0 ? (
        <div class="text-center py-8 text-gray-400">
          <p class="font-bold">まだ評価データがありません</p>
          <p class="text-sm mt-1">セッション後にルーブリック評価を行うとここに表示されます</p>
        </div>
      ) : (
        <div class="space-y-6">
          {/* Class Average */}
          {classAvg && (
            <div>
              <div class="text-xs font-bold text-gray-500 mb-2">クラス平均</div>
              {([
                { label: '思考力', val: classAvg.thinking },
                { label: '表現力', val: classAvg.expression },
                { label: '協働力', val: classAvg.collaboration },
              ] as const).map((item) => (
                <div key={item.label} class="flex items-center gap-2 mb-2">
                  <div class="w-16 text-xs font-medium text-gray-600">{item.label}</div>
                  <div class="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div
                      class={`h-full rounded-full ${item.val >= 3 ? 'bg-green-400' : item.val >= 2 ? 'bg-yellow-400' : 'bg-red-400'}`}
                      style={{ width: `${(item.val / 4) * 100}%` }}
                    />
                  </div>
                  <div class="w-14 text-xs font-bold text-right">
                    {gradeLabel(item.val)} ({item.val.toFixed(1)})
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Weakness Alert */}
          {weakness && weakness.val < 3 && (
            <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              このクラスは <strong>{weakness.key}</strong> が課題です（平均 {weakness.val.toFixed(1)}）
            </div>
          )}

          {/* Student Heatmap */}
          <div>
            <div class="text-xs font-bold text-gray-500 mb-2">生徒別到達度</div>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-xs text-gray-500 border-b border-gray-200">
                    <th class="py-2 text-left">生徒名</th>
                    <th class="py-2 text-center px-2">思考力</th>
                    <th class="py-2 text-center px-2">表現力</th>
                    <th class="py-2 text-center px-2">協働力</th>
                    <th class="py-2 text-center px-2">平均</th>
                    <th class="py-2 text-center px-2">回数</th>
                  </tr>
                </thead>
                <tbody>
                  {studentData.map((d) => (
                    <tr key={d.id} class="border-b border-gray-100">
                      <td class="py-2 font-medium">{d.name}</td>
                      <td class="py-2 px-2 text-center">
                        <span class={`inline-block px-2 py-0.5 rounded text-xs font-bold ${gradeBg(d.thinking)}`}>
                          {gradeLabel(d.thinking)}
                        </span>
                      </td>
                      <td class="py-2 px-2 text-center">
                        <span class={`inline-block px-2 py-0.5 rounded text-xs font-bold ${gradeBg(d.expression)}`}>
                          {gradeLabel(d.expression)}
                        </span>
                      </td>
                      <td class="py-2 px-2 text-center">
                        <span class={`inline-block px-2 py-0.5 rounded text-xs font-bold ${gradeBg(d.collaboration)}`}>
                          {gradeLabel(d.collaboration)}
                        </span>
                      </td>
                      <td class="py-2 px-2 text-center">
                        <span class={`inline-block px-2 py-0.5 rounded text-xs font-bold ${gradeBg(d.average)}`}>
                          {gradeLabel(d.average)}
                        </span>
                      </td>
                      <td class="py-2 px-2 text-center text-xs text-gray-500">{d.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
