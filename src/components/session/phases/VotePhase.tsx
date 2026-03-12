import { useState, useMemo, useEffect } from 'preact/hooks';
import type { CharacterData, EvidenceCardData } from '../types';
import { splitHtml } from '../splitHtml';
import EvidenceViewer from '../EvidenceViewer';
import Confetti from '../Confetti';

interface VotePhaseProps {
  characters: CharacterData[];
  votes: Record<string, string>;
  onVote: (voterId: string, suspectId: string) => void;
  voteReasons: Record<string, string>;
  onVoteReason: (voterId: string, reason: string) => void;
  evidenceCards: EvidenceCardData[];
  evidence5: EvidenceCardData | null;
  gmGuideHtml: string;
}

/**
 * Extract vote/conclusion-related guidance from the GM guide.
 * Looks for sections about voting, final reasoning, or convergence.
 */
function extractVoteGuidance(gmGuideHtml: string): string {
  const sections = splitHtml(gmGuideHtml);
  const matched: string[] = [];
  let inVoteSection = false;

  for (const sec of sections) {
    const text = sec.replace(/<[^>]+>/g, '').trim();

    if (/投票|収束|最終|推理を整理|結論/.test(text)) {
      inVoteSection = true;
    }
    if (inVoteSection && /解決編|真相公開|ステップ\s*[4-6４-６]|エピローグ/.test(text)) {
      break;
    }
    if (inVoteSection) matched.push(sec);
  }

  return matched.length > 0 ? matched.join('<hr>') : '';
}

type VoteStage = 'prepare' | 'voting' | 'sealed' | 'countdown' | 'results';

export default function VotePhase({
  characters,
  votes,
  onVote,
  voteReasons,
  onVoteReason,
  evidenceCards,
  evidence5,
  gmGuideHtml,
}: VotePhaseProps) {
  const [stage, setStage] = useState<VoteStage>('prepare');
  const [currentVoterIdx, setCurrentVoterIdx] = useState(0);
  const [selectedSuspect, setSelectedSuspect] = useState<string | null>(null);
  const [currentReason, setCurrentReason] = useState('');
  const [selectedEvidence, setSelectedEvidence] = useState<number | null>(null);
  const [revealAnim, setRevealAnim] = useState(false);
  const [countdownNum, setCountdownNum] = useState(3);

  const allEvidence = useMemo(() => {
    const cards = [...evidenceCards];
    if (evidence5) cards.push(evidence5);
    return cards;
  }, [evidenceCards, evidence5]);

  const voteGuidance = useMemo(
    () => extractVoteGuidance(gmGuideHtml),
    [gmGuideHtml],
  );

  const votedCount = Object.keys(votes).length;
  const allVoted = votedCount === characters.length;
  const currentVoter = characters[currentVoterIdx];

  const selectedCard = selectedEvidence !== null
    ? allEvidence.find((c) => c.number === selectedEvidence) || null
    : null;

  const handleConfirmVote = () => {
    if (!currentVoter || !selectedSuspect) return;
    onVote(currentVoter.id, selectedSuspect);
    if (currentReason.trim()) {
      onVoteReason(currentVoter.id, currentReason.trim());
    }
    setSelectedSuspect(null);
    setCurrentReason('');

    if (currentVoterIdx < characters.length - 1) {
      setCurrentVoterIdx((i) => i + 1);
    } else {
      setStage('sealed');
    }
  };

  const handleReveal = () => {
    setCountdownNum(3);
    setStage('countdown');
  };

  // Countdown timer for dramatic reveal
  useEffect(() => {
    if (stage !== 'countdown') return;
    if (countdownNum <= 0) {
      setStage('results');
      setTimeout(() => setRevealAnim(true), 100);
      return;
    }
    const id = setTimeout(() => setCountdownNum((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [stage, countdownNum]);

  // ── Stage: Prepare ──
  if (stage === 'prepare') {
    return (
      <div class="space-y-5">
        {/* Evidence reminder */}
        <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p class="text-sm font-bold text-emerald-900 mb-2 flex items-center gap-1.5">
            <span>{'\uD83D\uDD0D'}</span>
            {'\u6295\u7968\u524D\u306B\u8A3C\u62E0\u3092\u78BA\u8A8D'}
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
                      : 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <span class="mr-1">{isSelected ? '\u2705' : '\uD83D\uDCC4'}</span>
                  {'\u8A3C\u62E0'}{card.number}
                </button>
              );
            })}
          </div>
        </div>

        {selectedCard && (
          <EvidenceViewer
            card={selectedCard}
            isNewDiscovery={false}
            onClose={() => setSelectedEvidence(null)}
          />
        )}

        {/* Vote guidance from gmGuide */}
        {voteGuidance && (
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <h4 class="font-black text-sm text-gray-700 mb-3 flex items-center gap-1.5">
              <span>{'\uD83D\uDCA1'}</span>
              {'\u63A8\u7406\u306E\u30DD\u30A4\u30F3\u30C8'}
            </h4>
            <div
              class="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: voteGuidance }}
            />
          </div>
        )}

        {/* Start voting button */}
        <div class="text-center py-4">
          <p class="text-sm text-gray-500 mb-3">
            {'\u8A3C\u62E0\u3092\u78BA\u8A8D\u3057\u305F\u3089\u3001\u6295\u7968\u306B\u9032\u307F\u307E\u3057\u3087\u3046'}
          </p>
          <button
            onClick={() => setStage('voting')}
            class="px-8 py-4 bg-red-600 text-white rounded-xl text-lg font-black hover:bg-red-700 transition-colors shadow-lg"
          >
            {'\uD83D\uDDF3\uFE0F \u6295\u7968\u3092\u59CB\u3081\u308B'}
          </button>
        </div>
      </div>
    );
  }

  // ── Stage: Voting (one voter at a time) ──
  if (stage === 'voting') {
    const suspects = characters.filter((c) => c.id !== currentVoter.id);

    return (
      <div class="space-y-5">
        {/* Progress */}
        <div class="flex items-center justify-between">
          <div class="flex gap-1">
            {characters.map((c, i) => (
              <div
                key={c.id}
                class={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                  i < currentVoterIdx
                    ? 'bg-green-500 text-white'
                    : i === currentVoterIdx
                      ? 'bg-red-500 text-white ring-2 ring-red-300 scale-110'
                      : 'bg-gray-200 text-gray-500'
                }`}
              >
                {i < currentVoterIdx ? '\u2713' : i + 1}
              </div>
            ))}
          </div>
          <span class="text-sm font-bold text-gray-500">
            {currentVoterIdx + 1} / {characters.length}
          </span>
        </div>

        {/* Current voter header */}
        <div class="bg-red-50 border-2 border-red-200 rounded-xl p-5 text-center">
          <p class="text-sm text-red-600 font-bold mb-1">
            {'\u6295\u7968\u306E\u756A\u3067\u3059'}
          </p>
          <p class="text-2xl font-black text-red-900">
            {currentVoter.name}
          </p>
          <p class="text-xs text-red-600 mt-1">
            {currentVoter.role}
          </p>
        </div>

        {/* Suspect selection */}
        <div>
          <p class="text-sm font-bold text-gray-600 mb-3">
            {'\u8AB0\u304C\u602A\u3057\u3044\u3068\u601D\u3046\uFF1F'}
          </p>
          <div class="grid grid-cols-1 gap-2">
            {suspects.map((suspect) => {
              const isChosen = selectedSuspect === suspect.id;
              return (
                <button
                  key={suspect.id}
                  onClick={() => setSelectedSuspect(suspect.id)}
                  class={`w-full px-4 py-4 rounded-xl text-left transition-all duration-200 ${
                    isChosen
                      ? 'bg-red-500 text-white ring-2 ring-red-300 scale-[1.02] shadow-md'
                      : 'bg-white border-2 border-gray-200 hover:border-red-300 hover:bg-red-50/50'
                  }`}
                >
                  <div class="flex items-center gap-3">
                    <div class={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-black ${
                      isChosen ? 'bg-red-400 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {suspect.name.charAt(0)}
                    </div>
                    <div>
                      <p class={`font-black ${isChosen ? 'text-white' : 'text-gray-900'}`}>
                        {suspect.name}
                      </p>
                      <p class={`text-xs ${isChosen ? 'text-red-100' : 'text-gray-500'}`}>
                        {suspect.role}
                      </p>
                    </div>
                    {isChosen && (
                      <span class="ml-auto text-xl">{'\u2714'}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Vote reason (optional) */}
        {selectedSuspect && (
          <div>
            <label class="text-sm font-bold text-gray-600 block mb-1">
              {'\u7406\u7531\uFF08\u4EFB\u610F\uFF09'}
            </label>
            <input
              type="text"
              value={currentReason}
              onInput={(e) => setCurrentReason((e.target as HTMLInputElement).value)}
              placeholder={'\u306A\u305C\u305D\u306E\u4EBA\u7269\u3060\u3068\u601D\u3063\u305F\uFF1F'}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-400 focus:border-red-400"
            />
          </div>
        )}

        {/* Confirm vote button */}
        <button
          onClick={handleConfirmVote}
          disabled={!selectedSuspect}
          class={`w-full py-4 rounded-xl text-lg font-black transition-all ${
            selectedSuspect
              ? 'bg-red-600 text-white hover:bg-red-700 shadow-lg'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {selectedSuspect
            ? `${currentVoter.name}\u306E\u6295\u7968\u3092\u78BA\u5B9A`
            : '\u5BB9\u7591\u8005\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044'}
        </button>
      </div>
    );
  }

  // ── Stage: Sealed (all voted, ready to reveal) ──
  if (stage === 'sealed') {
    return (
      <div class="text-center py-8 space-y-6">
        <div class="text-6xl">{'\uD83D\uDDF3\uFE0F'}</div>
        <h3 class="text-2xl font-black text-gray-900">
          {'\u5168\u54E1\u306E\u6295\u7968\u304C\u63C3\u3044\u307E\u3057\u305F'}
        </h3>
        <p class="text-gray-500">
          {'\u958B\u7968\u3059\u308B\u3068\u3001\u5168\u54E1\u306E\u6295\u7968\u7D50\u679C\u304C\u8868\u793A\u3055\u308C\u307E\u3059'}
        </p>

        {/* Sealed vote indicators */}
        <div class="flex justify-center gap-3">
          {characters.map((c) => (
            <div
              key={c.id}
              class="w-12 h-12 rounded-full bg-red-100 border-2 border-red-300 flex items-center justify-center"
            >
              <span class="text-red-600 font-black text-sm">
                {c.name.charAt(0)}
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={handleReveal}
          class="px-10 py-5 bg-red-600 text-white rounded-xl text-xl font-black hover:bg-red-700 transition-all shadow-xl animate-pulse"
        >
          {'\uD83D\uDCE8 \u958B\u7968\u3059\u308B'}
        </button>
      </div>
    );
  }

  // ── Stage: Countdown (dramatic reveal) ──
  if (stage === 'countdown') {
    return (
      <div class="space-y-4">
        <div class="fixed inset-0 z-40 flex items-center justify-center bg-gradient-to-b from-red-900 to-red-800">
          <div class="text-center">
            <style>{`
              @keyframes vote-countdown-pop {
                0% { transform: scale(2); opacity: 0; }
                40% { transform: scale(1); opacity: 1; }
                100% { transform: scale(0.8); opacity: 0.6; }
              }
            `}</style>
            <div
              key={countdownNum}
              class="text-9xl font-black text-white"
              style="animation: vote-countdown-pop 0.9s ease-out"
            >
              {countdownNum}
            </div>
            <div class="text-xl text-red-200 mt-4 font-bold">
              {'\u958B\u7968\u307E\u3067\u2026'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Stage: Results ──
  return (
    <div class="space-y-5">
      <Confetti count={70} />
      <div class="bg-white rounded-xl border-2 border-red-300 p-6">
        <h4 class="font-black text-lg mb-4 text-center">
          {'\uD83D\uDCCA'} {'\u6295\u7968\u7D50\u679C'}
        </h4>
        <div class="space-y-3">
          {characters.map((c) => {
            const voteCount = Object.values(votes).filter(
              (v) => v === c.id,
            ).length;
            return (
              <div key={c.id} class="flex items-center gap-3">
                <span class="font-bold text-sm w-20 shrink-0">{c.name}</span>
                <div class="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                  <div
                    class="h-full bg-red-500 rounded-full transition-all duration-1000 ease-out flex items-center justify-end pr-2"
                    style={{
                      width: revealAnim
                        ? `${Math.max((voteCount / characters.length) * 100, voteCount > 0 ? 15 : 0)}%`
                        : '0%',
                    }}
                  >
                    {voteCount > 0 && (
                      <span class="text-xs font-bold text-white">
                        {voteCount}{'\u7968'}
                      </span>
                    )}
                  </div>
                </div>
                {voteCount === 0 && (
                  <span class="text-xs text-gray-400">0{'\u7968'}</span>
                )}
              </div>
            );
          })}
        </div>
        {/* Who voted for whom */}
        <div class="mt-4 pt-4 border-t border-gray-200 space-y-1">
          {characters.map((voter) => {
            const suspect = characters.find((c) => c.id === votes[voter.id]);
            return suspect ? (
              <div key={voter.id} class="text-sm text-gray-600">
                <span class="font-bold">{voter.name}</span>
                <span class="text-gray-400 mx-1">{'\u2192'}</span>
                <span>{suspect.name}</span>
              </div>
            ) : null;
          })}
        </div>
      </div>
    </div>
  );
}
