import { useState } from 'preact/hooks';
import {
  addStudent,
  addStudentsBulk,
  deleteStudent,
  generateStudentCredentials,
  resetStudentPin,
  type StudentRow,
  type StudentCredential,
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
  const [generatingCreds, setGeneratingCreds] = useState(false);
  const [credentials, setCredentials] = useState<StudentCredential[] | null>(null);
  const [resetResult, setResetResult] = useState<{ name: string; loginId: string; pin: string } | null>(null);

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

  const handleGenerateCredentials = async () => {
    if (!confirm('クラス全員のログインIDとPINを発行しますか？\n（既に発行済みの生徒はスキップされます）')) return;
    setGeneratingCreds(true);
    const result = await generateStudentCredentials(classId);
    if (result.credentials) {
      setCredentials(result.credentials);
      // Update login_id in local student list
      const loginIdMap = new Map(result.credentials.map(c => [c.student_id, c.login_id]));
      onStudentsChange(students.map(s => ({
        ...s,
        login_id: loginIdMap.get(s.id) ?? s.login_id,
      })));
    }
    setGeneratingCreds(false);
  };

  const handleResetPin = async (studentId: string, studentName: string) => {
    if (!confirm(`「${studentName}」のPINをリセットしますか？`)) return;
    const result = await resetStudentPin(studentId);
    if (result) {
      setResetResult({ name: studentName, loginId: result.login_id, pin: result.pin });
    }
  };

  // Escape CSV values to prevent formula injection in Excel/Sheets
  const csvSafe = (v: string) => /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;

  const credentialsCsvText = () => {
    if (!credentials) return '';
    return '名前,ログインID,PIN\n' +
      credentials.map(c => `${csvSafe(c.student_name)},${c.login_id},${c.pin ?? '(発行済み)'}`).join('\n');
  };

  const handleCopyCredentials = () => {
    navigator.clipboard.writeText(credentialsCsvText());
  };

  return (
    <div class="space-y-4">
      {/* Credentials display (one-time) */}
      {credentials && (
        <div class="bg-amber-50 border-2 border-amber-300 rounded-xl p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-black text-amber-800">ログイン情報（この画面を閉じると PIN は二度と表示されません）</h3>
            <button
              onClick={() => setCredentials(null)}
              class="text-xs text-gray-400 hover:text-gray-600"
            >
              閉じる
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs text-gray-500">
                  <th class="pb-1">名前</th>
                  <th class="pb-1">ログインID</th>
                  <th class="pb-1">PIN</th>
                </tr>
              </thead>
              <tbody>
                {credentials.map(c => (
                  <tr key={c.student_id} class="border-t border-amber-200">
                    <td class="py-1 font-bold">{c.student_name}</td>
                    <td class="py-1 font-mono">{c.login_id}</td>
                    <td class="py-1 font-mono font-bold text-amber-700">
                      {c.pin ?? <span class="text-gray-400">発行済み</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={handleCopyCredentials}
            class="mt-3 px-4 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition-colors"
          >
            CSV形式でコピー
          </button>
        </div>
      )}

      {/* PIN reset result */}
      {resetResult && (
        <div class="bg-blue-50 border border-blue-300 rounded-xl p-4 flex items-center justify-between">
          <div class="text-sm">
            <span class="font-bold">{resetResult.name}</span> の新しいPIN:
            <span class="font-mono font-black text-blue-700 ml-2 text-lg">{resetResult.pin}</span>
            <span class="text-xs text-gray-500 ml-2">（ID: {resetResult.loginId}）</span>
          </div>
          <button onClick={() => setResetResult(null)} class="text-xs text-gray-400 hover:text-gray-600">閉じる</button>
        </div>
      )}

      {/* Add form */}
      <div class="bg-gray-50 rounded-xl p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-bold text-gray-700">生徒追加</h3>
          <div class="flex items-center gap-3">
            {bulkMode && (
              <label class="text-xs text-blue-600 font-bold hover:underline cursor-pointer">
                CSVインポート
                <input
                  type="file"
                  accept=".csv,.txt"
                  class="hidden"
                  onChange={(e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      let text = reader.result as string;
                      // Remove BOM
                      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
                      // Extract first column, skip header-like rows
                      const names = lines
                        .map(l => l.split(',')[0].replace(/^["']|["']$/g, '').trim())
                        // Strip CSV formula-injection prefixes (=, +, -, @, tab, CR)
                        .map(n => n.replace(/^[=+\-@\t\r]+/, ''))
                        .filter(n => n.length > 0 && !/^(名前|生徒名|student_name|name)$/i.test(n));
                      if (names.length > 50) {
                        alert('一度に登録できるのは50名までです');
                        return;
                      }
                      setBulkNames(names.join('\n'));
                    };
                    reader.readAsText(file, 'UTF-8');
                    (e.target as HTMLInputElement).value = '';
                  }}
                />
              </label>
            )}
            <button
              onClick={() => setBulkMode(!bulkMode)}
              class="text-xs text-amber-600 font-bold hover:underline"
            >
              {bulkMode ? '1人ずつ追加' : '一括追加'}
            </button>
          </div>
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

      {/* Login credentials section */}
      {students.length > 0 && (
        <div class="bg-gray-50 rounded-xl p-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-gray-700">ログインID管理</h3>
            <button
              onClick={handleGenerateCredentials}
              disabled={generatingCreds}
              class={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                generatingCreds ? 'bg-gray-300 text-gray-500' : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              {generatingCreds ? '発行中...' : 'ログインID一括発行'}
            </button>
          </div>
          <p class="text-xs text-gray-400 mt-1">
            生徒がソロモードやマイページを使うために必要です
          </p>
        </div>
      )}

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
                <div class="min-w-0">
                  <span class="font-bold text-gray-900 truncate block">{student.student_name}</span>
                  {student.login_id && (
                    <span class="text-xs text-gray-400 font-mono">ID: {student.login_id}</span>
                  )}
                </div>
              </button>
              <div class="flex items-center gap-2 ml-2">
                {student.login_id && (
                  <button
                    onClick={() => handleResetPin(student.id, student.student_name)}
                    class="text-xs text-blue-400 hover:text-blue-600 transition-colors whitespace-nowrap"
                    title="PINリセット"
                  >
                    PIN
                  </button>
                )}
                <button
                  onClick={() => handleDelete(student.id, student.student_name)}
                  class="text-xs text-gray-300 hover:text-red-500 transition-colors"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          <div class="text-xs text-gray-400 text-right mt-2">
            合計 {students.length} 人
            {students.filter(s => s.login_id).length > 0 && (
              <span class="ml-2">
                （ログインID発行済み: {students.filter(s => s.login_id).length}人）
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
