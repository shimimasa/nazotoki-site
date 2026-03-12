import { useState, useEffect, useMemo } from 'preact/hooks';
import { PHASE_CONFIG } from './types';
import type { EvidenceCardData, CharacterData } from './types';
import type { SessionParticipant } from '../../lib/session-realtime';
import type { StudentRow } from '../../lib/supabase';
import type { SessionFeedbackRow } from '../../lib/supabase-client';
import FeedbackSummary from './FeedbackSummary';

interface GmControlPanelProps {
  currentStep: number;
  skipTwist: boolean;
  onGoToStep: (step: number) => void;
  onNext: () => void;
  onPrev: () => void;
  timerSeconds: number;
  timerRunning: boolean;
  onTimerToggle: () => void;
  onTimerReset: (seconds: number) => void;
  timerDefaultSeconds: number;
  isProjectorMode: boolean;
  onToggleProjector: () => void;
  onClose: () => void;
  isFirstPhase: boolean;
  isLastPhase: boolean;
  onComplete: () => void;
  saving: boolean;
  // Dashboard props
  scenarioTitle: string;
  startedAt: Date | null;
  completed: boolean;
  discoveredCards: Set<number>;
  evidenceCards: EvidenceCardData[];
  evidence5: EvidenceCardData | null;
  twistRevealed: boolean;
  votes: Record<string, string>;
  voteReasons: Record<string, string>;
  characters: CharacterData[];
  gmMemo: string;
  onGmMemoChange: (value: string) => void;
  truthHtml: string;
  stepStartTimes: number[];
  // Realtime (Phase 56)
  joinCode: string | null;
  participants: SessionParticipant[];
  // Character assignment (Phase 61)
  characterNames: string[];
  onAssignCharacter: (participantId: string, characterName: string | null) => void;
  onAutoAssign: () => void;
  // Student link (Phase 62)
  classStudents: StudentRow[];
  onLinkStudent: (participantId: string, studentId: string | null) => void;
  // Phase 86: heartbeat last_seen_at (separate from participants state to avoid re-render)
  lastSeenMap: Record<string, string>;
  // Phase 117: student feedback
  feedbackSummary: SessionFeedbackRow[];
}

function extractCulprit(truthHtml: string): string | null {
  const text = truthHtml.replace(/<[^>]+>/g, '');
  const match = text.match(/\u72AF\u4EBA[:：]\s*(.+?)(?:\*|（|$|\n)/);
  if (!match) return null;
  return match[1].replace(/\*+/g, '').trim() || null;
}

function formatDuration(startedAt: Date | null): string {
  if (!startedAt) return '--:--';
  const diff = Math.floor((Date.now() - startedAt.getTime()) / 1000);
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

type PanelTab = 'control' | 'dashboard';

export default function GmControlPanel({
  currentStep,
  skipTwist,
  onGoToStep,
  onNext,
  onPrev,
  timerSeconds,
  timerRunning,
  onTimerToggle,
  onTimerReset,
  timerDefaultSeconds,
  isProjectorMode,
  onToggleProjector,
  onClose,
  isFirstPhase,
  isLastPhase,
  onComplete,
  saving,
  scenarioTitle,
  startedAt,
  completed,
  discoveredCards,
  evidenceCards,
  evidence5,
  twistRevealed,
  votes,
  voteReasons,
  characters,
  gmMemo,
  onGmMemoChange,
  truthHtml,
  stepStartTimes,
  joinCode,
  participants,
  characterNames,
  onAssignCharacter,
  onAutoAssign,
  classStudents,
  onLinkStudent,
  lastSeenMap,
  feedbackSummary,
}: GmControlPanelProps) {
  const [tab, setTab] = useState<PanelTab>('control');

  const phases = skipTwist
    ? PHASE_CONFIG.filter((p) => p.key !== 'twist')
    : [...PHASE_CONFIG];
  const navigablePhases = phases.filter((p) => p.key !== 'prep');

  const currentPhase = PHASE_CONFIG[currentStep];

  const mm = Math.floor(Math.abs(timerSeconds) / 60)
    .toString()
    .padStart(2, '0');
  const ss = Math.abs(timerSeconds % 60)
    .toString()
    .padStart(2, '0');
  const isOvertime = timerSeconds < 0;
  const isUrgent = !isOvertime && timerSeconds > 0 && timerSeconds <= 60;

  const culpritName = useMemo(() => extractCulprit(truthHtml), [truthHtml]);

  const hasVotes = Object.keys(votes).length > 0;

  return (
    <>
      {/* Backdrop */}
      <div
        class="fixed inset-0 z-30 bg-black/30"
        onClick={onClose}
      />

      {/* Panel */}
      <div class="fixed right-0 top-0 bottom-0 z-40 w-80 bg-white shadow-2xl border-l border-gray-200 flex flex-col">
        {/* Header */}
        <div class="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-2">
            <span class="text-lg">{'\uD83C\uDFAE'}</span>
            <span class="font-black text-sm">GM {'\u30B3\u30F3\u30C8\u30ED\u30FC\u30EB'}</span>
          </div>
          <button
            onClick={onClose}
            class="w-8 h-8 rounded-full hover:bg-indigo-500 flex items-center justify-center transition-colors"
          >
            {'\u2715'}
          </button>
        </div>

        {/* Tabs */}
        <div class="flex border-b border-gray-200 shrink-0">
          <button
            onClick={() => setTab('control')}
            class={`flex-1 py-2.5 text-sm font-bold transition-colors ${
              tab === 'control'
                ? 'text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            {'\u2699\uFE0F \u64CD\u4F5C'}
          </button>
          <button
            onClick={() => setTab('dashboard')}
            class={`flex-1 py-2.5 text-sm font-bold transition-colors ${
              tab === 'dashboard'
                ? 'text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            {'\uD83D\uDCCB \u6388\u696D'}
          </button>
        </div>

        {/* Tab content */}
        <div class="flex-1 overflow-y-auto">
          {tab === 'control' ? (
            <ControlTab
              navigablePhases={navigablePhases}
              currentStep={currentStep}
              onGoToStep={onGoToStep}
              onNext={onNext}
              onPrev={onPrev}
              isFirstPhase={isFirstPhase}
              isLastPhase={isLastPhase}
              onComplete={onComplete}
              saving={saving}
              timerSeconds={timerSeconds}
              timerRunning={timerRunning}
              onTimerToggle={onTimerToggle}
              onTimerReset={onTimerReset}
              timerDefaultSeconds={timerDefaultSeconds}
              mm={mm}
              ss={ss}
              isOvertime={isOvertime}
              isUrgent={isUrgent}
              isProjectorMode={isProjectorMode}
              onToggleProjector={onToggleProjector}
            />
          ) : (
            <DashboardTab
              scenarioTitle={scenarioTitle}
              currentPhase={currentPhase}
              timerSeconds={timerSeconds}
              timerRunning={timerRunning}
              mm={mm}
              ss={ss}
              isOvertime={isOvertime}
              isProjectorMode={isProjectorMode}
              startedAt={startedAt}
              completed={completed}
              discoveredCards={discoveredCards}
              evidenceCards={evidenceCards}
              evidence5={evidence5}
              twistRevealed={twistRevealed}
              votes={votes}
              voteReasons={voteReasons}
              characters={characters}
              culpritName={culpritName}
              hasVotes={hasVotes}
              gmMemo={gmMemo}
              onGmMemoChange={onGmMemoChange}
              stepStartTimes={stepStartTimes}
              skipTwist={skipTwist}
              joinCode={joinCode}
              participants={participants}
              characterNames={characterNames}
              onAssignCharacter={onAssignCharacter}
              onAutoAssign={onAutoAssign}
              classStudents={classStudents}
              onLinkStudent={onLinkStudent}
              lastSeenMap={lastSeenMap}
              feedbackSummary={feedbackSummary}
            />
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Control Tab (existing functionality) ─── */

interface ControlTabProps {
  navigablePhases: typeof PHASE_CONFIG;
  currentStep: number;
  onGoToStep: (step: number) => void;
  onNext: () => void;
  onPrev: () => void;
  isFirstPhase: boolean;
  isLastPhase: boolean;
  onComplete: () => void;
  saving: boolean;
  timerSeconds: number;
  timerRunning: boolean;
  onTimerToggle: () => void;
  onTimerReset: (seconds: number) => void;
  timerDefaultSeconds: number;
  mm: string;
  ss: string;
  isOvertime: boolean;
  isUrgent: boolean;
  isProjectorMode: boolean;
  onToggleProjector: () => void;
}

function ControlTab({
  navigablePhases,
  currentStep,
  onGoToStep,
  onNext,
  onPrev,
  isFirstPhase,
  isLastPhase,
  onComplete,
  saving,
  timerSeconds,
  timerRunning,
  onTimerToggle,
  onTimerReset,
  timerDefaultSeconds,
  mm,
  ss,
  isOvertime,
  isUrgent,
  isProjectorMode,
  onToggleProjector,
}: ControlTabProps) {
  return (
    <div class="p-4 space-y-5">
      {/* Phase navigation */}
      <section>
        <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
          {'\u30D5\u30A7\u30FC\u30BA\u64CD\u4F5C'}
        </h4>
        <div class="flex gap-2 mb-3">
          <button
            onClick={onPrev}
            disabled={isFirstPhase}
            class={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors ${
              isFirstPhase
                ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {'\u25C0 \u524D\u3078'}
          </button>
          {isLastPhase ? (
            <button
              onClick={onComplete}
              disabled={saving}
              class={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                saving
                  ? 'bg-gray-300 text-gray-500 cursor-wait'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {saving ? '\u4FDD\u5B58\u4E2D...' : '\u2713 \u5B8C\u4E86'}
            </button>
          ) : (
            <button
              onClick={onNext}
              class="flex-1 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 transition-colors"
            >
              {'\u6B21\u3078 \u25B6'}
            </button>
          )}
        </div>

        {/* Phase list */}
        <div class="space-y-1">
          {navigablePhases.map((phase) => {
            const originalIndex = PHASE_CONFIG.findIndex(
              (p) => p.key === phase.key,
            );
            const isActive = originalIndex === currentStep;
            const isDone = originalIndex < currentStep;
            return (
              <button
                key={phase.key}
                onClick={() => onGoToStep(originalIndex)}
                class={`w-full px-3 py-2 rounded-lg text-left text-sm font-bold flex items-center gap-2 transition-all ${
                  isActive
                    ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-400'
                    : isDone
                      ? 'bg-green-50 text-green-700 hover:bg-green-100'
                      : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
              >
                <span>{isDone ? '\u2713' : phase.icon}</span>
                <span>{phase.label}</span>
                {isActive && (
                  <span class="ml-auto text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded">
                    {'\u73FE\u5728'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Timer controls */}
      {timerDefaultSeconds > 0 && (
        <section>
          <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            {'\u30BF\u30A4\u30DE\u30FC'}
          </h4>
          <div
            class={`text-center py-3 rounded-lg mb-2 ${
              isOvertime
                ? 'bg-red-50 text-red-600'
                : isUrgent
                  ? 'bg-red-50 text-red-600 animate-pulse'
                  : 'bg-gray-50 text-gray-900'
            }`}
          >
            <div class="font-mono font-black text-3xl tabular-nums">
              {isOvertime && '-'}
              {mm}:{ss}
            </div>
          </div>
          <div class="grid grid-cols-4 gap-1">
            <button
              onClick={onTimerToggle}
              class={`col-span-2 py-2 rounded-lg text-sm font-bold transition-colors ${
                timerRunning
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {timerRunning
                ? '\u23F8 \u505C\u6B62'
                : '\u25B6 \u958B\u59CB'}
            </button>
            <button
              onClick={() => onTimerReset(timerSeconds + 60)}
              class="py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-200 transition-colors"
            >
              +1{'\u5206'}
            </button>
            <button
              onClick={() => onTimerReset(timerSeconds + 180)}
              class="py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-200 transition-colors"
            >
              +3{'\u5206'}
            </button>
          </div>
          <button
            onClick={() => onTimerReset(timerDefaultSeconds)}
            class="w-full mt-1 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-xs font-bold hover:bg-gray-200 transition-colors"
          >
            {'\u21BA \u30EA\u30BB\u30C3\u30C8'}
          </button>
        </section>
      )}

      {/* Display settings */}
      <section>
        <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
          {'\u8868\u793A\u8A2D\u5B9A'}
        </h4>
        <button
          onClick={onToggleProjector}
          class={`w-full px-3 py-3 rounded-lg text-sm font-bold flex items-center justify-between transition-all ${
            isProjectorMode
              ? 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-300'
              : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
          }`}
        >
          <span class="flex items-center gap-2">
            <span>{isProjectorMode ? '\uD83D\uDCFD\uFE0F' : '\uD83D\uDDA5\uFE0F'}</span>
            <span>{'\u6295\u5F71\u30E2\u30FC\u30C9'}</span>
          </span>
          <span
            class={`px-2 py-0.5 rounded text-xs font-black ${
              isProjectorMode
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            {isProjectorMode ? 'ON' : 'OFF'}
          </span>
        </button>
        {isProjectorMode && (
          <p class="text-xs text-indigo-600 mt-1.5 px-1">
            {'\u6559\u5BA4\u30B9\u30AF\u30EA\u30FC\u30F3\u5411\u3051\u306B\u6587\u5B57\u3092\u5927\u304D\u304F\u8868\u793A\u3057\u307E\u3059'}
          </p>
        )}
      </section>
    </div>
  );
}

/* ─── Dashboard Tab (new) ─── */

interface DashboardTabProps {
  scenarioTitle: string;
  currentPhase: (typeof PHASE_CONFIG)[number] | undefined;
  timerSeconds: number;
  timerRunning: boolean;
  mm: string;
  ss: string;
  isOvertime: boolean;
  isProjectorMode: boolean;
  startedAt: Date | null;
  completed: boolean;
  discoveredCards: Set<number>;
  evidenceCards: EvidenceCardData[];
  evidence5: EvidenceCardData | null;
  twistRevealed: boolean;
  votes: Record<string, string>;
  voteReasons: Record<string, string>;
  characters: CharacterData[];
  culpritName: string | null;
  hasVotes: boolean;
  gmMemo: string;
  onGmMemoChange: (value: string) => void;
  stepStartTimes: number[];
  skipTwist: boolean;
  // Realtime (Phase 56)
  joinCode: string | null;
  participants: SessionParticipant[];
  // Character assignment (Phase 61)
  characterNames: string[];
  onAssignCharacter: (participantId: string, characterName: string | null) => void;
  onAutoAssign: () => void;
  // Student link (Phase 62)
  classStudents: StudentRow[];
  onLinkStudent: (participantId: string, studentId: string | null) => void;
  // Phase 86: heartbeat last_seen_at
  lastSeenMap: Record<string, string>;
  // Phase 117: student feedback
  feedbackSummary: SessionFeedbackRow[];
}

function DashboardTab({
  scenarioTitle,
  currentPhase,
  mm,
  ss,
  isOvertime,
  isProjectorMode,
  startedAt,
  completed,
  discoveredCards,
  evidenceCards,
  evidence5,
  twistRevealed,
  votes,
  voteReasons,
  characters,
  culpritName,
  hasVotes,
  gmMemo,
  onGmMemoChange,
  stepStartTimes,
  skipTwist,
  joinCode,
  participants,
  characterNames,
  onAssignCharacter,
  onAutoAssign,
  classStudents,
  onLinkStudent,
  lastSeenMap,
  feedbackSummary,
}: DashboardTabProps) {
  // Phase 86: Periodic tick to update online/offline status
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  // Phase 87: QR code generation
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showQrLarge, setShowQrLarge] = useState(false);
  useEffect(() => {
    if (!joinCode) { setQrDataUrl(null); return; }
    let cancelled = false;
    const joinUrl = `https://nazotoki.gamanavi.com/join?code=${joinCode}`;
    import('qrcode').then((QRCode) => {
      if (cancelled) return;
      (QRCode.default?.toDataURL || QRCode.toDataURL)(joinUrl, {
        width: 256,
        margin: 1,
        color: { dark: '#0c4a6e', light: '#f0f9ff' },
      }).then((url: string) => {
        if (!cancelled) setQrDataUrl(url);
      }).catch((err: unknown) => {
        console.warn('QR code generation failed:', err);
      });
    }).catch((err: unknown) => {
      console.warn('QR code library load failed:', err);
    });
    return () => { cancelled = true; };
  }, [joinCode]);

  const isParticipantOnline = (p: SessionParticipant): boolean => {
    const lastSeen = lastSeenMap[p.id] || p.last_seen_at;
    if (!lastSeen) return false;
    return Date.now() - new Date(lastSeen).getTime() < 60000;
  };

  // Calculate phase durations from stepStartTimes
  const phaseDurations = useMemo(() => {
    const durations: { key: string; label: string; icon: string; seconds: number }[] = [];
    const phases = skipTwist
      ? PHASE_CONFIG.filter((p) => p.key !== 'twist')
      : [...PHASE_CONFIG];

    for (const phase of phases) {
      if (phase.key === 'prep') continue;
      const idx = PHASE_CONFIG.findIndex((p) => p.key === phase.key);
      if (!stepStartTimes[idx]) continue;

      // Find next started phase
      let endTime = Date.now();
      for (let j = idx + 1; j < PHASE_CONFIG.length; j++) {
        if (stepStartTimes[j]) {
          endTime = stepStartTimes[j];
          break;
        }
      }
      const seconds = Math.round((endTime - stepStartTimes[idx]) / 1000);
      durations.push({ key: phase.key, label: phase.label, icon: phase.icon, seconds });
    }
    return durations;
  }, [stepStartTimes, skipTwist]);
  return (
    <div class="p-4 space-y-4">
      {/* Join code for students (Phase 56) */}
      {joinCode && (
        <section class="bg-sky-50 border border-sky-200 rounded-lg p-4 text-center">
          <h4 class="text-xs font-bold text-sky-600 uppercase tracking-wider mb-1">
            参加コード
          </h4>
          <div class="font-mono font-black text-4xl tracking-[0.3em] text-sky-800 select-all">
            {joinCode}
          </div>
          {/* Phase 87: QR code */}
          {qrDataUrl && (
            <div class="mt-3">
              <button
                onClick={() => setShowQrLarge((v) => !v)}
                class="mx-auto block"
                title="クリックで拡大/縮小"
              >
                <img
                  src={qrDataUrl}
                  alt="QR code"
                  class={`mx-auto rounded-lg transition-all ${
                    showQrLarge || isProjectorMode ? 'w-48 h-48' : 'w-24 h-24'
                  }`}
                />
              </button>
              <p class="text-[10px] text-sky-400 mt-1">
                QRスキャンで参加ページへ
              </p>
            </div>
          )}
          <p class="text-xs text-sky-500 mt-2">
            生徒に伝えてください（{participants.length}人参加中
            {participants.length > 0 && ` / ${participants.filter(isParticipantOnline).length}人オンライン`}）
          </p>
          {participants.length > 0 && (
            <div class="mt-3 space-y-2">
              {participants.map((p) => {
                const usedChars = participants
                  .filter((x) => x.id !== p.id && x.assigned_character)
                  .map((x) => x.assigned_character!);
                const availableChars = characterNames.filter((c) => !usedChars.includes(c));
                const linkedStudent = classStudents.find((s) => s.id === p.student_id);
                const linkedStudentIds = participants
                  .filter((x) => x.id !== p.id && x.student_id)
                  .map((x) => x.student_id!);
                const availableStudents = classStudents.filter((s) => !linkedStudentIds.includes(s.id));
                return (
                  <div key={p.id} class="space-y-1">
                    <div class="flex items-center gap-2">
                      <span class={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        p.voted_for
                          ? 'bg-green-100 text-green-700'
                          : 'bg-sky-100 text-sky-700'
                      }`}>
                        <span class={`inline-block w-2 h-2 rounded-full shrink-0 ${
                          isParticipantOnline(p) ? 'bg-green-400' : 'bg-red-400'
                        }`} />
                        {p.participant_name}
                        {p.voted_for ? ' \u2713' : ''}
                      </span>
                      {characterNames.length > 0 && (
                        <select
                          value={p.assigned_character || ''}
                          onChange={(e) => {
                            const val = (e.target as HTMLSelectElement).value;
                            onAssignCharacter(p.id, val || null);
                          }}
                          class="flex-1 text-sm border border-gray-200 rounded px-2 py-2 min-h-[44px] bg-white focus:ring-1 focus:ring-sky-300"
                        >
                          <option value="">-- キャラ --</option>
                          {p.assigned_character && !availableChars.includes(p.assigned_character) && (
                            <option value={p.assigned_character}>{p.assigned_character}</option>
                          )}
                          {availableChars.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    {classStudents.length > 0 && (
                      <div class="flex items-center gap-2 ml-1">
                        <span class="text-xs text-gray-400">{'\u{1F4CB}'}</span>
                        {linkedStudent ? (
                          <span class="text-xs text-green-600 font-bold flex items-center">
                            {linkedStudent.student_name}
                            <button
                              onClick={() => onLinkStudent(p.id, null)}
                              class="ml-2 w-[44px] h-[44px] flex items-center justify-center text-gray-400 hover:text-red-500"
                              title="リンク解除"
                            >{'\u2715'}</button>
                          </span>
                        ) : (
                          <select
                            value=""
                            onChange={(e) => {
                              const val = (e.target as HTMLSelectElement).value;
                              if (val) onLinkStudent(p.id, val);
                            }}
                            class="text-xs border border-gray-200 rounded px-2 py-1.5 min-h-[44px] bg-white text-gray-500"
                          >
                            <option value="">-- 名簿リンク --</option>
                            {availableStudents.map((s) => (
                              <option key={s.id} value={s.id}>{s.student_name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {characterNames.length > 0 && participants.length > 0 && (
                <button
                  onClick={onAutoAssign}
                  class="w-full mt-2 py-3 min-h-[44px] bg-sky-100 text-sky-700 rounded-lg text-sm font-bold hover:bg-sky-200 transition-colors"
                >
                  {'\u{1F3B2}'} 自動割当（ランダム）
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* Session info */}
      <section class="bg-gray-50 rounded-lg p-3">
        <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
          {'\u30BB\u30C3\u30B7\u30E7\u30F3\u60C5\u5831'}
        </h4>
        <div class="space-y-1.5 text-sm">
          <div class="flex items-center justify-between">
            <span class="text-gray-500">{'\u30B7\u30CA\u30EA\u30AA'}</span>
            <span class="font-bold text-gray-900 text-right max-w-[160px] truncate">{scenarioTitle}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-gray-500">{'\u30D5\u30A7\u30FC\u30BA'}</span>
            <span class="font-bold text-amber-700">
              {currentPhase?.icon} {currentPhase?.label}
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-gray-500">{'\u30BF\u30A4\u30DE\u30FC'}</span>
            <span class={`font-mono font-bold ${isOvertime ? 'text-red-600' : 'text-gray-900'}`}>
              {isOvertime && '-'}{mm}:{ss}
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-gray-500">{'\u6295\u5F71'}</span>
            <span class={`text-xs font-bold px-2 py-0.5 rounded ${
              isProjectorMode
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-200 text-gray-500'
            }`}>
              {isProjectorMode ? 'ON' : 'OFF'}
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-gray-500">{'\u72B6\u614B'}</span>
            <span class={`text-xs font-bold px-2 py-0.5 rounded ${
              completed
                ? 'bg-green-100 text-green-700'
                : startedAt
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-200 text-gray-500'
            }`}>
              {completed
                ? '\u5B8C\u4E86'
                : startedAt
                  ? '\u9032\u884C\u4E2D'
                  : '\u6E96\u5099\u4E2D'}
            </span>
          </div>
          {startedAt && (
            <div class="flex items-center justify-between">
              <span class="text-gray-500">{'\u7D4C\u904E'}</span>
              <span class="font-mono text-gray-700">{formatDuration(startedAt)}</span>
            </div>
          )}
        </div>
      </section>

      {/* Evidence status */}
      <section>
        <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
          {'\u8A3C\u62E0\u516C\u958B\u72B6\u6CC1'}
        </h4>
        <div class="space-y-1">
          {evidenceCards.map((card) => {
            const isDiscovered = discoveredCards.has(card.number);
            return (
              <div
                key={card.number}
                class={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                  isDiscovered
                    ? 'bg-green-50 text-green-800'
                    : 'bg-gray-50 text-gray-400'
                }`}
              >
                <span class={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-black ${
                  isDiscovered
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  {isDiscovered ? '\u2713' : card.number}
                </span>
                <span class="font-bold flex-1">{card.title}</span>
                <span class="text-xs">
                  {isDiscovered
                    ? '\u2705 \u767A\u898B\u6E08'
                    : '\u26AA \u672A\u767A\u898B'}
                </span>
              </div>
            );
          })}
          {evidence5 && (
            <div
              class={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                twistRevealed
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-gray-50 text-gray-400'
              }`}
            >
              <span class={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-black ${
                twistRevealed
                  ? 'bg-amber-500 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}>
                {twistRevealed ? '\u2713' : '\u26A1'}
              </span>
              <span class="font-bold flex-1">{evidence5.title}</span>
              <span class="text-xs">
                {twistRevealed
                  ? '\u26A1 \u516C\u958B\u6E08'
                  : '\uD83D\uDD12 \u672A\u516C\u958B'}
              </span>
            </div>
          )}
        </div>
        <p class="text-xs text-gray-400 mt-1 px-1">
          {discoveredCards.size}/{evidenceCards.length}
          {evidence5 ? ` + Twist${twistRevealed ? '(\u516C\u958B)' : '(\u672A)'}` : ''}
        </p>
      </section>

      {/* GM Memo */}
      <section>
        <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
          {'\uD83D\uDCDD'} GM{'\u30E1\u30E2'}
        </h4>
        <textarea
          value={gmMemo}
          onInput={(e) => onGmMemoChange((e.target as HTMLTextAreaElement).value)}
          class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300"
          rows={4}
          placeholder={'\u5B50\u3069\u3082\u306E\u767A\u8A00\u3001\u6C17\u3065\u304D\u3001\u6539\u5584\u70B9\u306A\u3069\u2026'}
        />
        <p class="text-xs text-gray-400 mt-1 px-1">
          {'\u81EA\u52D5\u4FDD\u5B58\uFF08\u30D6\u30E9\u30A6\u30B6 + \u30AF\u30E9\u30A6\u30C9\uFF09'}
        </p>
      </section>

      {/* Class analysis */}
      {phaseDurations.length > 0 && (
        <section>
          <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            {'\uD83D\uDCCA'} {'\u6388\u696D\u5206\u6790'}
          </h4>
          <div class="bg-gray-50 rounded-lg p-3 space-y-2">
            {/* Phase durations */}
            {phaseDurations.map((pd) => {
              const m = Math.floor(pd.seconds / 60);
              const s = pd.seconds % 60;
              return (
                <div key={pd.key} class="flex items-center justify-between text-sm">
                  <span class="text-gray-600">
                    {pd.icon} {pd.label}
                  </span>
                  <span class="font-mono font-bold text-gray-900">
                    {m}{'\u5206'}{s > 0 ? `${s.toString().padStart(2, '0')}\u79D2` : ''}
                  </span>
                </div>
              );
            })}

            <div class="border-t border-gray-200 pt-2 mt-2 space-y-1.5">
              {/* Evidence discovery rate */}
              <div class="flex items-center justify-between text-sm">
                <span class="text-gray-600">{'\u8A3C\u62E0\u767A\u898B\u7387'}</span>
                <span class="font-bold text-gray-900">
                  {discoveredCards.size} / {evidenceCards.length}
                </span>
              </div>

              {/* Correct count */}
              {culpritName && hasVotes && (
                <div class="flex items-center justify-between text-sm">
                  <span class="text-gray-600">{'\u6B63\u89E3\u8005'}</span>
                  <span class="font-bold text-gray-900">
                    {Object.entries(votes).filter(([, suspectId]) => {
                      const suspect = characters.find((c) => c.id === suspectId);
                      return suspect && (
                        suspect.name.includes(culpritName) ||
                        culpritName.includes(suspect.name)
                      );
                    }).length} / {Object.keys(votes).length}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Session summary (shown when votes exist or completed) */}
      {(hasVotes || completed) && (
        <section>
          <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            {'\uD83D\uDCCA'} {completed ? '\u6388\u696D\u7D50\u679C\u30B5\u30DE\u30EA\u30FC' : '\u6295\u7968\u72B6\u6CC1'}
          </h4>
          <div class="bg-gray-50 rounded-lg p-3 space-y-2">
            {/* Vote results */}
            {characters.map((voter) => {
              const suspectId = votes[voter.id];
              if (!suspectId) return null;
              const suspect = characters.find((c) => c.id === suspectId);
              if (!suspect) return null;
              const reason = voteReasons[voter.id];

              let correctMark: string | null = null;
              if (culpritName) {
                const isCorrect =
                  suspect.name.includes(culpritName) ||
                  culpritName.includes(suspect.name);
                correctMark = isCorrect ? '\u25CB' : '\u25B3';
              }

              return (
                <div key={voter.id} class="text-sm">
                  <div class="flex items-center gap-1.5">
                    {correctMark && (
                      <span class={`text-xs font-black ${
                        correctMark === '\u25CB'
                          ? 'text-green-600'
                          : 'text-amber-600'
                      }`}>
                        {correctMark}
                      </span>
                    )}
                    <span class="font-bold text-gray-700">{voter.name}</span>
                    <span class="text-gray-300">{'\u2192'}</span>
                    <span class="font-bold text-red-700">{suspect.name}</span>
                  </div>
                  {reason && (
                    <p class="text-xs text-gray-400 ml-5 mt-0.5">
                      {'\u300C'}{reason}{'\u300D'}
                    </p>
                  )}
                </div>
              );
            })}

            {/* Correct count */}
            {culpritName && hasVotes && (
              <div class="pt-2 border-t border-gray-200 text-xs text-gray-500">
                {'\u6B63\u89E3\u8005'}: {
                  Object.entries(votes).filter(([, suspectId]) => {
                    const suspect = characters.find((c) => c.id === suspectId);
                    return suspect && (
                      suspect.name.includes(culpritName) ||
                      culpritName.includes(suspect.name)
                    );
                  }).length
                }/{Object.keys(votes).length}{'\u4EBA'}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Completed summary extras */}
      {completed && (
        <section class="bg-green-50 rounded-lg p-3 text-center">
          <div class="text-2xl mb-1">{'\u2705'}</div>
          <p class="font-bold text-green-800 text-sm">{'\u30BB\u30C3\u30B7\u30E7\u30F3\u5B8C\u4E86'}</p>
          {startedAt && (
            <p class="text-xs text-green-600 mt-1">
              {'\u6240\u8981\u6642\u9593'}: {formatDuration(startedAt)}
            </p>
          )}
        </section>
      )}

      {/* Phase 117: Student feedback summary */}
      <FeedbackSummary feedback={feedbackSummary} variant="section" />

    </div>
  );
}
