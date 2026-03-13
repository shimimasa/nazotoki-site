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
      <div class="min-h-[80dvh] landscape:min-h-0 landscape:py-4 flex items-center justify-center px-4 bg-gradient-to-b from-sky-50 to-amber-50">
        <div class="w-full max-w-sm space-y-6">
          <div class="text-center">
            <div class="text-4xl mb-2">{'\u2705'}</div>
            <h2 class="text-xl font-black text-gray-900">セッション発見！</h2>
            <p class="text-amber-700 font-bold mt-2">{sessionRun?.scenario_title}</p>
          </div>

          <div class="bg-white/80 backdrop-blur rounded-xl p-4 space-y-2 text-sm border border-sky-100">
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
              class="w-full px-4 py-3 text-lg border-2 border-sky-200 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none bg-white"
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
                  : 'bg-sky-500 text-white hover:bg-sky-600 active:bg-sky-700 shadow-lg'
              }`}
            >
              {joining ? '参加中...' : '参加する'}
            </button>
            <button
              onClick={onBack}
              class="w-full py-3 text-sm text-gray-500 hover:text-gray-700 min-h-[44px]"
            >
              戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="min-h-[80dvh] flex items-center justify-center px-4 bg-gradient-to-b from-indigo-50 via-sky-50 to-amber-50">
      <div class="w-full max-w-sm space-y-8">
        {/* Hero header */}
        <div class="text-center space-y-3">
          <div class="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-200/50 mx-auto">
            <span class="text-4xl">{'\uD83D\uDD0D'}</span>
          </div>
          <h1 class="text-3xl font-black bg-gradient-to-r from-indigo-700 to-sky-600 bg-clip-text text-transparent">
            ナゾトキ探偵団
          </h1>
          <p class="text-gray-500 text-sm">参加コードを入力してセッションに参加しよう</p>
        </div>

        {/* Code input card */}
        <div class="bg-white/80 backdrop-blur rounded-2xl p-6 space-y-4 border border-sky-100 shadow-sm">
          <div>
            <label class="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">
              参加コード
            </label>
            <input
              type="text"
              value={joinCode}
              onInput={(e) => onCodeChange((e.target as HTMLInputElement).value.toUpperCase())}
              placeholder="------"
              maxLength={6}
              class="w-full px-4 py-4 text-center text-3xl font-mono font-black tracking-[0.4em] uppercase border-2 border-sky-200 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none bg-sky-50/50"
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
            class={`w-full py-4 rounded-xl text-lg font-black transition-all ${
              joining || joinCode.length < 4
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-sky-500 to-indigo-500 text-white hover:from-sky-600 hover:to-indigo-600 active:from-sky-700 active:to-indigo-700 shadow-lg shadow-sky-200/50'
            }`}
          >
            {joining ? '検索中...' : 'セッションを探す'}
          </button>
        </div>

        {/* Footer hint */}
        <p class="text-center text-xs text-gray-400">
          先生から教えてもらったコードを入力してね
        </p>
      </div>
    </div>
  );
}
