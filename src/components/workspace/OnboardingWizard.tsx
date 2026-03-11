import { useState } from 'preact/hooks';
import { createClass, createSchool, assignTeacherSchool } from '../../lib/supabase';

interface Props {
  teacherId: string;
  schoolId?: string | null;
  onComplete: () => void;
}

const LS_KEY = 'nazotoki-onboarding-completed';

export default function OnboardingWizard({ teacherId, schoolId, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [schoolName, setSchoolName] = useState('');
  const [className, setClassName] = useState('');
  const [gradeLabel, setGradeLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [classCreated, setClassCreated] = useState(false);
  const [resolvedSchoolId, setResolvedSchoolId] = useState<string | null>(schoolId || null);

  const finish = () => {
    localStorage.setItem(LS_KEY, 'true');
    onComplete();
  };

  const handleCreateSchool = async () => {
    if (!schoolName.trim()) return;
    setCreating(true);
    const school = await createSchool(schoolName.trim());
    if (school) {
      await assignTeacherSchool(teacherId, school.id);
      setResolvedSchoolId(school.id);
    }
    setCreating(false);
    setStep(2);
  };

  const handleCreateClass = async () => {
    if (!className.trim()) return;
    setCreating(true);
    await createClass(teacherId, className.trim(), gradeLabel || '', '', resolvedSchoolId);
    setCreating(false);
    setClassCreated(true);
    setStep(3);
  };

  const STEPS = ['ようこそ', '学校登録', 'クラス作成', '準備完了'];

  return (
    <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl p-8 w-full max-w-lg shadow-2xl">
        {/* Progress bar */}
        <div class="flex items-center gap-1 mb-6">
          {STEPS.map((label, i) => (
            <div key={i} class="flex-1">
              <div class={`h-1.5 rounded-full transition-colors ${i <= step ? 'bg-amber-500' : 'bg-gray-200'}`} />
              <div class={`text-[10px] mt-1 text-center ${i <= step ? 'text-amber-600 font-bold' : 'text-gray-400'}`}>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Step content */}
        {step === 0 && (
          <div class="text-center space-y-4">
            <div class="text-5xl">🔍</div>
            <h2 class="text-2xl font-black">ナゾトキ探偵団へようこそ！</h2>
            <p class="text-gray-600">
              ナゾトキ探偵団は、謎解き推理ゲームで子どもたちの思考力を育てる教育プラットフォームです。
            </p>
            <p class="text-sm text-gray-500">
              セッションの準備を一緒に進めましょう。3ステップで完了します。
            </p>
            <button
              onClick={() => setStep(1)}
              class="px-6 py-3 bg-amber-500 text-white rounded-xl font-bold text-lg hover:bg-amber-600 transition-colors"
            >
              はじめる
            </button>
          </div>
        )}

        {step === 1 && (
          <div class="space-y-4">
            <h2 class="text-xl font-black">学校を登録しましょう</h2>
            {schoolId ? (
              <div class="bg-green-50 border border-green-200 rounded-lg p-4">
                <p class="text-sm text-green-700 font-bold">学校は登録済みです</p>
              </div>
            ) : (
              <>
                <p class="text-sm text-gray-600">学校名を入力してください。あとから変更できます。</p>
                <input
                  type="text"
                  value={schoolName}
                  onInput={(e: Event) => setSchoolName((e.target as HTMLInputElement).value)}
                  class="w-full px-4 py-3 border border-gray-200 rounded-xl text-lg"
                  placeholder="例: ○○小学校"
                />
              </>
            )}
            <div class="flex items-center gap-3">
              {schoolId ? (
                <button onClick={() => setStep(2)} class="px-5 py-2 bg-amber-500 text-white rounded-lg font-bold hover:bg-amber-600 transition-colors">
                  次へ
                </button>
              ) : (
                <button
                  onClick={handleCreateSchool}
                  disabled={creating || !schoolName.trim()}
                  class="px-5 py-2 bg-amber-500 text-white rounded-lg font-bold hover:bg-amber-600 transition-colors disabled:opacity-50"
                >
                  {creating ? '登録中...' : '登録して次へ'}
                </button>
              )}
              <button onClick={() => setStep(2)} class="text-sm text-gray-400 hover:text-gray-600">スキップ</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div class="space-y-4">
            <h2 class="text-xl font-black">クラスを作りましょう</h2>
            <p class="text-sm text-gray-600">クラス名と学年を設定しましょう。</p>
            <input
              type="text"
              value={className}
              onInput={(e: Event) => setClassName((e.target as HTMLInputElement).value)}
              class="w-full px-4 py-3 border border-gray-200 rounded-xl text-lg"
              placeholder="例: 5年1組"
            />
            <select
              value={gradeLabel}
              onChange={(e: Event) => setGradeLabel((e.target as HTMLSelectElement).value)}
              class="w-full px-4 py-3 border border-gray-200 rounded-xl"
            >
              <option value="">学年を選択（任意）</option>
              {['小1','小2','小3','小4','小5','小6','中1','中2','中3','混合'].map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <div class="flex items-center gap-3">
              <button
                onClick={handleCreateClass}
                disabled={creating || !className.trim()}
                class="px-5 py-2 bg-amber-500 text-white rounded-lg font-bold hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                {creating ? '作成中...' : '作成して次へ'}
              </button>
              <button onClick={() => setStep(1)} class="text-sm text-gray-400 hover:text-gray-600">戻る</button>
              <button onClick={() => setStep(3)} class="text-sm text-gray-400 hover:text-gray-600 ml-auto">スキップ</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div class="text-center space-y-4">
            <div class="text-5xl">🎉</div>
            <h2 class="text-2xl font-black">準備完了！</h2>
            <p class="text-gray-600">
              {classCreated
                ? 'クラスが作成されました。次は生徒を登録して、最初のセッションを始めましょう！'
                : 'いつでもクラスを作成して、セッションを始められます。'}
            </p>
            <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 text-left">
              <p class="text-sm font-bold text-amber-800 mb-2">おすすめの最初のシナリオ:</p>
              <a href="/session/science-file-vol1" class="text-amber-600 font-bold hover:underline text-sm">
                サイエンス・ファイル vol.1 →
              </a>
              <p class="text-xs text-gray-500 mt-1">理科の基礎的な推理シナリオで、はじめてのセッションに最適です。</p>
            </div>
            <button
              onClick={finish}
              class="px-6 py-3 bg-amber-500 text-white rounded-xl font-bold text-lg hover:bg-amber-600 transition-colors"
            >
              ダッシュボードへ
            </button>
          </div>
        )}

        {/* Skip button (always visible except on final step) */}
        {step < 3 && (
          <div class="mt-6 text-center">
            <button onClick={finish} class="text-xs text-gray-400 hover:text-gray-600">
              後で設定する（スキップ）
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
