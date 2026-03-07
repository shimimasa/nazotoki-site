import GmNote from '../GmNote';

interface DiscussPhaseProps {
  gmGuideHtml: string;
  discussionHtml: string;
}

export default function DiscussPhase({ gmGuideHtml, discussionHtml }: DiscussPhaseProps) {
  const hasDiscussionGuide = discussionHtml && discussionHtml.trim().length > 0;
  const mainHtml = hasDiscussionGuide ? discussionHtml : gmGuideHtml;

  return (
    <div class="space-y-4">
      <GmNote>
        <ul class="text-sm text-indigo-800 space-y-1 list-disc list-inside">
          <li>{'\u5404\u30D7\u30EC\u30A4\u30E4\u30FC\u306B\u81EA\u5206\u306E\u63A8\u7406\u3092\u767A\u8868\u3055\u305B\u307E\u3057\u3087\u3046'}</li>
          <li>{'\u300C\u8AB0\u304C\u602A\u3057\u3044\u3068\u601D\u3046\uFF1F \u305D\u306E\u7406\u7531\u306F\uFF1F\u300D\u3068\u554F\u3044\u304B\u3051\u3066\u304F\u3060\u3055\u3044'}</li>
          <li>{'\u8B70\u8AD6\u304C\u505C\u6EDE\u3057\u305F\u3089\u30AD\u30E9\u30FC\u8CEA\u554F\u3092\u4F7F\u3063\u3066\u304F\u3060\u3055\u3044'}</li>
        </ul>
      </GmNote>

      <div class="bg-white rounded-xl border border-gray-200 p-6 sm:p-8">
        <h3 class="text-xl font-black mb-4">
          {hasDiscussionGuide ? '\uD83D\uDCCB \u8B70\u8AD6\u306E\u9032\u3081\u65B9' : '\uD83D\uDCCB GM\u30AC\u30A4\u30C9'}
        </h3>
        <div
          class="prose max-w-none gm-guide-content"
          dangerouslySetInnerHTML={{ __html: mainHtml }}
        />
      </div>
    </div>
  );
}
