import { useState, useEffect } from 'preact/hooks';
import type { SessionRun, SessionParticipant } from './types';
import FeedbackForm from './FeedbackForm';
import { recommendScenarios, type RecommendScenarioMeta } from '../../../lib/recommend';

interface ScenarioJson {
  culprit_name: string | null;
  [key: string]: unknown;
}

interface Props {
  sessionRun: SessionRun | null;
  participant: SessionParticipant | null;
  votedFor: string;
  voteReason: string;
  onReset: () => void;
}

// ============================================================
// VoteResultsCard — animated bar chart
// ============================================================

function VoteResultsCard({ charNames, votes, myVote }: {
  charNames: string[];
  votes: Record<string, string>;
  myVote: string | null;
}) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 200);
    return () => clearTimeout(t);
  }, []);

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
          .map(([name, count], i) => {
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
                    class={`h-full rounded-full ${
                      isMyVote ? 'bg-amber-400' : 'bg-sky-300'
                    }`}
                    style={{
                      width: animated ? `${pct}%` : '0%',
                      transition: `width 0.8s ease-out ${i * 150}ms`,
                    }}
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

// ============================================================
// ScenarioRecommendations — next scenario cards
// ============================================================

function ScenarioRecommendations({ currentSlug }: { currentSlug: string }) {
  const [recommendations, setRecommendations] = useState<
    { slug: string; title: string; seriesName: string; reason: string }[]
  >([]);

  useEffect(() => {
    if (!currentSlug) return;
    let cancelled = false;
    fetch('/data/scenario-index.json')
      .then((r) => r.ok ? r.json() : null)
      .then((all: RecommendScenarioMeta[] | null) => {
        if (cancelled || !all) return;
        const results = recommendScenarios(all, [currentSlug], null, 3);
        setRecommendations(results);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentSlug]);

  if (recommendations.length === 0) return null;

  return (
    <div class="bg-white rounded-xl border-2 border-gray-200 p-4 space-y-3">
      <h3 class="text-sm font-black text-gray-500 text-center">
        {'\uD83D\uDD0D'} 次におすすめ
      </h3>
      <div class="space-y-2">
        {recommendations.map((r) => (
          <a
            key={r.slug}
            href={`/solo/${r.slug}`}
            class="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 hover:bg-amber-50 transition-colors group"
          >
            <div class="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-sm shrink-0 group-hover:bg-amber-200 transition-colors">
              {'\uD83D\uDD0D'}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-bold text-gray-900 truncate">{r.title}</p>
              <p class="text-xs text-gray-400">{r.seriesName} ・ {r.reason}</p>
            </div>
            <span class="text-gray-300 text-xs shrink-0">{'\u203A'}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// SessionRP — animated RP reward display
// ============================================================

function SessionRP({ hasVoted, discoveredCount, totalEvidence, isCorrect }: {
  hasVoted: boolean;
  discoveredCount: number;
  totalEvidence: number;
  isCorrect: boolean | null;
}) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 400);
    return () => clearTimeout(t);
  }, []);

  const rewards = [
    { label: 'セッション参加', rp: 10, earned: true },
    { label: '投票完了', rp: 10, earned: hasVoted },
    { label: '証拠コンプリート', rp: 5, earned: totalEvidence > 0 && discoveredCount >= totalEvidence },
    ...(isCorrect !== null ? [{ label: '\u2B50 \u6B63\u89E3\u30DC\u30FC\u30CA\u30B9', rp: 10, earned: isCorrect }] : []),
  ];

  const totalRP = rewards.filter(r => r.earned).reduce((s, r) => s + r.rp, 0);

  return (
    <div class="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-xl border-2 border-amber-300 p-4 space-y-3">
      <style>{`
        @keyframes rp-count-up {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <div class="text-center">
        <p class="text-sm font-bold text-amber-600">獲得RP</p>
        <div
          class="text-4xl font-black text-amber-700 mt-1"
          style={animated ? 'animation: rp-count-up 0.6s ease-out' : 'opacity: 0'}
        >
          +{totalRP} RP
        </div>
      </div>
      <div class="space-y-1.5">
        {rewards.map((r, i) => (
          <div
            key={r.label}
            class={`flex items-center justify-between text-sm px-2 py-1 rounded-lg transition-all ${
              r.earned ? 'bg-white/70' : 'opacity-40'
            }`}
            style={animated ? { transitionDelay: `${i * 150}ms` } : undefined}
          >
            <span class={`font-bold ${r.earned ? 'text-gray-700' : 'text-gray-400 line-through'}`}>
              {r.earned ? '\u2705' : '\u2B1C'} {r.label}
            </span>
            <span class={`font-mono font-bold ${r.earned ? 'text-amber-600' : 'text-gray-400'}`}>
              +{r.rp}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// EndScreen
// ============================================================

export default function EndScreen({ sessionRun, participant, votedFor, voteReason, onReset }: Props) {
  const myVote = votedFor || participant?.voted_for || null;
  const myReason = voteReason || participant?.vote_reason || null;
  const charNames = (sessionRun?.character_names as string[]) || [];
  const allVotes = (sessionRun?.votes as Record<string, string>) || {};
  const discoveredCount = ((sessionRun?.discovered_evidence as number[]) || []).length;
  const totalEvidence = ((sessionRun?.evidence_titles as { number: number; title: string }[]) || []).length;

  // Phase 161: Fetch culprit name for vote correctness
  const [culpritName, setCulpritName] = useState<string | null>(null);
  useEffect(() => {
    const slug = sessionRun?.scenario_slug;
    if (!slug) return;
    let cancelled = false;
    fetch(`/data/scenarios/${slug}.json`)
      .then((r) => r.ok ? r.json() as Promise<ScenarioJson> : null)
      .then((data) => {
        if (!cancelled && data?.culprit_name) setCulpritName(data.culprit_name);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sessionRun?.scenario_slug]);

  const isCorrect = myVote && culpritName
    ? myVote.includes(culpritName) || culpritName.includes(myVote)
    : null;

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

        {/* Session RP reward */}
        <SessionRP
          hasVoted={!!myVote}
          discoveredCount={discoveredCount}
          totalEvidence={totalEvidence}
          isCorrect={isCorrect}
        />

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
              <div class="flex justify-between items-center">
                <span class="text-gray-500">投票</span>
                <span class="flex items-center gap-2">
                  <span class="font-bold">{myVote}</span>
                  {isCorrect !== null && (
                    <span class={`text-xs font-black px-2 py-0.5 rounded-full ${
                      isCorrect
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {isCorrect ? '\u2B50 \u6B63\u89E3\uFF01' : '\u60DC\u3057\u3044\uFF01'}
                    </span>
                  )}
                </span>
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

        {/* Next scenario recommendations */}
        {sessionRun?.scenario_slug && (
          <ScenarioRecommendations currentSlug={sessionRun.scenario_slug} />
        )}

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
