import { useState } from 'preact/hooks';
import {
  addStudent,
  addStudentsBulk,
  deleteStudent,
  type StudentRow,
} from '../../lib/supabase';

interface Props {
  classId: string;
  students: StudentRow[];
  onStudentsChange: (students: StudentRow[]) => void;
  onSelectStudent: (studentId: string) => void;
}

export default function StudentList({ classId, students, onStudentsChange, onSelectStudent }: Props) {
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkNames, setBulkNames] = useState('');

  const handleAddSingle = async (e: Event) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    const result = await addStudent(classId, newName.trim());
    if (result) {
      onStudentsChange([...students, result]);
      setNewName('');
    }
    setAdding(false);
  };

  const handleBulkAdd = async () => {
    const names = bulkNames
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    if (names.length === 0) return;
    setAdding(true);
    const results = await addStudentsBulk(classId, names);
    if (results.length > 0) {
      onStudentsChange([...students, ...results]);
      setBulkNames('');
      setBulkMode(false);
    }
    setAdding(false);
  };

  const handleDelete = async (studentId: string, name: string) => {
    if (!confirm(`「${name}」を名簿から削除しますか？`)) return;
    const ok = await deleteStudent(studentId);
    if (ok) {
      onStudentsChange(students.filter((s) => s.id !== studentId));
    }
  };

  return (
    <div class="space-y-4">
      {/* Add form */}
      <div class="bg-gray-50 rounded-xl p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-bold text-gray-700">生徒追加</h3>
          <button
            onClick={() => setBulkMode(!bulkMode)}
            class="text-xs text-amber-600 font-bold hover:underline"
          >
            {bulkMode ? '1人ずつ追加' : '一括追加'}
          </button>
        </div>

        {bulkMode ? (
          <div class="space-y-2">
            <textarea
              value={bulkNames}
              onInput={(e) => setBulkNames((e.target as HTMLTextAreaElement).value)}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-amber-400"
              rows={5}
              placeholder={"太郎\n花子\n次郎\n（1行に1人ずつ名前を入力）"}
            />
            <button
              onClick={handleBulkAdd}
              disabled={adding || !bulkNames.trim()}
              class={`w-full py-2 rounded-lg text-sm font-bold transition-colors ${
                adding ? 'bg-gray-300 text-gray-500' : 'bg-amber-500 text-white hover:bg-amber-600'
              }`}
            >
              {adding ? '追加中...' : '一括追加'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleAddSingle} class="flex gap-2">
            <input
              type="text"
              value={newName}
              onInput={(e) => setNewName((e.target as HTMLInputElement).value)}
              class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-400"
              placeholder="生徒の名前"
            />
            <button
              type="submit"
              disabled={adding || !newName.trim()}
              class={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                adding ? 'bg-gray-300 text-gray-500' : 'bg-amber-500 text-white hover:bg-amber-600'
              }`}
            >
              追加
            </button>
          </form>
        )}
      </div>

      {/* Student list */}
      {students.length === 0 ? (
        <div class="text-center py-8 text-gray-400">
          <p class="font-bold">まだ生徒が登録されていません</p>
          <p class="text-sm mt-1">上のフォームから生徒を追加してください</p>
        </div>
      ) : (
        <div class="space-y-1">
          {students.map((student, idx) => (
            <div
              key={student.id}
              class="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-4 py-3 hover:border-amber-400 transition-colors"
            >
              <button
                onClick={() => onSelectStudent(student.id)}
                class="flex items-center gap-3 text-left flex-1 min-w-0"
              >
                <span class="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                  {idx + 1}
                </span>
                <span class="font-bold text-gray-900 truncate">{student.student_name}</span>
              </button>
              <button
                onClick={() => handleDelete(student.id, student.student_name)}
                class="text-xs text-gray-300 hover:text-red-500 transition-colors ml-2"
              >
                ×
              </button>
            </div>
          ))}
          <div class="text-xs text-gray-400 text-right mt-2">
            合計 {students.length} 人
          </div>
        </div>
      )}
    </div>
  );
}
