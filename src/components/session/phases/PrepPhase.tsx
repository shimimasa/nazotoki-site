import type { SessionScenarioData } from '../types';
import type { ClassRow } from '../../../lib/supabase';

interface PrepPhaseProps {
  data: SessionScenarioData;
  teacherName: string;
  playerCount: number;
  environment: 'classroom' | 'dayservice' | 'home';
  onTeacherName: (v: string) => void;
  onPlayerCount: (v: number) => void;
  onEnvironment: (v: 'classroom' | 'dayservice' | 'home') => void;
  onStart: () => void;
  classes?: ClassRow[];
  selectedClassId?: string | null;
  onClassSelect?: (classId: string | null) => void;
}

export default function PrepPhase({
  data,
  teacherName,
  playerCount,
  environment,
  onTeacherName,
  onPlayerCount,
  onEnvironment,
  onStart,
  classes,
  selectedClassId,
  onClassSelect,
}: PrepPhaseProps) {
  const canStart = teacherName.trim().length > 0 && playerCount > 0;

  return (
    <div class="space-y-6">
      {/* シナリオ概要 */}
      <div class="bg-white rounded-xl border border-gray-200 p-6">
        <h2 class="text-2xl font-black mb-2">{data.title}</h2>
        <p class="text-sm text-gray-500 mb-3">
          {data.seriesName} — {data.subject}
        </p>
        <div class="flex flex-wrap gap-3 text-sm text-gray-600 mb-4">
          <span>👥 {data.players}</span>
          <span>⏱ {data.time}</span>
          <span>🎯 {data.age}</span>
          <span>{data.difficulty}</span>
        </div>
        <div
          class="prose prose-sm max-w-none text-gray-700"
          dangerouslySetInnerHTML={{ __html: data.synopsisHtml }}
        />
      </div>

      {/* セッション設定 */}
      <div class="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 class="text-lg font-bold">セッション設定</h3>

        <div>
          <label class="block text-sm font-bold text-gray-700 mb-1">
            あなたの名前（教員名）
          </label>
          <input
            type="text"
            value={teacherName}
            onInput={(e) => onTeacherName((e.target as HTMLInputElement).value)}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
            placeholder="例: シミズ先生"
          />
        </div>

        <div>
          <label class="block text-sm font-bold text-gray-700 mb-1">
            参加人数
          </label>
          <input
            type="number"
            min="1"
            max="40"
            value={playerCount}
            onInput={(e) =>
              onPlayerCount(
                parseInt((e.target as HTMLInputElement).value) || 0,
              )
            }
            class="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
          />
          <span class="text-sm text-gray-500 ml-2">人</span>
        </div>

        {classes && classes.length > 0 && onClassSelect && (
          <div>
            <label class="block text-sm font-bold text-gray-700 mb-1">
              クラス（任意）
            </label>
            <select
              value={selectedClassId || ''}
              onChange={(e) => onClassSelect((e.target as HTMLSelectElement).value || null)}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
            >
              <option value="">クラスを選択しない</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.class_name}{cls.grade_label ? ` (${cls.grade_label})` : ''}
                </option>
              ))}
            </select>
            <p class="text-xs text-gray-400 mt-1">クラスを選ぶと授業履歴がクラス単位で管理されます</p>
          </div>
        )}

        <div>
          <label class="block text-sm font-bold text-gray-700 mb-2">
            実施環境
          </label>
          <div class="flex flex-wrap gap-2">
            {(
              [
                {
                  value: 'classroom',
                  label: '🏫 教室',
                  desc: 'プロジェクター投影',
                },
                {
                  value: 'dayservice',
                  label: '🏠 放デイ',
                  desc: 'タブレット利用',
                },
                { value: 'home', label: '🏡 家庭', desc: 'スマホ/PC' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                onClick={() => onEnvironment(opt.value)}
                class={`px-4 py-2.5 rounded-lg border-2 text-sm font-bold transition-all ${
                  environment === opt.value
                    ? 'border-amber-400 bg-amber-50 text-amber-900'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                <div>{opt.label}</div>
                <div class="text-xs font-normal mt-0.5 opacity-70">
                  {opt.desc}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 開始ボタン */}
      <button
        onClick={onStart}
        disabled={!canStart}
        class={`w-full py-4 rounded-xl text-lg font-black transition-all ${
          canStart
            ? 'bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700 shadow-lg'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        セッションを開始する
      </button>
    </div>
  );
}
