import { useState, useEffect } from 'preact/hooks';
import { supabase } from '../../lib/supabase';

interface StudentProfile {
  student_id: string;
  student_name: string;
  class_id: string;
  login_id: string;
  student_token: string;
  token_expires_at: string;
}

const LS_STUDENT_ID = 'nazotoki-student-id';
const LS_STUDENT_TOKEN = 'nazotoki-student-token';
const LS_STUDENT_NAME = 'nazotoki-student-name';
const LS_STUDENT_LOGIN_ID = 'nazotoki-student-login-id';

export default function StudentLogin() {
  const [loginId, setLoginId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loggedIn, setLoggedIn] = useState<{ name: string; loginId: string } | null>(null);

  // Auto-login: check saved token on mount
  useEffect(() => {
    const savedId = localStorage.getItem(LS_STUDENT_ID);
    const savedToken = localStorage.getItem(LS_STUDENT_TOKEN);
    if (savedId && savedToken && supabase) {
      supabase
        .rpc('rpc_verify_student_token', {
          p_student_id: savedId,
          p_token: savedToken,
        })
        .then(({ data }) => {
          const result = data as Record<string, unknown> | null;
          if (result && !result.error) {
            setLoggedIn({
              name: result.student_name as string,
              loginId: result.login_id as string,
            });
          } else {
            // Token invalid — clear
            localStorage.removeItem(LS_STUDENT_ID);
            localStorage.removeItem(LS_STUDENT_TOKEN);
            localStorage.removeItem(LS_STUDENT_NAME);
            localStorage.removeItem(LS_STUDENT_LOGIN_ID);
          }
          setChecking(false);
        });
    } else {
      setChecking(false);
    }
  }, []);

  const handleLogin = async (e: Event) => {
    e.preventDefault();
    setError('');

    const trimmedId = loginId.trim();
    if (!trimmedId) {
      setError('ログインIDを入力してね');
      return;
    }
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setError('PINは4けたの数字だよ');
      return;
    }
    if (!supabase) {
      setError('接続エラーです');
      return;
    }

    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc('rpc_student_login', {
      p_login_id: trimmedId,
      p_pin: pin,
    });

    if (rpcError) {
      setError('接続エラーです。もう一度やってみてね');
      setLoading(false);
      return;
    }

    const result = data as Record<string, unknown>;
    if (result.error) {
      setError(result.error as string);
      setLoading(false);
      return;
    }

    // Save to localStorage
    localStorage.setItem(LS_STUDENT_ID, result.student_id as string);
    localStorage.setItem(LS_STUDENT_TOKEN, result.student_token as string);
    localStorage.setItem(LS_STUDENT_NAME, result.student_name as string);
    localStorage.setItem(LS_STUDENT_LOGIN_ID, result.login_id as string);

    setLoggedIn({
      name: result.student_name as string,
      loginId: result.login_id as string,
    });
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem(LS_STUDENT_ID);
    localStorage.removeItem(LS_STUDENT_TOKEN);
    localStorage.removeItem(LS_STUDENT_NAME);
    localStorage.removeItem(LS_STUDENT_LOGIN_ID);
    setLoggedIn(null);
    setPin('');
    setLoginId('');
  };

  // Loading state
  if (checking) {
    return (
      <div class="min-h-[80dvh] flex items-center justify-center">
        <p class="text-gray-400 text-lg">読み込み中...</p>
      </div>
    );
  }

  // Logged in state
  if (loggedIn) {
    return (
      <div class="min-h-[80dvh] flex items-center justify-center p-4">
        <div class="w-full max-w-sm text-center space-y-6">
          <div class="text-6xl">🔍</div>
          <div>
            <p class="text-2xl font-black text-gray-900">
              おかえり、{loggedIn.name}！
            </p>
            <p class="text-sm text-gray-500 mt-1">ID: {loggedIn.loginId}</p>
          </div>

          <div class="space-y-3">
            <a
              href="/my"
              class="block w-full py-4 bg-amber-500 text-white rounded-2xl text-lg font-black hover:bg-amber-600 transition-colors text-center"
            >
              マイページへ
            </a>
            <a
              href="/join"
              class="block w-full py-4 bg-blue-500 text-white rounded-2xl text-lg font-black hover:bg-blue-600 transition-colors text-center"
            >
              セッションに参加
            </a>
          </div>

          <button
            onClick={handleLogout}
            class="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ログアウト
          </button>
        </div>
      </div>
    );
  }

  // Login form
  return (
    <div class="min-h-[80dvh] flex items-center justify-center p-4">
      <div class="w-full max-w-sm space-y-6">
        {/* Header */}
        <div class="text-center space-y-2">
          <div class="text-5xl">🔍</div>
          <h1 class="text-2xl font-black text-gray-900">
            ナゾトキ探偵団
          </h1>
          <p class="text-sm text-gray-500">
            ログインIDとPINを入力してね
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} class="space-y-4">
          {/* Login ID */}
          <div>
            <label class="block text-sm font-bold text-gray-700 mb-1">
              ログインID
            </label>
            <input
              type="text"
              value={loginId}
              onInput={(e) => setLoginId((e.target as HTMLInputElement).value)}
              class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-lg font-bold text-center tracking-wider focus:border-amber-400 focus:ring-2 focus:ring-amber-200 outline-none transition-colors"
              placeholder="3a-01"
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>

          {/* PIN */}
          <div>
            <label class="block text-sm font-bold text-gray-700 mb-1">
              PIN（4けた）
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onInput={(e) => {
                const val = (e.target as HTMLInputElement).value.replace(/\D/g, '');
                setPin(val.slice(0, 4));
              }}
              class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-lg font-bold text-center tracking-[0.5em] focus:border-amber-400 focus:ring-2 focus:ring-amber-200 outline-none transition-colors"
              placeholder="● ● ● ●"
            />
          </div>

          {/* Error */}
          {error && (
            <div class="bg-red-50 text-red-600 text-sm font-bold py-3 px-4 rounded-xl text-center">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !loginId.trim() || pin.length !== 4}
            class={`w-full py-4 rounded-2xl text-lg font-black transition-colors ${
              loading || !loginId.trim() || pin.length !== 4
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700'
            }`}
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        {/* Footer links */}
        <div class="text-center space-y-2">
          <a
            href="/join"
            class="text-sm text-amber-600 font-bold hover:underline"
          >
            セッションに参加する（コード入力）
          </a>
          <p class="text-xs text-gray-400">
            IDとPINは先生からもらってね
          </p>
        </div>
      </div>
    </div>
  );
}
