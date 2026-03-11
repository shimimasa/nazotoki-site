import { useState } from 'preact/hooks';
import { supabase } from '../../lib/supabase';

interface VoteDataItem {
  studentName: string;
  votedFor: string;
  reason: string;
}

interface AnalysisPattern {
  studentLabel: string;
  votedFor: string;
  reason: string;
  pattern: 'logical' | 'emotional' | 'evidence-based' | 'speculative';
  quality: number;
  explanation: string;
}

interface AnalysisResult {
  patterns: AnalysisPattern[];
  summary: string;
  distribution: Record<string, number>;
}

interface Props {
  sessionLogId: string;
  voteData: VoteDataItem[];
}

const PATTERN_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  logical: { label: '論理的推論', color: 'text-blue-700', bg: 'bg-blue-100' },
  emotional: { label: '感情的判断', color: 'text-pink-700', bg: 'bg-pink-100' },
  'evidence-based': { label: '証拠ベース', color: 'text-green-700', bg: 'bg-green-100' },
  speculative: { label: '推測・仮説', color: 'text-amber-700', bg: 'bg-amber-100' },
};

const QUALITY_LABELS = ['', '根拠なし', '曖昧', '根拠あり', '複数根拠', '高品質'];

export default function VoteAnalysis({ sessionLogId, voteData }: Props) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);

  const runAnalysis = async () => {
    if (voteData.length === 0) {
      setError('投票データがありません');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get current session token
      const session = await supabase?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) {
        setError('認証セッションが見つかりません。再ログインしてください。');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/analyze-votes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionLogId, voteData }),
      });

      const data = await res.json();

      if (!data.ok) {
        setError(data.error || 'AI分析に失敗しました');
        setLoading(false);
        return;
      }

      setResult(data.result);
      setCached(data.cached || false);
    } catch (err) {
      console.error('Vote analysis error:', err);
      setError('AI分析中にエラーが発生しました');
    }

    setLoading(false);
  };

  if (!result) {
    return (
      <div class="space-y-3">
        <button
          onClick={runAnalysis}
          disabled={loading || voteData.length === 0}
          class="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-bold hover:bg-indigo-600 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? (
            <>
              <span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              分析中...
            </>
          ) : (
            '投票理由をAI分析'
          )}
        </button>
        {error && (
          <div class="bg-red-50 text-red-600 rounded-lg px-4 py-3 text-sm border border-red-200">
            {error}
          </div>
        )}
        {voteData.length === 0 && (
          <p class="text-xs text-gray-400">投票理由データがないため分析できません</p>
        )}
      </div>
    );
  }

  // Distribution chart
  const total = Object.values(result.distribution).reduce((a, b) => a + b, 0);

  return (
    <div class="space-y-5">
      {cached && (
        <p class="text-xs text-gray-400">キャッシュ済みの分析結果を表示しています</p>
      )}

      {/* Distribution chart */}
      <div>
        <h4 class="text-sm font-bold text-gray-700 mb-2">思考パターン分布</h4>
        <div class="flex rounded-lg overflow-hidden h-8">
          {Object.entries(result.distribution)
            .filter(([, count]) => count > 0)
            .map(([pattern, count]) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const style = PATTERN_LABELS[pattern];
              return (
                <div
                  key={pattern}
                  class={`${style?.bg || 'bg-gray-100'} flex items-center justify-center text-xs font-bold ${style?.color || 'text-gray-600'}`}
                  style={{ width: `${pct}%`, minWidth: pct > 0 ? '40px' : '0' }}
                  title={`${style?.label || pattern}: ${count}人 (${pct}%)`}
                >
                  {pct >= 15 && `${style?.label || pattern} ${pct}%`}
                </div>
              );
            })}
        </div>
        <div class="flex flex-wrap gap-3 mt-2">
          {Object.entries(PATTERN_LABELS).map(([key, { label, bg, color }]) => (
            <span key={key} class={`text-xs font-bold ${color} ${bg} px-2 py-0.5 rounded`}>
              {label}: {result.distribution[key] || 0}人
            </span>
          ))}
        </div>
      </div>

      {/* AI Summary */}
      <div class="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
        <h4 class="text-sm font-bold text-indigo-700 mb-1">AI所見</h4>
        <p class="text-sm text-gray-700">{result.summary}</p>
      </div>

      {/* Per-student table */}
      <div>
        <h4 class="text-sm font-bold text-gray-700 mb-2">生徒別分析</h4>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-200 text-gray-500 text-xs">
                <th class="text-left py-2 px-2">生徒名</th>
                <th class="text-left py-2 px-2">投票先</th>
                <th class="text-left py-2 px-2">思考パターン</th>
                <th class="text-center py-2 px-2">品質</th>
                <th class="text-left py-2 px-2">分析コメント</th>
              </tr>
            </thead>
            <tbody>
              {result.patterns.map((p, i) => {
                const style = PATTERN_LABELS[p.pattern];
                return (
                  <tr key={i} class="border-b border-gray-100 hover:bg-gray-50">
                    <td class="py-2 px-2 font-medium">{p.studentLabel}</td>
                    <td class="py-2 px-2 text-gray-600">{p.votedFor}</td>
                    <td class="py-2 px-2">
                      <span class={`text-xs font-bold px-2 py-0.5 rounded ${style?.bg || 'bg-gray-100'} ${style?.color || 'text-gray-600'}`}>
                        {style?.label || p.pattern}
                      </span>
                    </td>
                    <td class="py-2 px-2 text-center">
                      <span class="text-xs font-bold" title={QUALITY_LABELS[p.quality] || ''}>
                        {'★'.repeat(p.quality)}{'☆'.repeat(5 - p.quality)}
                      </span>
                    </td>
                    <td class="py-2 px-2 text-gray-600 text-xs">{p.explanation}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Re-analyze button */}
      <button
        onClick={() => { setResult(null); setCached(false); }}
        class="text-xs text-gray-400 hover:text-gray-600 underline"
      >
        再分析する
      </button>
    </div>
  );
}
