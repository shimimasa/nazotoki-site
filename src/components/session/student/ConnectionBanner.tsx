import { MAX_RETRIES } from './types';

interface Props {
  connectionStatus: 'connected' | 'reconnecting' | 'disconnected';
  retryCount: number;
  votePending: boolean;
  isOffline: boolean;
  onManualReconnect: () => void;
}

export default function ConnectionBanner({ connectionStatus, retryCount, votePending, isOffline, onManualReconnect }: Props) {
  return (
    <>
      {isOffline && (
        <div class="sticky top-0 z-50 bg-gray-800 px-4 py-2 text-center mb-2 rounded-t-xl">
          <p class="text-white text-sm font-bold">
            {'\u26A0\uFE0F'} オフライン — インターネット接続を確認してください
          </p>
        </div>
      )}
      {!isOffline && connectionStatus === 'reconnecting' && (
        <div class="sticky top-0 z-50 bg-yellow-50 border-b-2 border-yellow-300 px-4 py-2 text-center mb-2 rounded-t-xl">
          <p class="text-yellow-800 text-sm font-bold">
            再接続中...（{retryCount + 1}/{MAX_RETRIES}）
          </p>
        </div>
      )}
      {!isOffline && connectionStatus === 'disconnected' && (
        <div class="sticky top-0 z-50 bg-red-50 border-b-2 border-red-300 px-4 py-2 flex items-center justify-between mb-2 rounded-t-xl">
          <p class="text-red-700 text-sm font-bold">接続エラー</p>
          <button
            onClick={onManualReconnect}
            class="px-3 py-1 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-colors"
          >
            再接続
          </button>
        </div>
      )}
    </>
  );
}
