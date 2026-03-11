export interface PortfolioProps {
  key?: string | number;
  studentName: string;
  className: string;
  schoolName: string;
  termLabel: string;
  sessionCount: number;
  soloClearCount: number;
  totalRp: number;
  rank: string;
  rankIcon: string;
  subjectAccuracy: { subject: string; rate: number }[];
  rubricAverages: { thinking: number; expression: number; collaboration: number } | null;
  badges: { icon: string; label: string }[];
  comments: string[];
}

function gradeLabel(avg: number): string {
  if (avg >= 3.5) return 'A';
  if (avg >= 2.5) return 'B';
  if (avg >= 1.5) return 'C';
  return 'D';
}

export default function PortfolioPage({
  studentName, className, schoolName, termLabel,
  sessionCount, soloClearCount, totalRp, rank, rankIcon,
  subjectAccuracy, rubricAverages, badges, comments,
}: PortfolioProps) {
  const today = new Date().toLocaleDateString('ja-JP');

  return (
    <div class="bg-white p-6 print:p-4" style="page-break-before: always;">
      {/* Header */}
      <div class="text-center mb-5 pb-3 border-b-2 border-gray-800">
        <h1 class="text-lg font-black">学習ポートフォリオ</h1>
        <div class="text-xs text-gray-600 mt-1">{schoolName} {className} — {termLabel}</div>
        <div class="text-base font-bold mt-2">{studentName}</div>
      </div>

      {/* Summary Grid */}
      <div class="grid grid-cols-4 gap-2 mb-5">
        <div class="text-center p-2 border border-gray-200 rounded">
          <div class="text-xl font-black text-blue-600">{sessionCount}</div>
          <div class="text-[10px] text-gray-600">セッション参加</div>
        </div>
        <div class="text-center p-2 border border-gray-200 rounded">
          <div class="text-xl font-black text-amber-600">{soloClearCount}</div>
          <div class="text-[10px] text-gray-600">ソロクリア</div>
        </div>
        <div class="text-center p-2 border border-gray-200 rounded">
          <div class="text-xl font-black text-green-600">{totalRp}</div>
          <div class="text-[10px] text-gray-600">累計RP</div>
        </div>
        <div class="text-center p-2 border border-gray-200 rounded">
          <div class="text-sm">{rankIcon}</div>
          <div class="text-[10px] font-bold">{rank}</div>
        </div>
      </div>

      {/* Rubric Averages */}
      {rubricAverages && (
        <div class="mb-5">
          <h3 class="text-xs font-bold text-gray-800 mb-2">観点別評価</h3>
          {([
            { label: '思考力', val: rubricAverages.thinking },
            { label: '表現力', val: rubricAverages.expression },
            { label: '協働力', val: rubricAverages.collaboration },
          ]).map((item) => (
            <div key={item.label} class="flex items-center gap-2 mb-1">
              <div class="w-12 text-[10px] font-medium text-gray-600">{item.label}</div>
              <div class="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  class={`h-full rounded-full ${item.val >= 3 ? 'bg-green-500' : item.val >= 2 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${(item.val / 4) * 100}%` }}
                />
              </div>
              <div class="w-10 text-[10px] font-bold text-right">{gradeLabel(item.val)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Subject Accuracy */}
      {subjectAccuracy.length > 0 && (
        <div class="mb-5">
          <h3 class="text-xs font-bold text-gray-800 mb-2">教科別プレイ数</h3>
          {subjectAccuracy.map((sa) => (
            <div key={sa.subject} class="flex items-center gap-2 mb-1">
              <div class="w-10 text-[10px] font-medium text-gray-600">{sa.subject}</div>
              <div class="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
                <div class="bg-amber-500 h-full rounded-full" style={{ width: `${Math.min(sa.rate, 100)}%` }} />
              </div>
              <div class="w-8 text-[10px] text-gray-500 text-right">{sa.rate}</div>
            </div>
          ))}
        </div>
      )}

      {/* Badges */}
      {badges.length > 0 && (
        <div class="mb-5">
          <h3 class="text-xs font-bold text-gray-800 mb-2">獲得バッジ</h3>
          <div class="flex flex-wrap gap-2">
            {badges.map((b) => (
              <span key={b.label} class="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 text-[10px] font-bold">
                {b.icon} {b.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Comments */}
      {comments.length > 0 && (
        <div class="mb-5">
          <h3 class="text-xs font-bold text-gray-800 mb-2">先生からのコメント</h3>
          <ul class="space-y-1">
            {comments.map((c, i) => (
              <li key={i} class="text-[11px] text-gray-700 pl-3 border-l-2 border-amber-300">{c}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer */}
      <div class="text-center pt-3 border-t border-gray-300 text-[10px] text-gray-400">
        ナゾトキ探偵団 学習ポートフォリオ — {today}
      </div>
    </div>
  );
}
