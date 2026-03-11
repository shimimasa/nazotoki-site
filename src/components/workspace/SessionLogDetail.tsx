import { useState, useEffect, useMemo } from 'preact/hooks';
import {
  fetchSessionLogById,
  type SessionLogRow,
} from '../../lib/supabase';
import { exportSessionPDF } from './exportSessionPDF';
import { computeSessionMetrics } from '../../lib/session-analytics';
import { computeSessionInsights } from '../../lib/session-insights';
import RubricEvaluator from './RubricEvaluator';
import VoteAnalysis from './VoteAnalysis';
import VoteSummary from './VoteSummary';

const PHASE_LABELS: Record<string, string> = {
  intro: '導入',
  explore: '探索',
  twist: '反転',
  discuss: '議論',
  vote: '投票',
  truth: '真相',
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatMinSec(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}分${s > 0 ? `${String(s).padStart(2, '0')}秒` : ''}`;
}

interface Props {
  logId: string;
  cachedLog: SessionLogRow | null;
  onBack: () => void;
  role?: string | null;
}

export default function SessionLogDetail({ logId, cachedLog, onBack, role }: Props) {
  const [log, setLog] = useState<SessionLogRow | null>(cachedLog);
  const [loading, setLoading] = useState(!cachedLog);

  useEffect(() => {
    if (cachedLog) return;
    setLoading(true);
    fetchSessionLogById(logId).then((data) => {
      setLog(data);
      setLoading(false);
    });
  }, [logId, cachedLog]);

  if (loading) {
    return <div class="text-center py-12 text-gray-400">読み込み中...</div>;
  }

  if (!log) {
    return (
      <div class="text-center py-12 text-gray-500">
        授業ログが見つかりません
      </div>
    );
  }

  const title = log.scenario_title || log.scenario_slug;
  const totalDuration = log.duration || 0;
  const voteEntries = log.vote_results
    ? Object.entries(log.vote_results)
    : [];
  const correctSet = new Set(log.correct_players || []);

  return (
    <div class="space-y-6" id="session-log-detail">
      {/* Navigation */}
      <div class="flex items-center justify-between">
        <button
          onClick={onBack}
          class="text-amber-600 font-bold hover:text-amber-700"
        >
          ← 授業履歴に戻る
        </button>
        <button
          onClick={() => exportSessionPDF(log)}
          class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors"
        >
          PDF出力
        </button>
      </div>

      {/* Header */}
      <div class="bg-white rounded-xl p-6 border border-gray-200">
        <h2 class="text-2xl font-black">{title}</h2>
        <div class="text-sm text-gray-500 mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {log.start_time && (
            <span>開始: {formatDate(log.start_time)}</span>
          )}
          {log.end_time && (
            <span>終了: {formatDate(log.end_time)}</span>
          )}
          {totalDuration > 0 && (
            <span>授業時間: {formatMinSec(totalDuration)}</span>
          )}
          {log.environment && (
            <span>環境: {log.environment === 'classroom' ? '教室' : log.environment === 'dayservice' ? '放課後' : '家庭'}</span>
          )}
          {log.player_count && (
            <span>参加人数: {log.player_count}人</span>
          )}
          {log.teacher_name && (
            <span>教員: {log.teacher_name}</span>
          )}
        </div>
      </div>

      {/* Phase Durations */}
      {log.phase_durations && Object.keys(log.phase_durations).length > 0 && (
        <div class="bg-white rounded-xl p-6 border border-gray-200">
          <h3 class="font-bold text-lg mb-4">授業分析</h3>
          <div class="space-y-2">
            {Object.entries(log.phase_durations).map(([key, secs]) => {
              const total = Object.values(log.phase_durations!).reduce(
                (a, b) => a + b,
                0,
              );
              const pct = total > 0 ? Math.round((secs / total) * 100) : 0;
              return (
                <div key={key} class="flex items-center gap-3">
                  <div class="w-16 text-sm text-gray-600 font-medium">
                    {PHASE_LABELS[key] || key}
                  </div>
                  <div class="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                    <div
                      class="bg-amber-400 h-full rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div class="w-20 text-sm text-gray-500 text-right">
                    {formatMinSec(secs)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Vote Results */}
      {voteEntries.length > 0 && (
        <div class="bg-white rounded-xl p-6 border border-gray-200">
          <h3 class="font-bold text-lg mb-4">投票結果</h3>
          <div class="space-y-2">
            {voteEntries.map(([voterId, suspectId]) => {
              const reason = log.vote_reasons?.[voterId];
              // vote_results stores character IDs; correct_players stores character names
              // Try matching by both ID and name
              const isCorrect =
                correctSet.has(voterId) || correctSet.has(suspectId);

              return (
                <div
                  key={voterId}
                  class="bg-gray-50 rounded-lg px-4 py-3"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span
                        class={`text-xs font-black ${
                          isCorrect ? 'text-green-600' : 'text-amber-600'
                        }`}
                      >
                        {isCorrect ? '○' : '△'}
                      </span>
                      <span class="font-medium">{voterId}</span>
                      <span class="text-gray-300">→</span>
                      <span class="font-bold text-gray-700">{suspectId}</span>
                    </div>
                  </div>
                  {reason && (
                    <p class="text-xs text-gray-400 mt-1 ml-5">
                      「{reason}」
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {log.correct_players && log.correct_players.length > 0 && (
            <div class="mt-3 pt-3 border-t border-gray-200 text-sm text-gray-600">
              正解者: {log.correct_players.join('、')}（
              {log.correct_players.length}/{voteEntries.length}人）
            </div>
          )}
        </div>
      )}

      {/* Vote Summary — all teachers (Phase 104) */}
      {voteEntries.length > 0 && log.vote_results && (
        <div class="bg-white rounded-xl p-6 border border-gray-200">
          <h3 class="font-bold text-lg mb-4">投票集計</h3>
          <VoteSummary
            voteResults={log.vote_results}
            voteReasons={log.vote_reasons}
            correctPlayers={log.correct_players}
          />
        </div>
      )}

      {/* AI Vote Analysis — admin only (Phase 104) */}
      {role === 'admin' && voteEntries.length > 0 && log.teacher_id && (
        <div class="bg-white rounded-xl p-6 border border-gray-200">
          <h3 class="font-bold text-lg mb-4">AI分析（管理者限定）</h3>
          <VoteAnalysis
            sessionLogId={log.id}
            voteData={voteEntries.map(([voterId, suspectId]) => ({
              studentName: voterId,
              votedFor: suspectId,
              reason: log.vote_reasons?.[voterId] || '',
            }))}
          />
        </div>
      )}

      {/* Evidence */}
      {log.discovered_evidence && log.discovered_evidence.length > 0 && (
        <div class="bg-white rounded-xl p-6 border border-gray-200">
          <h3 class="font-bold text-lg mb-4">発見証拠</h3>
          <div class="flex flex-wrap gap-2">
            {log.discovered_evidence.map((num) => (
              <span
                key={num}
                class="inline-flex items-center gap-1 bg-green-50 text-green-700 px-3 py-1.5 rounded-full text-sm font-bold border border-green-200"
              >
                証拠 {num}
              </span>
            ))}
          </div>
          {log.twist_revealed && (
            <p class="text-xs text-amber-600 font-bold mt-2">
              反転証拠 公開済み
            </p>
          )}
        </div>
      )}

      {/* Reflections */}
      {log.reflections && log.reflections.length > 0 && (
        <div class="bg-white rounded-xl p-6 border border-gray-200">
          <h3 class="font-bold text-lg mb-4">振り返り</h3>
          <div class="space-y-2">
            {log.reflections.map((text, i) => (
              <div key={i} class="bg-blue-50 rounded-lg px-4 py-3 border border-blue-100">
                <p class="text-gray-800">{text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GM Memo */}
      {log.gm_memo && log.gm_memo.trim() !== '' && (
        <div class="bg-white rounded-xl p-6 border border-gray-200">
          <h3 class="font-bold text-lg mb-4">GMメモ</h3>
          <div class="bg-amber-50 rounded-lg p-4 border border-amber-200">
            <p class="text-gray-800 whitespace-pre-wrap">{log.gm_memo}</p>
          </div>
        </div>
      )}

      {/* Rubric Evaluation (Phase 97) */}
      {log.teacher_id && (
        <div class="bg-white rounded-xl p-6 border border-gray-200">
          <h3 class="font-bold text-lg mb-4">ルーブリック評価</h3>
          <RubricEvaluator
            sessionLogId={log.id}
            teacherId={log.teacher_id}
            scenarioSlug={log.scenario_slug}
            classId={log.class_id}
          />
        </div>
      )}

      {/* Session Insights */}
      <SessionInsightsCard log={log} />
    </div>
  );
}

function SessionInsightsCard({ log }: { log: SessionLogRow }) {
  const insights = useMemo(() => {
    const metrics = computeSessionMetrics(log);
    return computeSessionInsights(metrics);
  }, [log]);

  if (insights.observations.length === 0 && insights.suggestions.length === 0) {
    return null;
  }

  return (
    <div class="bg-white rounded-xl p-6 border border-gray-200">
      <h3 class="font-bold text-lg mb-4">授業所見</h3>
      {insights.observations.length > 0 && (
        <div class="mb-4">
          <div class="text-xs font-bold text-blue-600 mb-2">所見</div>
          <ul class="space-y-1.5">
            {insights.observations.map((ins, i) => (
              <li key={i} class="text-sm text-gray-700 flex items-start gap-2">
                <span class="text-blue-400 mt-0.5 shrink-0">-</span>
                {ins.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      {insights.suggestions.length > 0 && (
        <div>
          <div class="text-xs font-bold text-amber-600 mb-2">次回への提案</div>
          <ul class="space-y-1.5">
            {insights.suggestions.map((ins, i) => (
              <li key={i} class="text-sm text-gray-700 flex items-start gap-2">
                <span class="text-amber-400 mt-0.5 shrink-0">-</span>
                {ins.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
