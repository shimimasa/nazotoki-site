interface DiscussPhaseProps {
  gmGuideHtml: string;
}

export default function DiscussPhase({ gmGuideHtml }: DiscussPhaseProps) {
  return (
    <div class="space-y-4">
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p class="font-bold">💬 議論フェーズ</p>
        <p class="mt-1">
          参加者同士で情報を共有し、推理を進めましょう。
          下のGMガイドにキラー質問が含まれています。議論が停滞したら使ってください。
        </p>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-6 sm:p-8">
        <h3 class="text-xl font-black mb-4">📋 GMガイド</h3>
        <div
          class="prose max-w-none gm-guide-content"
          dangerouslySetInnerHTML={{ __html: gmGuideHtml }}
        />
      </div>
    </div>
  );
}
