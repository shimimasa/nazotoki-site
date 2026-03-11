import { useState } from 'preact/hooks';
import { supabase } from '../../lib/supabase';

interface Props {
  onClose: () => void;
}

const PLANS = [
  {
    id: 'standard',
    name: 'Standard',
    price: '¥1,980',
    period: '/月',
    features: ['無制限クラス', '全100シナリオ', 'AI分析', 'CSV/PDFエクスポート', '保護者ポータル'],
    recommended: true,
  },
  {
    id: 'school',
    name: 'School',
    price: '¥9,800',
    period: '/月/校',
    features: ['全先生アカウント', '全100シナリオ', 'AI分析', '管理者ダッシュボード', '優先サポート', '保護者ポータル'],
    recommended: false,
  },
];

export default function UpgradeModal({ onClose }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelectPlan = async (planId: string) => {
    setLoading(planId);
    setError(null);

    try {
      const session = await supabase?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) {
        setError('認証セッションが見つかりません');
        setLoading(null);
        return;
      }

      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: planId }),
      });

      const data = await res.json();
      if (!data.ok) {
        setError(data.error || '決済処理に失敗しました');
        setLoading(null);
        return;
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch {
      setError('通信エラーが発生しました');
      setLoading(null);
    }
  };

  return (
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="bg-white rounded-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-black text-gray-900">プランをアップグレード</h2>
          <button onClick={onClose} class="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {/* Free plan note */}
        <div class="bg-gray-50 rounded-lg p-3 mb-6 text-sm text-gray-600">
          <span class="font-bold">現在: Free プラン</span> — 1クラス、10シナリオまで
        </div>

        {error && (
          <div class="bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm border border-red-200 mb-4">
            {error}
          </div>
        )}

        {/* Plan cards */}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              class={`rounded-xl border-2 p-5 ${
                plan.recommended ? 'border-amber-400 bg-amber-50' : 'border-gray-200'
              }`}
            >
              {plan.recommended && (
                <div class="text-xs font-bold text-amber-700 mb-2">おすすめ</div>
              )}
              <h3 class="text-lg font-black text-gray-900">{plan.name}</h3>
              <div class="mt-2">
                <span class="text-2xl font-black">{plan.price}</span>
                <span class="text-sm text-gray-500">{plan.period}</span>
              </div>
              <ul class="mt-4 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} class="flex items-center gap-2 text-sm text-gray-700">
                    <span class="text-green-500">&#10003;</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleSelectPlan(plan.id)}
                disabled={loading !== null}
                class={`mt-5 w-full py-2.5 rounded-lg font-bold text-sm transition-colors ${
                  loading === plan.id
                    ? 'bg-gray-300 text-gray-500 cursor-wait'
                    : plan.recommended
                      ? 'bg-amber-500 text-white hover:bg-amber-600'
                      : 'bg-gray-800 text-white hover:bg-gray-900'
                }`}
              >
                {loading === plan.id ? '処理中...' : `${plan.name} にする`}
              </button>
            </div>
          ))}
        </div>

        <p class="text-xs text-gray-400 text-center mt-6">
          いつでもキャンセル可能。Stripeによる安全な決済。
        </p>
      </div>
    </div>
  );
}
