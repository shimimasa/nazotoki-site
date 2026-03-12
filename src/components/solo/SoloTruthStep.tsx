import Confetti from '../session/Confetti';
import SoloFeedback from './SoloFeedback';
import { BADGE_DEFS } from '../../lib/supabase';

interface FeedbackEntry {
  correct: boolean;
  goodPoints: string[];
  missedClues: string[];
  hint: string;
}

interface NextScenarioData {
  slug: string;
  title: string;
  seriesName: string;
  volume: number;
  subject: string;
  difficulty: string;
}

interface Props {
  rpEarned: number;
  revealedCount: number;
  witnessCount: number;
  readEvidenceCount: number;
  totalEvidenceCount: number;
  vote: string;
  voteReason: string;
  solutionHtml: string;
  challengeHtml: string;
  showConfetti: boolean;
  newBadges: string[];
  streakInfo: { streak: number; multiplier: number } | null;
  feedbackData: Record<string, FeedbackEntry> | null;
  nextScenario: NextScenarioData | null;
  currentSeriesName: string;
  // Perspective mode
  isPerspective: boolean;
  hypothesisSuspect: string;
  hypothesis: string;
}

export default function SoloTruthStep({
  rpEarned, revealedCount, witnessCount, readEvidenceCount, totalEvidenceCount,
  vote, voteReason, solutionHtml, challengeHtml, showConfetti, newBadges, streakInfo,
  feedbackData, nextScenario, currentSeriesName,
  isPerspective, hypothesisSuspect, hypothesis,
}: Props) {
  return (
    <div class="space-y-4">
      {showConfetti && <Confetti count={80} />}

      {/* Score card */}
      <div class="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 text-center">
        <p class="text-3xl mb-2">{'\uD83D\uDD0D'}</p>
        <p class="text-sm text-amber-700 font-bold">捜査完了！</p>
        <p class="text-3xl font-black text-amber-800 mt-1">{rpEarned} RP</p>
        <div class="flex justify-center gap-4 mt-3 text-xs text-amber-600">
          <span>証言 {revealedCount}/{witnessCount}</span>
          <span>証拠 {readEvidenceCount}/{totalEvidenceCount}</span>
          {vote && <span>投票: {vote}</span>}
        </div>
        {streakInfo && streakInfo.streak > 0 && (
          <div class="mt-3 pt-3 border-t border-amber-200 text-center">
            <span class="text-sm">
              {streakInfo.streak >= 7 ? '\uD83D\uDD25\uD83D\uDD25\uD83D\uDD25' : streakInfo.streak >= 3 ? '\uD83D\uDD25\uD83D\uDD25' : '\uD83D\uDD25'}
            </span>
            <span class="text-sm font-bold text-orange-700 ml-1">
              {streakInfo.streak}日連続！
            </span>
            {streakInfo.multiplier > 1.0 && (
              <span class="text-xs text-orange-600 ml-2">
                RP x{streakInfo.multiplier}
              </span>
            )}
          </div>
        )}
      </div>

      {/* New badge notification */}
      {newBadges.length > 0 && (
        <div class="bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-400 rounded-2xl p-4 text-center animate-fadeIn">
          <p class="text-sm font-black text-amber-800 mb-2">バッジ獲得！</p>
          <div class="flex justify-center gap-3">
            {newBadges.map(key => {
              const def = BADGE_DEFS.find(b => b.key === key);
              if (!def) return null;
              return (
                <div key={key} class="flex flex-col items-center gap-1">
                  <span class="text-3xl">{def.icon}</span>
                  <span class="text-xs font-bold text-amber-700">{def.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hypothesis recall (perspective mode) */}
      {isPerspective && hypothesisSuspect && (
        <div class="bg-purple-50 border border-purple-200 rounded-2xl p-4">
          <h3 class="text-sm font-black text-purple-700 mb-2">{'\uD83E\uDD14'} あなたの第一印象</h3>
          <p class="text-sm"><span class="font-bold">怪しいと思った人:</span> {hypothesisSuspect}</p>
          {hypothesis && <p class="text-sm mt-1 text-gray-600">「{hypothesis}」</p>}
          {vote && hypothesisSuspect !== vote && (
            <p class="text-xs text-purple-500 mt-2">
              {'\u2192'} 最終投票では「{vote}」に変更しました
            </p>
          )}
          {vote && hypothesisSuspect === vote && (
            <p class="text-xs text-green-600 mt-2">
              {'\u2192'} 最後まで考えが変わりませんでした！
            </p>
          )}
        </div>
      )}

      {/* Your reasoning */}
      {(vote || voteReason) && (
        <div class="bg-white rounded-2xl border border-gray-200 p-4">
          <h3 class="text-sm font-black text-gray-700 mb-2">あなたの推理</h3>
          {vote && <p class="text-sm"><span class="font-bold">選択:</span> {vote}</p>}
          {voteReason && <p class="text-sm mt-1"><span class="font-bold">理由:</span> {voteReason}</p>}
        </div>
      )}

      {/* Solo feedback */}
      <SoloFeedback votedFor={vote} feedbackData={feedbackData} />

      {/* Truth reveal */}
      <div class="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 class="font-black text-gray-900 text-center mb-4">{'\uD83D\uDCA1'} 真相</h2>
        <div class="solo-content text-sm" dangerouslySetInnerHTML={{ __html: solutionHtml }} />
      </div>

      {/* Challenge problems */}
      {challengeHtml && (
        <details class="bg-white rounded-2xl border-2 border-green-200 overflow-hidden">
          <summary class="px-5 py-4 cursor-pointer font-black text-green-800 text-sm hover:bg-green-50 transition-colors">
            {'\uD83C\uDFC6'} チャレンジ問題に挑戦する
          </summary>
          <div class="px-5 pb-5">
            <div class="solo-content text-sm" dangerouslySetInnerHTML={{ __html: challengeHtml }} />
          </div>
        </details>
      )}

      {/* Next scenario recommendation */}
      {nextScenario && (
        <a
          href={`/solo/${nextScenario.slug}`}
          class="block bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl p-4 hover:shadow-md transition-shadow"
        >
          <div class="flex items-center justify-between">
            <div class="flex-1 min-w-0">
              <p class="text-xs font-bold text-amber-600 mb-1">
                {nextScenario.seriesName === currentSeriesName ? '次のシナリオ' : '別シリーズに挑戦'}
              </p>
              <p class="text-sm font-black text-gray-900 truncate">{nextScenario.title}</p>
              <div class="flex gap-2 mt-1 text-xs text-gray-500">
                <span>{nextScenario.subject}</span>
                <span>{nextScenario.difficulty}</span>
              </div>
            </div>
            <div class="shrink-0 ml-3 w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center">
              <span class="text-white text-lg font-black">{'\u25B6'}</span>
            </div>
          </div>
        </a>
      )}

      {/* Actions */}
      <div class="flex gap-2">
        <a
          href="/my"
          class="flex-1 block py-3 bg-amber-500 text-white rounded-xl font-black text-sm text-center hover:bg-amber-600 transition-colors"
        >
          マイページへ
        </a>
        <a
          href="/"
          class="flex-1 block py-3 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm text-center hover:bg-gray-200 transition-colors"
        >
          トップに戻る
        </a>
      </div>
    </div>
  );
}
