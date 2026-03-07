import { useState, useEffect } from 'preact/hooks';
import {
  fetchClasses,
  createClass,
  deleteClass,
  type ClassWithStats,
} from '../../lib/supabase';

interface Props {
  teacherId: string;
  onSelectClass: (classId: string) => void;
}

export default function ClassList({ teacherId, onSelectClass }: Props) {
  const [classes, setClasses] = useState<ClassWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [className, setClassName] = useState('');
  const [gradeLabel, setGradeLabel] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const loadClasses = async () => {
    const data = await fetchClasses(teacherId);
    setClasses(data);
    setLoading(false);
  };

  useEffect(() => { loadClasses(); }, [teacherId]);

  const handleCreate = async (e: Event) => {
    e.preventDefault();
    if (!className.trim()) return;
    setCreating(true);
    const result = await createClass(teacherId, className.trim(), gradeLabel.trim(), description.trim());
    if (result) {
      setClassName('');
      setGradeLabel('');
      setDescription('');
      setShowForm(false);
      await loadClasses();
    }
    setCreating(false);
  };

  const handleDelete = async (classId: string, name: string) => {
    if (!confirm(`「${name}」を削除しますか？\nこのクラスの生徒データも全て削除されます。`)) return;
    await deleteClass(classId);
    await loadClasses();
  };

  if (loading) {
    return <div class="text-center py-8 text-gray-400">クラスを読み込み中...</div>;
  }

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-black">クラス一覧</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          class="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 transition-colors"
        >
          {showForm ? 'キャンセル' : '+ 新しいクラス'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} class="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div>
            <label class="block text-sm font-bold text-gray-700 mb-1">クラス名 *</label>
            <input
              type="text"
              value={className}
              onInput={(e) => setClassName((e.target as HTMLInputElement).value)}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
              placeholder="例: 6年1組"
              required
            />
          </div>
          <div>
            <label class="block text-sm font-bold text-gray-700 mb-1">学年</label>
            <select
              value={gradeLabel}
              onChange={(e) => setGradeLabel((e.target as HTMLSelectElement).value)}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
            >
              <option value="">未設定</option>
              <option value="小1">小1</option>
              <option value="小2">小2</option>
              <option value="小3">小3</option>
              <option value="小4">小4</option>
              <option value="小5">小5</option>
              <option value="小6">小6</option>
              <option value="中1">中1</option>
              <option value="中2">中2</option>
              <option value="中3">中3</option>
              <option value="混合">混合</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-bold text-gray-700 mb-1">説明</label>
            <input
              type="text"
              value={description}
              onInput={(e) => setDescription((e.target as HTMLInputElement).value)}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
              placeholder="例: 国語の探究用"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !className.trim()}
            class={`w-full py-2.5 rounded-lg font-bold transition-colors ${
              creating ? 'bg-gray-300 text-gray-500' : 'bg-amber-500 text-white hover:bg-amber-600'
            }`}
          >
            {creating ? '作成中...' : 'クラスを作成'}
          </button>
        </form>
      )}

      {classes.length === 0 && !showForm ? (
        <div class="text-center py-12">
          <div class="text-5xl mb-4">🏫</div>
          <p class="text-xl font-black text-gray-700">まだクラスがありません</p>
          <p class="text-gray-500 mt-2">「新しいクラス」からクラスを作成しましょう</p>
        </div>
      ) : (
        <div class="space-y-3">
          {classes.map((cls) => (
            <div
              key={cls.id}
              class="bg-white rounded-xl border border-gray-200 hover:border-amber-400 hover:shadow-md transition-all"
            >
              <button
                onClick={() => onSelectClass(cls.id)}
                class="w-full text-left p-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="font-bold text-lg">{cls.class_name}</div>
                    <div class="flex flex-wrap gap-2 mt-1">
                      {cls.grade_label && (
                        <span class="inline-block bg-blue-50 text-blue-700 text-xs font-bold px-2 py-0.5 rounded">
                          {cls.grade_label}
                        </span>
                      )}
                      {cls.description && (
                        <span class="text-sm text-gray-500">{cls.description}</span>
                      )}
                    </div>
                  </div>
                  <div class="flex-shrink-0 text-right space-y-1">
                    <div class="text-sm text-gray-600">
                      <span class="font-bold text-amber-600">{cls.session_count}</span> 回授業
                    </div>
                    <div class="text-sm text-gray-600">
                      <span class="font-bold text-blue-600">{cls.student_count}</span> 人
                    </div>
                  </div>
                </div>
              </button>
              <div class="border-t border-gray-100 px-4 py-2 flex justify-end">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(cls.id, cls.class_name); }}
                  class="text-xs text-gray-400 hover:text-red-600 transition-colors"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
