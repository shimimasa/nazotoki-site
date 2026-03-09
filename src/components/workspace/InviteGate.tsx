import { useState, useEffect } from 'preact/hooks';
import {
  signUp,
  signIn,
  getCurrentTeacher,
  previewTeacherInvitation,
  consumeTeacherInvitation,
  type InvitationPreview,
  type TeacherProfile,
} from '../../lib/supabase';

const CONSUME_ERROR_MESSAGES: Record<string, string> = {
  not_found: 'この招待リンクは無効です',
  already_used: 'この招待は既に使用されています',
  expired: 'この招待の有効期限が切れています',
  no_teacher_profile: '教師プロフィールが見つかりません。先にアカウントを作成してください',
  different_school: '既に別の学校に所属しています。この招待は使用できません',
};

export default function InviteGate() {
  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [consuming, setConsuming] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; status?: string; error?: string } | null>(null);

  // Auth form state
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Extract token from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    setToken(t);
  }, []);

  // Load preview + check auth
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    Promise.all([
      previewTeacherInvitation(token),
      getCurrentTeacher(),
    ]).then(([prev, t]) => {
      setPreview(prev);
      setTeacher(t);
      setLoading(false);
    });
  }, [token]);

  // Auto-consume if logged in + valid invitation
  useEffect(() => {
    if (teacher && preview?.valid && token && !result && !consuming) {
      handleConsume();
    }
  }, [teacher, preview]);

  const handleConsume = async () => {
    if (!token) return;
    setConsuming(true);
    const res = await consumeTeacherInvitation(token);
    setResult(res);
    setConsuming(false);
  };

  const handleAuth = async (e: Event) => {
    e.preventDefault();
    setAuthError(null);
    setSubmitting(true);

    if (mode === 'signup') {
      if (!displayName.trim()) {
        setAuthError('表示名を入力してください');
        setSubmitting(false);
        return;
      }
      const { teacher: t, error: err } = await signUp(email, password, displayName.trim());
      if (err) {
        setAuthError(err);
      } else if (t) {
        setTeacher(t);
      } else {
        setAuthError('アカウント作成後にメール確認が必要です。確認後にこのページに戻ってください。');
      }
    } else {
      const { error: err } = await signIn(email, password);
      if (err) {
        setAuthError(err);
      } else {
        const t = await getCurrentTeacher();
        setTeacher(t);
      }
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div class="text-center py-16 text-gray-400">
        <div class="text-4xl mb-4 animate-pulse">🔗</div>
        <p class="font-bold">招待を確認中...</p>
      </div>
    );
  }

  // No token
  if (!token) {
    return (
      <div class="max-w-md mx-auto text-center py-16">
        <div class="text-4xl mb-4">🔗</div>
        <h2 class="text-xl font-black mb-2">招待リンクが見つかりません</h2>
        <p class="text-gray-500 mb-6">管理者から共有された招待リンクを使用してください</p>
        <a href="/dashboard/" class="text-amber-600 font-bold hover:underline">
          ダッシュボードへ
        </a>
      </div>
    );
  }

  // Consume result
  if (result) {
    if (result.ok) {
      return (
        <div class="max-w-md mx-auto text-center py-16">
          <div class="text-4xl mb-4">🎉</div>
          <h2 class="text-xl font-black mb-2">
            {result.status === 'already_member' ? '既に参加済みです' : '学校に参加しました！'}
          </h2>
          <p class="text-gray-500 mb-6">
            {result.status === 'already_member'
              ? `${preview?.school_name || 'この学校'}には既に所属しています`
              : `${preview?.school_name || '学校'}のメンバーとして登録されました`}
          </p>
          <a
            href="/dashboard/"
            class="inline-block px-6 py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 transition-colors"
          >
            ダッシュボードへ
          </a>
        </div>
      );
    } else {
      const msg = CONSUME_ERROR_MESSAGES[result.error || ''] || result.error || '招待の受け入れに失敗しました';
      return (
        <div class="max-w-md mx-auto text-center py-16">
          <div class="text-4xl mb-4">❌</div>
          <h2 class="text-xl font-black mb-2">招待を受け入れられませんでした</h2>
          <p class="text-red-600 mb-6">{msg}</p>
          <a href="/dashboard/" class="text-amber-600 font-bold hover:underline">
            ダッシュボードへ
          </a>
        </div>
      );
    }
  }

  // Consuming in progress
  if (consuming) {
    return (
      <div class="text-center py-16 text-gray-400">
        <div class="text-4xl mb-4 animate-pulse">🔗</div>
        <p class="font-bold">招待を受け入れ中...</p>
      </div>
    );
  }

  // Invalid invitation
  if (preview && !preview.valid) {
    const errorMsg: Record<string, string> = {
      not_found: 'この招待リンクは無効です',
      already_used: 'この招待は既に使用されています',
      expired: 'この招待の有効期限が切れています',
    };
    return (
      <div class="max-w-md mx-auto text-center py-16">
        <div class="text-4xl mb-4">⚠️</div>
        <h2 class="text-xl font-black mb-2">
          {preview.school_name ? `${preview.school_name}への招待` : '招待'}
        </h2>
        <p class="text-red-600 mb-6">{errorMsg[preview.error || ''] || '無効な招待です'}</p>
        <a href="/dashboard/" class="text-amber-600 font-bold hover:underline">
          ダッシュボードへ
        </a>
      </div>
    );
  }

  // Valid invitation, not logged in — show auth form
  if (!teacher) {
    return (
      <div class="max-w-md mx-auto">
        {/* Invitation Preview */}
        <div class="bg-sky-50 rounded-xl border border-sky-200 p-5 mb-6 text-center">
          <div class="text-3xl mb-2">🏫</div>
          <h2 class="text-lg font-black text-sky-800">
            {preview?.school_name || '学校'}への招待
          </h2>
          <p class="text-sm text-sky-600 mt-1">
            ログインまたはアカウント作成で参加できます
          </p>
          {preview?.expires_at && (
            <p class="text-xs text-sky-500 mt-2">
              有効期限: {new Date(preview.expires_at).toLocaleDateString('ja-JP')}
            </p>
          )}
        </div>

        {/* Auth Form */}
        <div class="bg-white rounded-xl border border-gray-200 p-6">
          <h3 class="text-lg font-black mb-4 text-center">
            {mode === 'login' ? 'ログイン' : 'アカウント作成'}
          </h3>

          <form onSubmit={handleAuth} class="space-y-4">
            {mode === 'signup' && (
              <div>
                <label class="block text-sm font-bold text-gray-700 mb-1">表示名</label>
                <input
                  type="text"
                  value={displayName}
                  onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-400 focus:border-sky-400"
                  placeholder="例: シミズ先生"
                  required
                />
              </div>
            )}

            <div>
              <label class="block text-sm font-bold text-gray-700 mb-1">メールアドレス</label>
              <input
                type="email"
                value={email}
                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-400 focus:border-sky-400"
                placeholder="teacher@example.com"
                required
              />
            </div>

            <div>
              <label class="block text-sm font-bold text-gray-700 mb-1">パスワード</label>
              <input
                type="password"
                value={password}
                onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-400 focus:border-sky-400"
                placeholder="6文字以上"
                minLength={6}
                required
              />
            </div>

            {authError && (
              <div class="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              class={`w-full py-3 rounded-xl font-bold transition-colors ${
                submitting
                  ? 'bg-gray-300 text-gray-500 cursor-wait'
                  : 'bg-sky-500 text-white hover:bg-sky-600'
              }`}
            >
              {submitting
                ? '処理中...'
                : mode === 'login'
                  ? 'ログインして参加'
                  : 'アカウント作成して参加'}
            </button>
          </form>

          <div class="mt-4 text-center text-sm text-gray-500">
            {mode === 'login' ? (
              <div>
                アカウントがない方は{' '}
                <button
                  onClick={() => { setMode('signup'); setAuthError(null); }}
                  class="text-sky-600 font-bold hover:underline"
                >
                  新規登録
                </button>
              </div>
            ) : (
              <div>
                アカウントをお持ちの方は{' '}
                <button
                  onClick={() => { setMode('login'); setAuthError(null); }}
                  class="text-sky-600 font-bold hover:underline"
                >
                  ログイン
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Logged in + valid invitation — consuming should have auto-triggered
  return (
    <div class="text-center py-16 text-gray-400">
      <div class="text-4xl mb-4 animate-pulse">🔗</div>
      <p class="font-bold">招待を処理中...</p>
    </div>
  );
}
