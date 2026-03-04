interface IntroPhaseProps {
  commonHtml: string;
}

export default function IntroPhase({ commonHtml }: IntroPhaseProps) {
  return (
    <div class="space-y-4">
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p class="font-bold">💡 進行のヒント</p>
        <p class="mt-1">
          以下の「共通情報」を参加者全員に読み上げてください。
          プロジェクターに投影している場合は、一緒に読みましょう。
        </p>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-6 sm:p-8">
        <h3 class="text-xl font-black mb-4">📄 共通情報</h3>
        <div
          class="prose prose-lg max-w-none"
          dangerouslySetInnerHTML={{ __html: commonHtml }}
        />
      </div>
    </div>
  );
}
