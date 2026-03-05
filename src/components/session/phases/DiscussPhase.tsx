interface DiscussPhaseProps {
  gmGuideHtml: string;
  discussionHtml: string;
}

export default function DiscussPhase({ gmGuideHtml, discussionHtml }: DiscussPhaseProps) {
  const hasDiscussionGuide = discussionHtml && discussionHtml.trim().length > 0;

  return (
    <div class="space-y-4">
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p class="font-bold">💬 議論フェーズ</p>
        <ul class="mt-2 space-y-1 list-disc list-inside">
          <li>各プレイヤーに自分の推理を発表させましょう</li>
          <li>「誰が怪しいと思う？ その理由は？」と問いかけてください</li>
          <li>議論が停滞したらキラー質問を使ってください</li>
        </ul>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-6 sm:p-8">
        <h3 class="text-xl font-black mb-4">
          {hasDiscussionGuide ? '📋 議論の進め方' : '📋 GMガイド'}
        </h3>
        <div
          class="prose max-w-none gm-guide-content"
          dangerouslySetInnerHTML={{ __html: hasDiscussionGuide ? discussionHtml : gmGuideHtml }}
        />
      </div>
    </div>
  );
}
