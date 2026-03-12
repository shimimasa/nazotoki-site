import type { SessionRun } from './types';
import { PHASE_DISPLAY } from './types';

interface Props {
  joinCode: string;
  onCodeChange: (code: string) => void;
  playerName: string;
  onNameChange: (name: string) => void;
  error: string | null;
  joining: boolean;
  sessionRun: SessionRun | null;
  isLobby: boolean;
  onFindSession: () => void;
  onJoinSession: () => void;
  onBack: () => void;
}

export default function JoinScreen({
  joinCode, onCodeChange, playerName, onNameChange,
  error, joining, sessionRun, isLobby,
  onFindSession, onJoinSession, onBack,
}: Props) {
  if (isLobby) {
    return (
      <div class="min-h-[80dvh] flex items-center justify-center px-4">
        <div class="w-full max-w-sm space-y-6">
          <div class="text-center">
            <div class="text-4xl mb-2">{'\u2705'}</div>
            <h2 class="text-xl font-black text-gray-900">セッション発見！</h2>
            <p class="text-amber-700 font-bold mt-2">{sessionRun?.scenario_title}</p>
          </div>

          <div class="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-500">参加コード</span>
              <span class="font-mono font-bold">{sessionRun?.join_code}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">フェーズ</span>
              <span class="font-bold">
                {PHASE_DISPLAY[sessionRun?.current_phase || 'prep']?.icon}{' '}
                {PHASE_DISPLAY[sessionRun?.current_phase || 'prep']?.label}
              </span>
            </div>
          </div>

          <div>
            <label class="block text-sm font-bold text-gray-700 mb-2">
              あなたの名前
            </label>
            <input
              type="text"
              value={playerName}
              onInput={(e) => onNameChange((e.target as HTMLInputElement).value)}
              placeholder="名前を入力"
              maxLength={20}
              class="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && playerName.trim()) onJoinSession();
              }}
              autoFocus
            />
          </div>

          {error && (
            <p class="text-red-600 text-sm text-center font-bold">{error}</p>
          )}

          <div class="space-y-2">
            <button
              onClick={onJoinSession}
              disabled={joining || !playerName.trim()}
              class={`w-full py-4 rounded-xl text-lg font-black transition-colors ${
                joining || !playerName.trim()
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-sky-500 text-white hover:bg-sky-600 active:bg-sky-700'
              }`}
            >
              {joining ? '参加中...' : '参加する'}
            </button>
            <button
              onClick={onBack}
              class="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="min-h-[80dvh] flex items-center justify-center px-4">
      <div class="w-full max-w-sm space-y-6">
        <div class="text-center">
          <div class="text-5xl mb-3">{'\uD83D\uDD0D'}</div>
          <h1 class="text-2xl font-black text-gray-900">ナゾトキ探偵団</h1>
          <p class="text-gray-500 text-sm mt-1">参加コードを入力してセッションに参加</p>
        </div>

        <div class="space-y-4">
          <div>
            <input
              type="text"
              value={joinCode}
              onInput={(e) => onCodeChange((e.target as HTMLInputElement).value.toUpperCase())}
              placeholder="参加コード（6文字）"
              maxLength={6}
              class="w-full px-4 py-4 text-center text-2xl font-mono font-black tracking-[0.3em] uppercase border-2 border-gray-300 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') onFindSession();
              }}
              autoFocus
            />
          </div>

          {error && (
            <p class="text-red-600 text-sm text-center font-bold">{error}</p>
          )}

          <button
            onClick={onFindSession}
            disabled={joining || joinCode.length < 4}
            class={`w-full py-4 rounded-xl text-lg font-black transition-colors ${
              joining || joinCode.length < 4
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-sky-500 text-white hover:bg-sky-600 active:bg-sky-700'
            }`}
          >
            {joining ? '検索中...' : 'セッションを探す'}
          </button>
        </div>
      </div>
    </div>
  );
}
