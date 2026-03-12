import type { SessionRun, SessionParticipant } from './types';
import FeedbackForm from './FeedbackForm';

interface Props {
  sessionRun: SessionRun | null;
  participant: SessionParticipant | null;
  votedFor: string;
  voteReason: string;
  onReset: () => void;
}

function VoteResultsCard({ charNames, votes, myVote }: {
  charNames: string[];
  votes: Record<string, string>;
  myVote: string | null;
}) {
  const voteEntries = Object.values(votes);
  const totalVotes = voteEntries.length;
  if (totalVotes === 0) return null;

  const voteCounts: Record<string, number> = {};
  for (const name of charNames) voteCounts[name] = 0;
  for (const v of voteEntries) {
    if (voteCounts[v] !== undefined) voteCounts[v]++;
    else voteCounts[v] = (voteCounts[v] || 0) + 1;
  }
  const maxCount = Math.max(...Object.values(voteCounts), 1);

  return (
    <div class="bg-white rounded-xl border-2 border-gray-200 p-4 space-y-3">
      <h3 class="text-sm font-black text-gray-500 text-center">
        {'\uD83D\uDDF3\uFE0F'} みんなの投票結果
      </h3>
      <div class="space-y-2">
        {Object.entries(voteCounts)
          .sort(([, a], [, b]) => b - a)
          .map(([name, count]) => {
            const pct = Math.round((count / maxCount) * 100);
            const isMyVote = name === myVote;
            return (
              <div key={name} class="space-y-0.5">
                <div class="flex items-center justify-between text-sm">
                  <span class={`font-bold ${isMyVote ? 'text-amber-700' : 'text-gray-700'}`}>
                    {isMyVote && '\u25B6 '}{name}
                  </span>
                  <span class={`font-mono font-bold ${isMyVote ? 'text-amber-700' : 'text-gray-500'}`}>
                    {count}{'\u7968'}
                  </span>
                </div>
                <div class="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    class={`h-full rounded-full transition-all ${
                      isMyVote ? 'bg-amber-400' : 'bg-sky-300'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

export { VoteResultsCard };

export default function EndScreen({ sessionRun, participant, votedFor, voteReason, onReset }: Props) {
  const myVote = votedFor || participant?.voted_for || null;
  const myReason = voteReason || participant?.vote_reason || null;
  const charNames = (sessionRun?.character_names as string[]) || [];
  const allVotes = (sessionRun?.votes as Record<string, string>) || {};
  const discoveredCount = ((sessionRun?.discovered_evidence as number[]) || []).length;
  const totalEvidence = ((sessionRun?.evidence_titles as { number: number; title: string }[]) || []).length;

  return (
    <div class="min-h-[80dvh] flex items-center justify-center px-4 py-8">
      <div class="w-full max-w-sm space-y-5">
        {/* Header */}
        <div class="text-center space-y-2">
          <div class="text-5xl">{'\uD83C\uDF89'}</div>
          <h2 class="text-2xl font-black text-gray-900">セッション終了！</h2>
          {sessionRun?.scenario_title && (
            <p class="text-amber-700 font-bold text-sm">{sessionRun.scenario_title}</p>
          )}
        </div>

        {/* My participation summary */}
        <div class="bg-white rounded-xl border-2 border-gray-200 p-4 space-y-3">
          <h3 class="text-sm font-black text-gray-500 text-center">あなたの記録</h3>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-500">名前</span>
              <span class="font-bold">{participant?.participant_name}</span>
            </div>
            {participant?.assigned_character && (
              <div class="flex justify-between">
                <span class="text-gray-500">役割</span>
                <span class="font-bold text-amber-700">{'\uD83C\uDFAD'} {participant.assigned_character}</span>
              </div>
            )}
            {myVote && (
              <div class="flex justify-between">
                <span class="text-gray-500">投票</span>
                <span class="font-bold">{myVote}</span>
              </div>
            )}
            {myReason && (
              <div class="pt-1 border-t border-gray-100">
                <p class="text-gray-500 text-xs mb-1">あなたの推理</p>
                <p class="text-gray-700 text-sm">「{myReason}」</p>
              </div>
            )}
            {totalEvidence > 0 && (
              <div class="flex justify-between">
                <span class="text-gray-500">発見した証拠</span>
                <span class="font-bold">{discoveredCount}/{totalEvidence}</span>
              </div>
            )}
          </div>
        </div>

        {/* Vote results */}
        <VoteResultsCard charNames={charNames} votes={allVotes} myVote={myVote} />

        {/* Feedback form */}
        <FeedbackForm
          participantId={participant?.id || ''}
          sessionToken={participant?.session_token || ''}
        />

        {/* Navigation after session */}
        <div class="space-y-2 pt-2">
          <p class="text-gray-500 text-sm text-center">お疲れ様でした！</p>
          {sessionRun?.scenario_slug && (
            <a
              href={`/solo/${sessionRun.scenario_slug}`}
              class="block w-full py-3 bg-amber-500 text-white rounded-xl font-black text-sm text-center hover:bg-amber-600 transition-colors"
            >
              ソロモードで復習する
            </a>
          )}
          <a
            href="/my"
            class="block w-full py-3 bg-blue-500 text-white rounded-xl font-black text-sm text-center hover:bg-blue-600 transition-colors"
          >
            マイページへ
          </a>
          <button
            onClick={onReset}
            class="w-full py-3 bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300 active:bg-gray-400 transition-colors"
          >
            トップに戻る
          </button>
        </div>
      </div>
    </div>
  );
}
