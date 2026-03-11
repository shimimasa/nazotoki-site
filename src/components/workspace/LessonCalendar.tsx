import { useState, useEffect, useMemo } from 'preact/hooks';
import {
  fetchLessonPlans,
  createLessonPlan,
  updateLessonPlan,
  deleteLessonPlan,
  type LessonPlanRow,
  type ClassWithStats,
  type SessionLogRow,
} from '../../lib/supabase';

interface ScenarioItem {
  slug: string;
  title: string;
  series: string;
  seriesName: string;
  difficulty: string;
}

interface Props {
  teacherId: string;
  classes: ClassWithStats[];
  logs: SessionLogRow[];
  scenarios: ScenarioItem[];
}

function toJSTDateStr(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split('T')[0];
}

function todayJST(): string {
  return toJSTDateStr(new Date());
}

export default function LessonCalendar({ teacherId, classes, logs, scenarios }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [plans, setPlans] = useState<LessonPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<LessonPlanRow | null>(null);
  const [modalDate, setModalDate] = useState('');
  const [modalClassId, setModalClassId] = useState('');
  const [modalSlug, setModalSlug] = useState('');
  const [modalNotes, setModalNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadPlans = () => {
    setLoading(true);
    fetchLessonPlans(teacherId).then((p) => {
      setPlans(p);
      setLoading(false);
    });
  };

  useEffect(() => { loadPlans(); }, [teacherId]);

  // Calendar grid generation
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const startDow = (firstDay.getDay() + 6) % 7; // Mon=0
    const days: (number | null)[] = [];
    for (let i = 0; i < startDow; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [year, month]);

  // Plans for current month
  const monthPlans = useMemo(() => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return plans.filter((p) => p.planned_date.startsWith(prefix));
  }, [plans, year, month]);

  // Session logs lookup for auto-completion (JST-safe)
  const logDates = useMemo(() => {
    const map = new Map<string, SessionLogRow[]>();
    for (const l of logs) {
      if (!l.start_time) continue;
      const d = toJSTDateStr(new Date(l.start_time));
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(l);
    }
    return map;
  }, [logs]);

  const prevMonth = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else setMonth(month + 1);
  };

  const openAdd = (day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setModalDate(dateStr);
    setModalClassId(classes.length > 0 ? classes[0].id : '');
    setModalSlug(scenarios.length > 0 ? scenarios[0].slug : '');
    setModalNotes('');
    setEditingPlan(null);
    setShowModal(true);
  };

  const openEdit = (plan: LessonPlanRow) => {
    setModalDate(plan.planned_date);
    setModalClassId(plan.class_id);
    setModalSlug(plan.scenario_slug);
    setModalNotes(plan.notes || '');
    setEditingPlan(plan);
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    if (editingPlan) {
      await updateLessonPlan(editingPlan.id, {
        scenario_slug: modalSlug,
        notes: modalNotes,
        planned_date: modalDate,
      });
    } else {
      await createLessonPlan({
        teacher_id: teacherId,
        class_id: modalClassId,
        scenario_slug: modalSlug,
        planned_date: modalDate,
        notes: modalNotes,
      });
    }
    setSaving(false);
    setShowModal(false);
    loadPlans();
  };

  const handleDelete = async () => {
    if (!editingPlan) return;
    setSaving(true);
    await deleteLessonPlan(editingPlan.id);
    setSaving(false);
    setShowModal(false);
    loadPlans();
  };

  const scenarioTitle = (slug: string) => {
    const s = scenarios.find((sc) => sc.slug === slug);
    return s ? s.title : slug;
  };

  const classColor = (classId: string) => {
    const idx = classes.findIndex((c) => c.id === classId);
    const colors = ['bg-blue-100 text-blue-700', 'bg-green-100 text-green-700', 'bg-purple-100 text-purple-700', 'bg-pink-100 text-pink-700'];
    return colors[idx % colors.length];
  };

  const planned = monthPlans.filter((p) => p.status === 'planned').length;
  const completed = monthPlans.filter((p) => p.status === 'completed').length;

  const DOW = ['月', '火', '水', '木', '金', '土', '日'];

  return (
    <div class="space-y-4">
      {/* Month navigation */}
      <div class="flex items-center justify-between">
        <button onClick={prevMonth} class="px-3 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg">&lt;</button>
        <h3 class="text-lg font-black">{year}年{month}月</h3>
        <button onClick={nextMonth} class="px-3 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg">&gt;</button>
      </div>

      {/* Summary */}
      <div class="flex gap-4 text-sm text-gray-600">
        <span>予定: <strong class="text-amber-600">{planned + completed}件</strong></span>
        <span>実施済み: <strong class="text-green-600">{completed}件</strong></span>
      </div>

      {loading ? (
        <div class="text-center py-8 text-gray-400">読み込み中...</div>
      ) : (
        <>
          {/* Calendar grid */}
          <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div class="grid grid-cols-7">
              {DOW.map((d, i) => (
                <div
                  key={d}
                  class={`text-center text-xs font-bold py-2 border-b border-gray-200 ${
                    i === 5 ? 'text-blue-500 bg-blue-50' : i === 6 ? 'text-red-500 bg-red-50' : 'text-gray-500'
                  }`}
                >
                  {d}
                </div>
              ))}
              {calendarDays.map((day, idx) => {
                const dow = idx % 7;
                const dateStr = day ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
                const dayPlans = day ? monthPlans.filter((p) => p.planned_date === dateStr) : [];
                const isToday = dateStr === todayJST();
                const hasLogs = logDates.has(dateStr);

                return (
                  <div
                    key={idx}
                    class={`min-h-[80px] border-b border-r border-gray-100 p-1 cursor-pointer hover:bg-gray-50 transition-colors ${
                      !day ? 'bg-gray-50' : dow === 5 ? 'bg-blue-50/30' : dow === 6 ? 'bg-red-50/30' : ''
                    }`}
                    onClick={() => day && openAdd(day)}
                  >
                    {day && (
                      <>
                        <div class={`text-xs font-bold mb-1 ${
                          isToday ? 'bg-amber-500 text-white rounded-full w-6 h-6 flex items-center justify-center' :
                          dow === 5 ? 'text-blue-500' : dow === 6 ? 'text-red-500' : 'text-gray-600'
                        }`}>
                          {day}
                        </div>
                        {dayPlans.map((p) => (
                          <div
                            key={p.id}
                            onClick={(e: MouseEvent) => { e.stopPropagation(); openEdit(p); }}
                            class={`text-[10px] font-bold px-1 py-0.5 rounded mb-0.5 truncate cursor-pointer ${classColor(p.class_id)} ${
                              p.status === 'completed' ? 'opacity-70' : ''
                            }`}
                            title={scenarioTitle(p.scenario_slug)}
                          >
                            {p.status === 'completed' && '✅ '}
                            {scenarioTitle(p.scenario_slug).slice(0, 8)}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e: MouseEvent) => e.stopPropagation()}>
            <h3 class="font-bold text-lg mb-4">{editingPlan ? '予定を編集' : '授業予定を追加'}</h3>

            <div class="space-y-3">
              <div>
                <label class="text-xs font-bold text-gray-500">日付</label>
                <input type="date" value={modalDate} onChange={(e: Event) => setModalDate((e.target as HTMLInputElement).value)}
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label class="text-xs font-bold text-gray-500">クラス</label>
                <select value={modalClassId} onChange={(e: Event) => setModalClassId((e.target as HTMLSelectElement).value)}
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" disabled={!!editingPlan}>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.class_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label class="text-xs font-bold text-gray-500">シナリオ</label>
                <select value={modalSlug} onChange={(e: Event) => setModalSlug((e.target as HTMLSelectElement).value)}
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  {scenarios.map((s) => (
                    <option key={s.slug} value={s.slug}>{s.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label class="text-xs font-bold text-gray-500">メモ</label>
                <textarea value={modalNotes} onInput={(e: Event) => setModalNotes((e.target as HTMLTextAreaElement).value)}
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" rows={2} placeholder="メモ（任意）" />
              </div>
            </div>

            <div class="flex items-center gap-2 mt-5">
              <button
                onClick={handleSave}
                disabled={saving || !modalSlug || !modalClassId}
                class="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
              {editingPlan && (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  class="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-bold hover:bg-red-100 transition-colors border border-red-200"
                >
                  削除
                </button>
              )}
              <button
                onClick={() => setShowModal(false)}
                class="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-200 transition-colors ml-auto"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
