import { useState, useEffect } from 'preact/hooks';
import {
  fetchAssignments,
  createAssignment,
  deleteAssignment,
  type AssignmentRow,
} from '../../lib/supabase';

interface ScenarioOption {
  slug: string;
  title: string;
  series: string;
  seriesName: string;
  difficulty: string;
}

interface Props {
  classId: string;
  teacherId: string;
  scenarios: ScenarioOption[];
}

export default function AssignmentManager({ classId, teacherId, scenarios }: Props) {
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchAssignments(classId).then(a => {
      setAssignments(a);
      setLoading(false);
    });
  }, [classId]);

  const handleCreate = async () => {
    if (!selectedSlug) return;
    const scenario = scenarios.find(s => s.slug === selectedSlug);
    if (!scenario) return;
    setSaving(true);
    const result = await createAssignment({
      teacher_id: teacherId,
      class_id: classId,
      scenario_slug: selectedSlug,
      scenario_title: scenario.title,
      description: description.trim() || undefined,
      due_date: dueDate || null,
    });
    if (result) {
      setAssignments(prev => [result, ...prev]);
      setShowForm(false);
      setSelectedSlug('');
      setDescription('');
      setDueDate('');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteAssignment(id);
    if (ok) {
      setAssignments(prev => prev.filter(a => a.id !== id));
    }
  };

  const assignedSlugs = new Set(assignments.map(a => a.scenario_slug));

  const filteredScenarios = search.trim()
    ? scenarios.filter(s =>
        s.title.includes(search) ||
        s.seriesName.includes(search) ||
        s.slug.includes(search.toLowerCase())
      )
    : scenarios;

  if (loading) {
    return <div class="text-center py-8 text-gray-400">読み込み中...</div>;
  }

  return (
    <div class="space-y-4">
      {/* Create button */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          class="w-full py-3 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 transition-colors"
        >
          + 課題を配信する
        </button>
      )}

      {/* Create form */}
      {showForm && (
        <div class="bg-white rounded-xl border-2 border-amber-300 p-4 space-y-3">
          <h3 class="font-black text-gray-900">新しい課題</h3>

          {/* Scenario search + select */}
          <div>
            <label class="block text-xs font-bold text-gray-600 mb-1">シナリオを選択</label>
            <input
              type="text"
              value={search}
              onInput={e => setSearch((e.target as HTMLInputElement).value)}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2"
              placeholder="シナリオ名で検索..."
            />
            <div class="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
              {filteredScenarios.map(s => {
                const alreadyAssigned = assignedSlugs.has(s.slug);
                return (
                  <button
                    key={s.slug}
                    onClick={() => !alreadyAssigned && setSelectedSlug(s.slug)}
                    disabled={alreadyAssigned}
                    class={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 last:border-0 transition-colors ${
                      selectedSlug === s.slug
                        ? 'bg-amber-100 text-amber-800 font-bold'
                        : alreadyAssigned
                          ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                          : 'hover:bg-gray-50'
                    }`}
                  >
                    <span class="font-bold">{s.title}</span>
                    <span class="text-gray-400 ml-2 text-xs">
                      {s.seriesName} / {s.difficulty}
                      {alreadyAssigned && ' (配信済み)'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <label class="block text-xs font-bold text-gray-600 mb-1">コメント（任意）</label>
            <input
              type="text"
              value={description}
              onInput={e => setDescription((e.target as HTMLInputElement).value)}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="証拠をよく読んでみよう"
              maxLength={200}
            />
          </div>

          {/* Due date */}
          <div>
            <label class="block text-xs font-bold text-gray-600 mb-1">締切日（任意）</label>
            <input
              type="date"
              value={dueDate}
              onInput={e => setDueDate((e.target as HTMLInputElement).value)}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          {/* Actions */}
          <div class="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!selectedSlug || saving}
              class={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                !selectedSlug || saving
                  ? 'bg-gray-200 text-gray-400'
                  : 'bg-amber-500 text-white hover:bg-amber-600'
              }`}
            >
              {saving ? '配信中...' : '配信する'}
            </button>
            <button
              onClick={() => { setShowForm(false); setSelectedSlug(''); setSearch(''); }}
              class="px-4 py-2.5 rounded-lg text-sm font-bold bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Assignment list */}
      {assignments.length === 0 ? (
        <div class="text-center py-8 text-gray-400">
          <p class="text-3xl mb-2">📝</p>
          <p class="font-bold">まだ課題がありません</p>
          <p class="text-sm mt-1">シナリオを選んで生徒に課題を配信しよう</p>
        </div>
      ) : (
        assignments.map(a => (
          <div key={a.id} class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="flex items-start justify-between">
              <div class="min-w-0">
                <p class="font-bold text-gray-900">{a.scenario_title || a.scenario_slug}</p>
                {a.description && (
                  <p class="text-xs text-gray-500 mt-0.5">{a.description}</p>
                )}
                <div class="flex items-center gap-3 mt-2 text-xs text-gray-400">
                  <span>配信日: {formatDate(a.created_at)}</span>
                  {a.due_date && (
                    <span class={isPastDue(a.due_date) ? 'text-red-500 font-bold' : ''}>
                      締切: {a.due_date}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(a.id)}
                class="text-xs text-gray-400 hover:text-red-500 transition-colors shrink-0 ml-2 px-2 py-1"
                title="削除"
              >
                削除
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function isPastDue(dateStr: string): boolean {
  const due = new Date(dateStr + 'T23:59:59');
  return due < new Date();
}
