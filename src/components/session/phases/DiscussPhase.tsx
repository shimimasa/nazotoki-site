import { useState, useMemo } from 'preact/hooks';
import type { EvidenceCardData } from '../types';
import { splitHtml } from '../splitHtml';
import GmNote from '../GmNote';
import SteppedContent from '../SteppedContent';
import EvidenceViewer from '../EvidenceViewer';

interface DiscussPhaseProps {
  gmGuideHtml: string;
  discussionHtml: string;
  evidenceCards: EvidenceCardData[];
  evidence5: EvidenceCardData | null;
}

/**
 * Extract discussion-related sections and killer questions from the full GM guide HTML.
 * Looks for sections between "discussion start" markers and "next phase" markers.
 */
function extractDiscussionContent(gmGuideHtml: string): {
  discussionHtml: string;
  killerQuestionsHtml: string;
} {
  const sections = splitHtml(gmGuideHtml);
  const discussion: string[] = [];
  const killerSections: string[] = [];

  let inDiscussion = false;
  let prevWasKillerHeading = false;

  for (const sec of sections) {
    const text = sec.replace(/<[^>]+>/g, '').trim();

    // Detect discussion phase start
    if (!inDiscussion && /議論|話し合い|ステップ\s*[2２]|ディスカッション/.test(text)) {
      inDiscussion = true;
    }

    // Detect exit from discussion phase
    if (inDiscussion && /ステップ\s*[3３]|[⑤⑥]|投票タイム|解決編|真相公開|収束|発表/.test(text)) {
      break;
    }

    if (!inDiscussion) continue;

    // Classify killer questions (heading + following table)
    const isKillerHeading = /キラー質問/.test(text);
    const isTableAfterKiller = prevWasKillerHeading && sec.trim().startsWith('<table');

    if (isKillerHeading || isTableAfterKiller) {
      killerSections.push(sec);
    }
    prevWasKillerHeading = isKillerHeading;

    // All discussion sections go to the main flow
    discussion.push(sec);
  }

  return {
    discussionHtml: discussion.length > 0 ? discussion.join('<hr>') : '',
    killerQuestionsHtml: killerSections.join(''),
  };
}

export default function DiscussPhase({
  gmGuideHtml,
  discussionHtml,
  evidenceCards,
  evidence5,
}: DiscussPhaseProps) {
  const [selectedEvidence, setSelectedEvidence] = useState<number | null>(null);

  // Combine all evidence for the reminder bar
  const allEvidence = useMemo(() => {
    const cards = [...evidenceCards];
    if (evidence5) cards.push(evidence5);
    return cards;
  }, [evidenceCards, evidence5]);

  // Extract discussion content from gmGuide
  const extracted = useMemo(
    () => extractDiscussionContent(gmGuideHtml),
    [gmGuideHtml],
  );

  // Determine what to show in the main discussion guide
  const hasExtracted = extracted.discussionHtml.length > 0;
  const hasDiscussionGuide = discussionHtml && discussionHtml.trim().length > 100;
  const guideContent = hasExtracted
    ? extracted.discussionHtml
    : hasDiscussionGuide
      ? discussionHtml
      : gmGuideHtml;

  const selectedCard = selectedEvidence !== null
    ? allEvidence.find((c) => c.number === selectedEvidence) || null
    : null;

  return (
    <div class="space-y-5">
      {/* A: Evidence reminder */}
      <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <p class="text-sm font-bold text-emerald-900 mb-2 flex items-center gap-1.5">
          <span>{'\uD83D\uDD0D'}</span>
          {'\u8A3C\u62E0\u3092\u78BA\u8A8D\u3057\u306A\u304C\u3089\u8B70\u8AD6\u3057\u3088\u3046'}
        </p>
        <div class="flex gap-2 overflow-x-auto pb-1">
          {allEvidence.map((card) => {
            const isSelected = selectedEvidence === card.number;
            return (
              <button
                key={card.number}
                onClick={() =>
                  setSelectedEvidence(isSelected ? null : card.number)
                }
                class={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  isSelected
                    ? 'bg-emerald-600 text-white ring-2 ring-emerald-300 scale-105'
                    : 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300'
                }`}
              >
                <span class="mr-1">{isSelected ? '\u2705' : '\uD83D\uDCC4'}</span>
                {'\u8A3C\u62E0'}{card.number}
              </button>
            );
          })}
        </div>
      </div>

      {/* Evidence popup */}
      {selectedCard && (
        <EvidenceViewer
          card={selectedCard}
          isNewDiscovery={false}
          onClose={() => setSelectedEvidence(null)}
        />
      )}

      {/* B: Discussion guide (stepped) */}
      <div class="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
        <h3 class="text-lg font-black mb-4 flex items-center gap-2">
          <span>{'\uD83D\uDCAC'}</span>
          {'\u8B70\u8AD6\u306E\u9032\u3081\u65B9'}
        </h3>
        <SteppedContent html={guideContent} />
      </div>

      {/* C: Killer questions panel */}
      {extracted.killerQuestionsHtml && (
        <GmNote
          label={'\u30AD\u30E9\u30FC\u8CEA\u554F'}
          closedText={'\u8B70\u8AD6\u304C\u6B62\u307E\u3063\u305F\u3089\u4F7F\u304A\u3046'}
        >
          <div
            class="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: extracted.killerQuestionsHtml }}
          />
        </GmNote>
      )}

      {/* General GM tips */}
      <GmNote>
        <ul class="text-sm text-indigo-800 space-y-1 list-disc list-inside">
          <li>{'\u5404\u30D7\u30EC\u30A4\u30E4\u30FC\u306B\u81EA\u5206\u306E\u63A8\u7406\u3092\u767A\u8868\u3055\u305B\u307E\u3057\u3087\u3046'}</li>
          <li>{'\u300C\u8AB0\u304C\u602A\u3057\u3044\u3068\u601D\u3046\uFF1F \u305D\u306E\u7406\u7531\u306F\uFF1F\u300D\u3068\u554F\u3044\u304B\u3051\u3066\u304F\u3060\u3055\u3044'}</li>
          <li>{'\u8A3C\u62E0\u30AB\u30FC\u30C9\u3092\u30BF\u30C3\u30D7\u3059\u308B\u3068\u3001\u3044\u3064\u3067\u3082\u5185\u5BB9\u3092\u78BA\u8A8D\u3067\u304D\u307E\u3059'}</li>
        </ul>
      </GmNote>
    </div>
  );
}
