import { useState, useEffect, useMemo } from 'preact/hooks';
import { supabase } from '../../lib/supabase';

interface SchoolStat {
  id: string;
  name: string;
  school_type: string | null;
  teacherCount: number;
  classCount: number;
  sessionCount: number;
  studentCount: number;
}

interface GroupData {
  group: { id: string; name: string; contact_email: string | null };
  schools: SchoolStat[];
}

export default function GroupDashboard() {
  const [data, setData] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const session = await supabase?.auth.getSession();
        const token = session?.data.session?.access_token;
        if (!token) {
          setError('認証セッションが見つかりません');
          setLoading(false);
          return;
        }
        const res = await fetch('/api/group-data', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!json.ok) {
          setError(json.error || 'データの取得に失敗しました');
        } else {
          setData(json.data);
        }
      } catch {
        setError('通信エラーが発生しました');
      }
      setLoading(false);
    })();
  }, []);

  const totals = useMemo(() => {
    if (!data) return { teachers: 0, classes: 0, sessions: 0, students: 0 };
    return data.schools.reduce(
      (acc, s) => ({
        teachers: acc.teachers + s.teacherCount,
        classes: acc.classes + s.classCount,
        sessions: acc.sessions + s.sessionCount,
        students: acc.students + s.studentCount,
      }),
      { teachers: 0, classes: 0, sessions: 0, students: 0 },
    );
  }, [data]);

  if (loading) {
    return (
      <div class="text-center py-8 text-gray-400">
        <div class="animate-pulse text-2xl mb-2">🏫</div>
        <p class="text-sm font-bold">グループデータを読み込み中...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div class="bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm border border-red-200">
        {error || 'グループデータが見つかりませんでした'}
      </div>
    );
  }

  return (
    <div class="space-y-6">
      {/* Group header */}
      <div class="bg-indigo-50 rounded-xl border border-indigo-200 p-5">
        <div class="flex items-center gap-3">
          <span class="text-2xl">🏛️</span>
          <div>
            <h3 class="text-lg font-black text-indigo-900">{data.group.name}</h3>
            <p class="text-sm text-indigo-600">{data.schools.length}校を管理中</p>
          </div>
        </div>
      </div>

      {/* KPI totals */}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div class="text-2xl font-black text-blue-600">{totals.teachers}</div>
          <div class="text-xs text-gray-500">総教員数</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div class="text-2xl font-black text-amber-600">{totals.students}</div>
          <div class="text-xs text-gray-500">総生徒数</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div class="text-2xl font-black text-green-600">{totals.sessions}</div>
          <div class="text-xs text-gray-500">総授業数</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div class="text-2xl font-black text-purple-600">{totals.classes}</div>
          <div class="text-xs text-gray-500">総クラス数</div>
        </div>
      </div>

      {/* School list */}
      <div>
        <h4 class="text-sm font-black text-gray-800 mb-3">管轄校一覧</h4>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-200 text-xs text-gray-500">
                <th class="text-left py-2 px-3">学校名</th>
                <th class="text-center py-2 px-3">教員</th>
                <th class="text-center py-2 px-3">生徒</th>
                <th class="text-center py-2 px-3">クラス</th>
                <th class="text-center py-2 px-3">授業数</th>
              </tr>
            </thead>
            <tbody>
              {data.schools.map((school) => (
                <tr key={school.id} class="border-b border-gray-100 hover:bg-gray-50">
                  <td class="py-3 px-3">
                    <span class="font-bold text-gray-900">{school.name}</span>
                    {school.school_type && (
                      <span class="ml-2 text-xs text-gray-400">
                        ({school.school_type === 'elementary' ? '小' :
                          school.school_type === 'junior_high' ? '中' :
                          school.school_type === 'high' ? '高' : school.school_type})
                      </span>
                    )}
                  </td>
                  <td class="py-3 px-3 text-center font-bold">{school.teacherCount}</td>
                  <td class="py-3 px-3 text-center font-bold">{school.studentCount}</td>
                  <td class="py-3 px-3 text-center">{school.classCount}</td>
                  <td class="py-3 px-3 text-center">
                    <span class={school.sessionCount > 0 ? 'text-green-600 font-bold' : 'text-gray-300'}>
                      {school.sessionCount}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
