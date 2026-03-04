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
  return (
    <div class="space-y-4">
      <div class="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
        <p class="font-bold">🗳️ 投票タイム</p>
        <p class="mt-1">
          各プレイヤーが「犯人だと思うキャラクター」に投票します。
          GMが代わりに入力してください。
        </p>
      </div>

      <div class="space-y-3">
        {characters.map((voter) => (
          <div
            key={voter.id}
            class="bg-white rounded-xl border border-gray-200 p-4"
          >
            <p class="font-bold text-sm mb-2">
              {voter.name}
              <span class="text-gray-400 font-normal ml-1">の投票:</span>
            </p>
            <div class="flex flex-wrap gap-2">
              {characters
                .filter((c) => c.id !== voter.id)
                .map((suspect) => (
                  <button
                    key={suspect.id}
                    onClick={() => onVote(voter.id, suspect.id)}
                    class={`px-3 py-2 rounded-lg text-sm font-bold transition-all ${
                      votes[voter.id] === suspect.id
                        ? 'bg-red-500 text-white ring-2 ring-red-300'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {suspect.name}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>

      {/* 投票結果サマリー */}
      {Object.keys(votes).length > 0 && (
        <div class="bg-gray-50 rounded-xl border border-gray-200 p-4">
          <h4 class="font-bold text-sm mb-2">投票結果</h4>
          <div class="space-y-1 text-sm">
            {characters.map((c) => {
              const voteCount = Object.values(votes).filter(
                (v) => v === c.id,
              ).length;
              if (voteCount === 0) return null;
              return (
                <div key={c.id} class="flex items-center gap-2">
                  <span class="font-bold">{c.name}</span>
                  <span class="text-gray-400">←</span>
                  <span>
                    {voteCount}票
                  </span>
                  <div
                    class="h-2 bg-red-400 rounded-full"
                    style={{ width: `${(voteCount / characters.length) * 100}%`, minWidth: '8px' }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
