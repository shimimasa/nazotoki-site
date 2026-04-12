import type { SessionScenarioData } from '../types';
import type { ClassRow, SessionTemplateRow } from '../../../lib/supabase';

interface PrepPhaseProps {
  data: SessionScenarioData;
  teacherName: string;
  playerCount: number;
  environment: 'classroom' | 'dayservice' | 'home';
  onTeacherName: (v: string) => void;
  onPlayerCount: (v: number) => void;
  onEnvironment: (v: 'classroom' | 'dayservice' | 'home') => void;
  onStart: () => void;
  startError?: string | null;
  classes?: ClassRow[];
  selectedClassId?: string | null;
  onClassSelect?: (classId: string | null) => void;
  hasPreset?: boolean;
  // Phase 164 (D1): Session templates
  templates?: SessionTemplateRow[];
  onApplyTemplate?: (template: SessionTemplateRow) => void;
  onDeleteTemplate?: (templateId: string) => void;
  showSaveTemplateDialog?: boolean;
  onShowSaveTemplateDialog?: (show: boolean) => void;
  templateName?: string;
  onTemplateName?: (v: string) => void;
  onSaveTemplate?: () => void;
  templateSaving?: boolean;
  canSaveTemplate?: boolean;
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
  startError,
  classes,
  selectedClassId,
  onClassSelect,
  hasPreset,
  templates = [],
  onApplyTemplate,
  onDeleteTemplate,
  showSaveTemplateDialog = false,
  onShowSaveTemplateDialog,
  templateName = '',
  onTemplateName,
  onSaveTemplate,
  templateSaving = false,
  canSaveTemplate = false,
}: PrepPhaseProps) {
  const canStart = teacherName.trim().length > 0 && playerCount > 0;
  const canSave = canSaveTemplate && templateName.trim().length > 0 && !templateSaving;

  const findClassName = (classId: string | null) => {
    if (!classId || !classes) return null;
    return classes.find((c) => c.id === classId)?.class_name || null;
  };

  const environmentLabel = (env: string) => {
    if (env === 'dayservice') return '放デイ';
    if (env === 'home') return '家庭';
    return '教室';
  };

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

      {/* テンプレート一覧（保存済みプリセット） */}
      {templates.length > 0 && onApplyTemplate && (
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <h3 class="text-sm font-bold text-gray-700 mb-2">保存済みテンプレート</h3>
          <ul class="space-y-2">
            {templates.map((t) => {
              const className = findClassName(t.class_id);
              return (
                <li
                  key={t.id}
                  class="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-amber-400 hover:bg-amber-50 transition-colors"
                >
                  <button
                    onClick={() => onApplyTemplate(t)}
                    class="flex-1 text-left"
                  >
                    <div class="font-bold text-gray-800">{t.template_name}</div>
                    <div class="text-xs text-gray-500">
                      {t.player_count}人 · {environmentLabel(t.environment)}
                      {className ? ` · ${className}` : ''}
                    </div>
                  </button>
                  {onDeleteTemplate && (
                    <button
                      onClick={() => onDeleteTemplate(t.id)}
                      class="text-xs text-gray-400 hover:text-red-500 px-2 py-1"
                      aria-label={`${t.template_name}を削除`}
                      title="削除"
                    >
                      ✕
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p class="text-xs text-gray-400 mt-2">
            タップで設定が自動入力されます
          </p>
        </div>
      )}

      {/* クイックスタート（前回の設定がある場合） */}
      {hasPreset && canStart && (
        <button
          onClick={onStart}
          class="w-full py-4 rounded-xl text-lg font-black bg-green-500 text-white hover:bg-green-600 active:bg-green-700 shadow-lg transition-all flex items-center justify-center gap-2"
        >
          <span class="text-2xl">{'\u26A1'}</span>
          前回の設定でクイックスタート
        </button>
      )}

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

        {/* テンプレートとして保存 */}
        {canSaveTemplate && onShowSaveTemplateDialog && onTemplateName && onSaveTemplate && (
          <div class="pt-2 border-t border-gray-100">
            {!showSaveTemplateDialog ? (
              <button
                onClick={() => onShowSaveTemplateDialog(true)}
                class="text-sm text-gray-500 hover:text-amber-600 underline"
              >
                ＋ この設定をテンプレートとして保存
              </button>
            ) : (
              <div class="space-y-2">
                <input
                  type="text"
                  value={templateName}
                  onInput={(e) => onTemplateName((e.target as HTMLInputElement).value)}
                  placeholder="例: 5年1組 国語"
                  maxLength={40}
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-amber-400 text-sm"
                />
                <div class="flex gap-2">
                  <button
                    onClick={onSaveTemplate}
                    disabled={!canSave}
                    class={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                      canSave
                        ? 'bg-amber-500 text-white hover:bg-amber-600'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {templateSaving ? '保存中…' : '保存'}
                  </button>
                  <button
                    onClick={() => {
                      onShowSaveTemplateDialog(false);
                      onTemplateName('');
                    }}
                    class="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
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
      {startError && (
        <p class="text-red-600 text-sm text-center mt-2">{startError}</p>
      )}
    </div>
  );
}
