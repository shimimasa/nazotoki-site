import { useState } from 'preact/hooks';
import type { CharacterData } from '../types';

interface VotePhaseProps {
  characters: CharacterData[];
  votes: Record<string, string>;
  onVote: (voterId: string, suspectId: string) => void;
}

export default function VotePhase({
  characters,
  votes,
  onVote,
}: VotePhaseProps) {
  const [showResults, setShowResults] = useState(false);
  const [revealAnim, setRevealAnim] = useState(false);

  const votedCount = Object.keys(votes).length;
  const allVoted = votedCount === characters.length;

  const handleReveal = () => {
    setShowResults(true);
    setTimeout(() => setRevealAnim(true), 100);
  };

  return (
    <div class="space-y-4">
      <div class="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
        <p class="font-bold">{'\uD83D\uDDF3\uFE0F'} 投票タイム</p>
        <p class="mt-1">
          各プレイヤーが自分の考えを投票します。
          GMが代わりに入力してください。
        </p>
      </div>

      {/* Vote progress */}
      <div class="flex items-center gap-2 text-sm font-bold text-gray-600">
        <span>投票状況:</span>
        <span class={votedCount > 0 ? 'text-red-600' : ''}>
          {votedCount} / {characters.length}
        </span>
        {allVoted && !showResults && (
          <span class="text-green-600 ml-2">{'\u2714'} 全員投票完了！</span>
        )}
      </div>

      {/* Voting cards */}
      <div class="space-y-3">
        {characters.map((voter) => {
          const hasVoted = voter.id in votes;
          return (
            <div
              key={voter.id}
              class={`bg-white rounded-xl border p-4 transition-all ${
                hasVoted ? 'border-green-300 bg-green-50/30' : 'border-gray-200'
              }`}
            >
              <div class="flex items-center justify-between mb-2">
                <p class="font-bold text-sm">
                  {voter.name}
                  <span class="text-gray-400 font-normal ml-1">の投票:</span>
                </p>
                {hasVoted && (
                  <span class="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                    投票済み
                  </span>
                )}
              </div>
              <div class="flex flex-wrap gap-2">
                {characters
                  .filter((c) => c.id !== voter.id)
                  .map((suspect) => {
                    const isSelected = votes[voter.id] === suspect.id;
                    return (
                      <button
                        key={suspect.id}
                        onClick={() => onVote(voter.id, suspect.id)}
                        disabled={showResults}
                        class={`px-3 py-2 rounded-lg text-sm font-bold transition-all ${
                          isSelected
                            ? 'bg-red-500 text-white ring-2 ring-red-300'
                            : showResults
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {suspect.name}
                      </button>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reveal button or results */}
      {!showResults ? (
        <button
          onClick={handleReveal}
          disabled={!allVoted}
          class={`w-full py-4 rounded-xl text-lg font-black transition-all ${
            allVoted
              ? 'bg-red-600 text-white hover:bg-red-700 shadow-lg animate-pulse'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {allVoted
            ? `${'\uD83D\uDCE8'} 開票する`
            : `残り ${characters.length - votedCount} 人の投票を待っています...`}
        </button>
      ) : (
        <div class="bg-white rounded-xl border-2 border-red-300 p-6">
          <h4 class="font-black text-lg mb-4 text-center">
            {'\uD83D\uDCCA'} 投票結果
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
                          {voteCount}票
                        </span>
                      )}
                    </div>
                  </div>
                  {voteCount === 0 && (
                    <span class="text-xs text-gray-400">0票</span>
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
      )}
    </div>
  );
}
