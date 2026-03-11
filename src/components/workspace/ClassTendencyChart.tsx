import { useState, useEffect, useMemo } from 'preact/hooks';
import {
  fetchStudents,
  fetchRubricEvaluationsByStudents,
  type ClassWithStats,
  type SessionLogRow,
  type StudentRow,
  type RubricEvaluationRow,
} from '../../lib/supabase';

interface Props {
  classes: ClassWithStats[];
  logs: SessionLogRow[];
}

interface ClassAxisData {
  classId: string;
  className: string;
  thinking: number;    // 0-100
  expression: number;  // 0-100
  collaboration: number; // 0-100
  accuracy: number;    // 0-100
  writing: number;     // 0-100
  hasRubric: boolean;
}

const AXES = [
  { key: 'thinking', label: '思考力' },
  { key: 'expression', label: '表現力' },
  { key: 'collaboration', label: '協働力' },
  { key: 'accuracy', label: '正解率' },
  { key: 'writing', label: '記述力' },
] as const;

const COLORS = [
  { stroke: '#f59e0b', fill: 'rgba(245,158,11,0.15)' },
  { stroke: '#3b82f6', fill: 'rgba(59,130,246,0.15)' },
  { stroke: '#10b981', fill: 'rgba(16,185,129,0.15)' },
  { stroke: '#8b5cf6', fill: 'rgba(139,92,246,0.15)' },
];

// Compute vote stats from session logs for a class
function computeVoteStats(classId: string, logs: SessionLogRow[]) {
  const classLogs = logs.filter((l) => l.class_id === classId);
  let totalVotes = 0;
  let correctVotes = 0;
  let totalReasonLength = 0;
  let reasonCount = 0;

  for (const log of classLogs) {
    if (!log.vote_results) continue;
    const entries = Object.entries(log.vote_results);
    const correctSet = new Set(log.correct_players || []);
    for (const [voterId] of entries) {
      totalVotes++;
      // correct_players contains voter IDs who voted correctly
      if (correctSet.has(voterId)) correctVotes++;
      const reason = log.vote_reasons?.[voterId];
      if (reason && reason.trim()) {
        totalReasonLength += reason.trim().length;
        reasonCount++;
      }
    }
  }

  const accuracy = totalVotes > 0 ? Math.round((correctVotes / totalVotes) * 100) : 0;
  const avgReasonLen = reasonCount > 0 ? totalReasonLength / reasonCount : 0;
  // Normalize reason length: 0→0, 50+→100
  const writing = Math.min(100, Math.round(avgReasonLen * 2));

  return { accuracy, writing };
}

// SVG radar chart
function RadarChart({ datasets, size = 240 }: { datasets: { data: ClassAxisData; color: typeof COLORS[0] }[]; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 30;
  const angleStep = (2 * Math.PI) / AXES.length;
  const startAngle = -Math.PI / 2; // Start from top

  const getPoint = (axisIdx: number, value: number) => {
    const angle = startAngle + axisIdx * angleStep;
    const r = (value / 100) * radius;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  // Grid rings
  const rings = [20, 40, 60, 80, 100];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} class="mx-auto">
      {/* Grid rings */}
      {rings.map((val) => {
        const points = AXES.map((_, i) => {
          const p = getPoint(i, val);
          return `${p.x},${p.y}`;
        }).join(' ');
        return (
          <polygon
            key={val}
            points={points}
            fill="none"
            stroke="#e5e7eb"
            stroke-width="1"
          />
        );
      })}

      {/* Axis lines */}
      {AXES.map((_, i) => {
        const p = getPoint(i, 100);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke="#e5e7eb"
            stroke-width="1"
          />
        );
      })}

      {/* Data polygons */}
      {datasets.map(({ data, color }, di) => {
        const points = AXES.map((axis, i) => {
          const val = data[axis.key as keyof ClassAxisData] as number;
          const p = getPoint(i, val);
          return `${p.x},${p.y}`;
        }).join(' ');
        return (
          <polygon
            key={di}
            points={points}
            fill={color.fill}
            stroke={color.stroke}
            stroke-width="2"
          />
        );
      })}

      {/* Data points */}
      {datasets.map(({ data, color }, di) =>
        AXES.map((axis, i) => {
          const val = data[axis.key as keyof ClassAxisData] as number;
          const p = getPoint(i, val);
          return (
            <circle
              key={`${di}-${i}`}
              cx={p.x}
              cy={p.y}
              r="3"
              fill={color.stroke}
            />
          );
        }),
      )}

      {/* Axis labels */}
      {AXES.map((axis, i) => {
        const p = getPoint(i, 120);
        return (
          <text
            key={i}
            x={p.x}
            y={p.y}
            text-anchor="middle"
            dominant-baseline="middle"
            class="text-[11px] font-bold fill-gray-600"
          >
            {axis.label}
          </text>
        );
      })}
    </svg>
  );
}

export default function ClassTendencyChart({ classes, logs }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>(
    classes.length > 0 ? [classes[0].id] : [],
  );
  const [allStudents, setAllStudents] = useState<Map<string, StudentRow[]>>(new Map());
  const [allEvals, setAllEvals] = useState<Map<string, RubricEvaluationRow[]>>(new Map());
  const [loading, setLoading] = useState(false);

  // Fetch students + rubrics for selected classes
  useEffect(() => {
    if (selectedIds.length === 0) return;
    const missing = selectedIds.filter((id) => !allStudents.has(id));
    if (missing.length === 0) return;

    setLoading(true);
    Promise.all(
      missing.map(async (classId) => {
        const sts = await fetchStudents(classId);
        const ids = sts.map((s) => s.id);
        const evs = ids.length > 0 ? await fetchRubricEvaluationsByStudents(ids) : [];
        return { classId, students: sts, evaluations: evs };
      }),
    ).then((results) => {
      setAllStudents((prev) => {
        const next = new Map(prev);
        results.forEach((r) => next.set(r.classId, r.students));
        return next;
      });
      setAllEvals((prev) => {
        const next = new Map(prev);
        results.forEach((r) => next.set(r.classId, r.evaluations));
        return next;
      });
      setLoading(false);
    });
  }, [selectedIds]);

  const classData = useMemo<ClassAxisData[]>(() => {
    return selectedIds.map((classId) => {
      const cls = classes.find((c) => c.id === classId);
      const evs = allEvals.get(classId) || [];
      const hasRubric = evs.length > 0;

      // Rubric averages (1-4 → 0-100)
      let thinking = 0;
      let expression = 0;
      let collaboration = 0;
      if (hasRubric) {
        thinking = Math.round((evs.reduce((s, e) => s + e.thinking, 0) / evs.length / 4) * 100);
        expression = Math.round((evs.reduce((s, e) => s + e.expression, 0) / evs.length / 4) * 100);
        collaboration = Math.round((evs.reduce((s, e) => s + e.collaboration, 0) / evs.length / 4) * 100);
      }

      // Vote stats
      const { accuracy, writing } = computeVoteStats(classId, logs);

      return {
        classId,
        className: cls?.class_name || classId,
        thinking,
        expression,
        collaboration,
        accuracy,
        writing,
        hasRubric,
      };
    });
  }, [selectedIds, classes, logs, allEvals]);

  const toggleClass = (classId: string) => {
    setSelectedIds((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : prev.length < 4
          ? [...prev, classId]
          : prev,
    );
  };

  if (classes.length === 0) return null;

  return (
    <section>
      <h3 class="font-bold text-lg mb-3">クラス傾向分析</h3>
      <div class="bg-white rounded-xl border border-gray-200 p-5">
        {/* Class selector */}
        <div class="flex flex-wrap gap-2 mb-4">
          {classes.map((c, i) => {
            const isSelected = selectedIds.includes(c.id);
            const color = isSelected ? COLORS[selectedIds.indexOf(c.id) % COLORS.length] : null;
            return (
              <button
                key={c.id}
                onClick={() => toggleClass(c.id)}
                class={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                  isSelected
                    ? 'text-white border-transparent'
                    : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                }`}
                style={isSelected ? { backgroundColor: color!.stroke } : undefined}
              >
                {c.class_name}
              </button>
            );
          })}
          {classes.length > 1 && (
            <span class="text-xs text-gray-400 self-center ml-1">
              (最大4クラス比較)
            </span>
          )}
        </div>

        {loading && (
          <div class="text-center py-8 text-gray-400 text-sm">読み込み中...</div>
        )}

        {!loading && classData.length > 0 && (
          <>
            {/* Radar chart */}
            <RadarChart
              datasets={classData.map((d, i) => ({
                data: d,
                color: COLORS[i % COLORS.length],
              }))}
            />

            {/* Legend + values */}
            <div class="mt-4 space-y-3">
              {classData.map((d, i) => {
                const color = COLORS[i % COLORS.length];
                return (
                  <div key={d.classId}>
                    <div class="flex items-center gap-2 mb-1">
                      <span
                        class="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: color.stroke }}
                      />
                      <span class="text-sm font-bold">{d.className}</span>
                      {!d.hasRubric && (
                        <span class="text-[10px] text-gray-400">(ルーブリック未入力)</span>
                      )}
                    </div>
                    <div class="grid grid-cols-5 gap-1 text-center">
                      {AXES.map((axis) => {
                        const val = d[axis.key as keyof ClassAxisData] as number;
                        const isRubricAxis = ['thinking', 'expression', 'collaboration'].includes(axis.key);
                        const dimmed = isRubricAxis && !d.hasRubric;
                        return (
                          <div key={axis.key} class={dimmed ? 'opacity-30' : ''}>
                            <div class="text-lg font-black" style={{ color: color.stroke }}>
                              {dimmed ? '--' : val}
                            </div>
                            <div class="text-[10px] text-gray-400">{axis.label}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Heuristic observations */}
            {classData.length > 0 && (
              <TendencyObservations data={classData} />
            )}
          </>
        )}

        {!loading && classData.length === 0 && (
          <p class="text-center py-8 text-gray-400 text-sm">クラスを選択してください</p>
        )}
      </div>
    </section>
  );
}

function TendencyObservations({ data }: { data: ClassAxisData[] }) {
  const observations: string[] = [];

  for (const d of data) {
    const prefix = data.length > 1 ? `${d.className}: ` : '';

    if (d.hasRubric) {
      const scores = [d.thinking, d.expression, d.collaboration];
      const labels = ['思考力', '表現力', '協働力'];
      const maxIdx = scores.indexOf(Math.max(...scores));
      const minIdx = scores.indexOf(Math.min(...scores));
      if (scores[maxIdx] - scores[minIdx] >= 15) {
        observations.push(`${prefix}${labels[maxIdx]}が強みで、${labels[minIdx]}に伸びしろがあります`);
      }
      if (Math.min(...scores) >= 75) {
        observations.push(`${prefix}ルーブリック3観点がバランス良く高水準です`);
      }
    }

    if (d.accuracy >= 70 && d.writing >= 60) {
      observations.push(`${prefix}正解率・記述力ともに良好。論理的推理が身についています`);
    } else if (d.accuracy >= 70 && d.writing < 30) {
      observations.push(`${prefix}正解率は高いですが、理由の記述が短め。「なぜそう思うか」を言語化する練習が効果的です`);
    } else if (d.accuracy < 40) {
      observations.push(`${prefix}正解率が低め。議論フェーズの時間を延ばすか、証拠の読み取り方をガイドすると改善が期待できます`);
    }
  }

  // Comparison observations
  if (data.length >= 2) {
    const accuracies = data.map((d) => d.accuracy);
    const maxAcc = Math.max(...accuracies);
    const minAcc = Math.min(...accuracies);
    if (maxAcc - minAcc >= 20) {
      const bestClass = data[accuracies.indexOf(maxAcc)].className;
      observations.push(`正解率にクラス間差があります（${bestClass}が最も高い）。シナリオの難易度調整を検討してみてください`);
    }
  }

  if (observations.length === 0) return null;

  return (
    <div class="mt-4 pt-4 border-t border-gray-100">
      <h4 class="text-xs font-bold text-indigo-600 mb-2">傾向所見</h4>
      <ul class="space-y-1">
        {observations.map((obs, i) => (
          <li key={i} class="text-sm text-gray-600 flex items-start gap-2">
            <span class="text-indigo-400 mt-0.5 shrink-0">-</span>
            {obs}
          </li>
        ))}
      </ul>
    </div>
  );
}
