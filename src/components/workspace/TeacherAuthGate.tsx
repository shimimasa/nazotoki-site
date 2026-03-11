import { useState, useEffect } from 'preact/hooks';
import {
  signUp,
  signIn,
  signInWithGoogle,
  signOut,
  getCurrentTeacher,
  onAuthStateChange,
  resetPasswordForEmail,
  type TeacherProfile,
} from '../../lib/supabase';
import TeacherWorkspace from './TeacherWorkspace';

interface ScenarioItem {
  slug: string;
  title: string;
  series: string;
  seriesName: string;
  difficulty: string;
}

export default function TeacherAuthGate({ scenarios = [] }: { scenarios?: ScenarioItem[] }) {
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'login' | 'signup' | 'reset' | 'email-sent'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    getCurrentTeacher().then((t) => {
      setTeacher(t);
      setLoading(false);
    });
    const { unsubscribe } = onAuthStateChange((t) => {
      setTeacher(t);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setSubmitting(true);

    if (mode === 'signup') {
      if (!displayName.trim()) {
        setError('表示名を入力してください');
        setSubmitting(false);
        return;
      }
      const { teacher: t, error: err } = await signUp(email, password, displayName.trim());
      if (err) {
        setError(err);
      } else if (t) {
        setTeacher(t);
      } else {
        // signUp succeeded but no teacher returned — email confirmation may be required
        setMode('email-sent');
      }
    } else if (mode === 'reset') {
      const { error: err } = await resetPasswordForEmail(email);
      if (err) {
        setError(err);
      } else {
        setInfoMessage('パスワードリセットメールを送信しました。メールを確認してください。');
      }
    } else {
      const { error: err } = await signIn(email, password);
      if (err) {
        setError(err);
      } else {
        const t = await getCurrentTeacher();
        setTeacher(t);
      }
    }
    setSubmitting(false);
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setSubmitting(true);
    const { error: err } = await signInWithGoogle();
    if (err) {
      setError(err);
      setSubmitting(false);
    }
    // Redirect happens automatically — no need to setSubmitting(false)
  };

  const handleSignOut = async () => {
    await signOut();
    setTeacher(null);
  };

  if (loading) {
    return (
      <div class="text-center py-16 text-gray-400">
        <div class="text-4xl mb-4 animate-pulse">🔑</div>
        <p class="font-bold">認証状態を確認中...</p>
      </div>
    );
  }

  if (teacher) {
    return (
      <div>
        <div class="flex items-center justify-between mb-6 bg-white rounded-xl p-4 border border-gray-200">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-black">
              {teacher.display_name.charAt(0)}
            </div>
            <div>
              <div class="font-bold text-gray-900">{teacher.display_name}</div>
              <div class="text-xs text-gray-400">Teacher ID: {teacher.id.slice(0, 8)}...</div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            class="px-3 py-1.5 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            ログアウト
          </button>
        </div>
        <TeacherWorkspace teacherId={teacher.id} teacherName={teacher.display_name} schoolId={teacher.school_id} role={teacher.role} plan={teacher.subscription_plan || 'free'} scenarios={scenarios} />
      </div>
    );
  }

  // Email confirmation sent screen
  if (mode === 'email-sent') {
    return (
      <div class="max-w-md mx-auto">
        <div class="bg-white rounded-xl border border-gray-200 p-6 text-center">
          <div class="text-4xl mb-4">📧</div>
          <h2 class="text-xl font-black mb-4">確認メールを送信しました</h2>
          <p class="text-gray-600 mb-2">
            <span class="font-bold">{email}</span> に確認メールを送信しました。
          </p>
          <p class="text-gray-500 text-sm mb-6">
            メール内のリンクをクリックして、アカウントを有効化してください。
          </p>
          <button
            onClick={() => { setMode('login'); setError(null); setInfoMessage(null); }}
            class="px-6 py-2 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 transition-colors"
          >
            ログイン画面に戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="max-w-md mx-auto">
      <div class="bg-white rounded-xl border border-gray-200 p-6">
        <h2 class="text-xl font-black mb-6 text-center">
          {mode === 'login' ? 'ログイン' : mode === 'signup' ? 'アカウント作成' : 'パスワードリセット'}
        </h2>

        {/* Google Login (login/signup modes only) */}
        {(mode === 'login' || mode === 'signup') && (
          <>
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={submitting}
              class="w-full py-3 rounded-xl font-bold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-3 disabled:opacity-50"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Googleでログイン
            </button>
            <div class="relative my-4">
              <div class="absolute inset-0 flex items-center">
                <div class="w-full border-t border-gray-200" />
              </div>
              <div class="relative flex justify-center text-sm">
                <span class="px-3 bg-white text-gray-400">または</span>
              </div>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} class="space-y-4">
          {mode === 'signup' && (
            <div>
              <label class="block text-sm font-bold text-gray-700 mb-1">
                表示名
              </label>
              <input
                type="text"
                value={displayName}
                onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                placeholder="例: シミズ先生"
                required
              />
            </div>
          )}

          <div>
            <label class="block text-sm font-bold text-gray-700 mb-1">
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
              placeholder="teacher@example.com"
              required
            />
          </div>

          {mode !== 'reset' && (
            <div>
              <label class="block text-sm font-bold text-gray-700 mb-1">
                パスワード
              </label>
              <input
                type="password"
                value={password}
                onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                placeholder="6文字以上"
                minLength={6}
                required
              />
            </div>
          )}

          {mode === 'reset' && (
            <p class="text-sm text-gray-500">
              登録済みのメールアドレスを入力してください。パスワードリセット用のリンクを送信します。
            </p>
          )}

          {error && (
            <div class="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200">
              {error}
            </div>
          )}

          {infoMessage && (
            <div class="bg-green-50 text-green-700 text-sm p-3 rounded-lg border border-green-200">
              {infoMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            class={`w-full py-3 rounded-xl font-bold transition-colors ${
              submitting
                ? 'bg-gray-300 text-gray-500 cursor-wait'
                : 'bg-amber-500 text-white hover:bg-amber-600'
            }`}
          >
            {submitting
              ? '処理中...'
              : mode === 'login'
                ? 'ログイン'
                : mode === 'signup'
                  ? 'アカウント作成'
                  : 'リセットメールを送信'}
          </button>
        </form>

        <div class="mt-4 text-center text-sm text-gray-500 space-y-2">
          {mode === 'login' && (
            <>
              <div>
                <button
                  onClick={() => { setMode('reset'); setError(null); setInfoMessage(null); }}
                  class="text-gray-400 hover:text-gray-600 hover:underline text-xs"
                >
                  パスワードをお忘れですか？
                </button>
              </div>
              <div>
                アカウントがない方は{' '}
                <button
                  onClick={() => { setMode('signup'); setError(null); setInfoMessage(null); }}
                  class="text-amber-600 font-bold hover:underline"
                >
                  新規登録
                </button>
              </div>
            </>
          )}
          {mode === 'signup' && (
            <div>
              アカウントをお持ちの方は{' '}
              <button
                onClick={() => { setMode('login'); setError(null); setInfoMessage(null); }}
                class="text-amber-600 font-bold hover:underline"
              >
                ログイン
              </button>
            </div>
          )}
          {mode === 'reset' && (
            <div>
              <button
                onClick={() => { setMode('login'); setError(null); setInfoMessage(null); }}
                class="text-amber-600 font-bold hover:underline"
              >
                ログイン画面に戻る
              </button>
            </div>
          )}
        </div>
      </div>

      <div class="mt-6 text-center">
        <p class="text-xs text-gray-400">
          ログインすると授業履歴がアカウントに紐付きます
        </p>
      </div>
    </div>
  );
}
