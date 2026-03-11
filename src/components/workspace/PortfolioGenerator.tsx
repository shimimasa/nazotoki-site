import { useState, useEffect, useMemo } from 'preact/hooks';
import {
  fetchStudents,
  fetchSoloSessionsForStudents,
  fetchRubricEvaluationsByStudents,
  BADGE_DEFS,
  type StudentRow,
  type SoloSessionRow,
  type RubricEvaluationRow,
} from '../../lib/supabase';
import PortfolioPage, { type PortfolioProps } from './PortfolioPage';

interface Props {
  classId: string;
  className: string;
  schoolName: string;
  teacherId: string;
  onBack: () => void;
}

const RANKS = [
  { name: '見習い探偵', minRp: 0, icon: '🔍' },
  { name: '新人探偵', minRp: 150, icon: '🔎' },
  { name: '一人前探偵', minRp: 500, icon: '🕵️' },
  { name: 'ベテラン探偵', minRp: 1500, icon: '🎩' },
  { name: '名探偵', minRp: 3000, icon: '⭐' },
  { name: '伝説の探偵', minRp: 5000, icon: '👑' },
];

function getRank(rp: number) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (rp >= RANKS[i].minRp) return RANKS[i];
  }
  return RANKS[0];
}

function getSubject(slug: string): string {
  if (slug.startsWith('science-file')) return '理科';
  if (slug.startsWith('shakai-file')) return '社会';
  if (slug.startsWith('kokugo-mystery')) return '国語';
  if (slug.startsWith('suiri-puzzle')) return '算数';
  if (slug.startsWith('moral-dilemma')) return '道徳';
  return '総合';
}

const TERM_OPTIONS = [
  { value: '2025年度 1学期', label: '2025年度 1学期', from: '2025-04-01', to: '2025-07-31' },
  { value: '2025年度 2学期', label: '2025年度 2学期', from: '2025-08-01', to: '2025-12-31' },
  { value: '2025年度 3学期', label: '2025年度 3学期', from: '2026-01-01', to: '2026-03-31' },
  { value: '2026年度 1学期', label: '2026年度 1学期', from: '2026-04-01', to: '2026-07-31' },
];

function isInTermRange(dateStr: string | null | undefined, from: string, to: string): boolean {
  if (!dateStr) return false;
  const d = dateStr.split('T')[0];
  return d >= from && d <= to;
}

export default function PortfolioGenerator({ classId, className, schoolName, teacherId, onBack }: Props) {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [soloSessions, setSoloSessions] = useState<SoloSessionRow[]>([]);
  const [rubrics, setRubrics] = useState<RubricEvaluationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [termLabel, setTermLabel] = useState(TERM_OPTIONS[0].value);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    fetchStudents(classId).then((sts) => {
      setStudents(sts);
      setSelectedIds(new Set(sts.map((s) => s.id)));
      const ids = sts.map((s) => s.id);
      if (ids.length === 0) { setLoading(false); return; }
      Promise.all([
        fetchSoloSessionsForStudents(ids),
        fetchRubricEvaluationsByStudents(ids),
      ]).then(([solo, rub]) => {
        setSoloSessions(solo);
        setRubrics(rub);
        setLoading(false);
      });
    });
  }, [classId]);

  const toggleStudent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === students.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(students.map((s) => s.id)));
    }
  };

  const portfolioData: PortfolioProps[] = useMemo(() => {
    const term = TERM_OPTIONS.find((t) => t.value === termLabel);
    const termFrom = term?.from || '2000-01-01';
    const termTo = term?.to || '2099-12-31';

    return students
      .filter((s) => selectedIds.has(s.id))
      .map((s): PortfolioProps => {
        const solo = soloSessions.filter((ss) => ss.student_id === s.id && isInTermRange(ss.completed_at, termFrom, termTo));
        const rub = rubrics.filter((r) => r.student_id === s.id && isInTermRange(r.created_at, termFrom, termTo));
        const totalRp = solo.reduce((sum, ss) => sum + (ss.rp_earned || 0), 0);
        const rank = getRank(totalRp);

        // Subject counts
        const subjectMap: Record<string, number> = {};
        for (const ss of solo) {
          const sub = getSubject(ss.scenario_slug);
          subjectMap[sub] = (subjectMap[sub] || 0) + 1;
        }
        const maxCount = Math.max(...Object.values(subjectMap), 1);
        const subjectAccuracy = ['理科', '社会', '国語', '算数', '道徳'].map((sub) => ({
          subject: sub,
          rate: Math.round(((subjectMap[sub] || 0) / maxCount) * 100),
        }));

        // Rubric averages
        let rubricAverages = null;
        if (rub.length > 0) {
          rubricAverages = {
            thinking: rub.reduce((s, r) => s + r.thinking, 0) / rub.length,
            expression: rub.reduce((s, r) => s + r.expression, 0) / rub.length,
            collaboration: rub.reduce((s, r) => s + r.collaboration, 0) / rub.length,
          };
        }

        // Comments
        const comments = rub.map((r) => r.comment).filter((c) => c && c.trim());

        // Badges (simplified - use solo count as proxy)
        const badges: { icon: string; label: string }[] = [];
        if (solo.length >= 1) badges.push({ icon: '🔰', label: '初クリア' });
        if (solo.length >= 5) badges.push({ icon: '⭐', label: '5回クリア' });
        if (solo.length >= 10) badges.push({ icon: '🌟', label: '10回クリア' });
        if (solo.length >= 25) badges.push({ icon: '💫', label: '25回クリア' });

        return {
          studentName: s.student_name,
          className,
          schoolName,
          termLabel,
          sessionCount: rub.length,
          soloClearCount: solo.length,
          totalRp,
          rank: rank.name,
          rankIcon: rank.icon,
          subjectAccuracy,
          rubricAverages,
          badges,
          comments,
        };
      });
  }, [students, selectedIds, soloSessions, rubrics, termLabel, className, schoolName]);

  if (loading) {
    return <div class="text-center py-12 text-gray-400">読み込み中...</div>;
  }

  if (showPreview) {
    return (
      <div>
        <div class="flex items-center gap-3 mb-4 print:hidden">
          <button onClick={() => setShowPreview(false)} class="text-amber-600 font-bold hover:text-amber-700">
            ← 戻る
          </button>
          <button
            onClick={() => window.print()}
            class="ml-auto px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors"
          >
            印刷
          </button>
        </div>
        {portfolioData.map((data, i) => (
          <PortfolioPage
            key={`p-${i}`}
            studentName={data.studentName}
            className={data.className}
            schoolName={data.schoolName}
            termLabel={data.termLabel}
            sessionCount={data.sessionCount}
            soloClearCount={data.soloClearCount}
            totalRp={data.totalRp}
            rank={data.rank}
            rankIcon={data.rankIcon}
            subjectAccuracy={data.subjectAccuracy}
            rubricAverages={data.rubricAverages}
            badges={data.badges}
            comments={data.comments}
          />
        ))}
      </div>
    );
  }

  return (
    <div class="space-y-4">
      <div class="flex items-center gap-3">
        <button onClick={onBack} class="text-amber-600 font-bold hover:text-amber-700">
          ← クラスに戻る
        </button>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <h2 class="text-xl font-black mb-4">学期末ポートフォリオ</h2>

        {/* Term selector */}
        <div class="mb-4">
          <label class="text-xs font-bold text-gray-500 block mb-1">対象学期</label>
          <select
            value={termLabel}
            onChange={(e: Event) => setTermLabel((e.target as HTMLSelectElement).value)}
            class="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            {TERM_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Student selection */}
        <div class="mb-4">
          <div class="flex items-center gap-2 mb-2">
            <label class="text-xs font-bold text-gray-500">対象生徒</label>
            <button onClick={toggleAll} class="text-xs text-amber-600 hover:text-amber-700">
              {selectedIds.size === students.length ? '全解除' : '全選択'}
            </button>
          </div>
          <div class="grid grid-cols-3 md:grid-cols-4 gap-2">
            {students.map((s) => (
              <label key={s.id} class="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedIds.has(s.id)}
                  onChange={() => toggleStudent(s.id)}
                  class="w-4 h-4 rounded border-gray-300"
                />
                <span class={`text-sm ${selectedIds.has(s.id) ? 'font-bold text-gray-800' : 'text-gray-400'}`}>
                  {s.student_name}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div class="flex gap-2">
          <button
            onClick={() => setShowPreview(true)}
            disabled={selectedIds.size === 0}
            class="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            プレビュー ({selectedIds.size}名)
          </button>
        </div>
      </div>
    </div>
  );
}
