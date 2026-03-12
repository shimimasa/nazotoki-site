import { useState, useRef, useCallback, useEffect } from 'preact/hooks';
import { supabase, checkAndAwardBadges, fetchStudentStreak, fetchStudentAssignments, BADGE_DEFS } from '../../lib/supabase';
import { isUnlocked, getUnlockThreshold } from '../../lib/unlock';
import { useFontSize } from '../../lib/use-font-size';
import SoloFeedback from './SoloFeedback';

// --- Types ---

interface Witness {
  id: string;
  name: string;
  role: string;
  introHtml: string;
  publicHtml: string;
  secretHtml: string;
  hintsHtml: string;
}

interface EvidenceCardData {
  number: number;
  title: string;
  contentHtml: string;
}

interface SoloData {
  slug: string;
  title: string;
  fullTitle: string;
  series: string;
  seriesName: string;
  volume: number;
  subject: string;
  difficulty: string;
  time: string;
  commonHtml: string;
  witnesses: Witness[];
  evidenceCards: EvidenceCardData[];
  evidence5: EvidenceCardData | null;
  solutionHtml: string;
  truthHtml: string;
  killerQuestions: { scene: string; question: string }[];
  challengeHtml: string;
  thumbnailUrl?: string;
}

interface FeedbackEntry {
  correct: boolean;
  goodPoints: string[];
  missedClues: string[];
  hint: string;
}

interface Props {
  data: SoloData;
  feedbackData?: Record<string, FeedbackEntry> | null;
}

// --- Constants ---

const RP_READ_TESTIMONY = 5;
const RP_READ_EVIDENCE = 5;
const RP_VOTE = 10;
const RP_VOTE_REASON = 10;
const RP_COMPLETE = 20;

const LS_STUDENT_ID = 'nazotoki-student-id';
const LS_STUDENT_TOKEN = 'nazotoki-student-token';

// --- Component ---

export default function SoloSession({ data, feedbackData = null }: Props) {
  const witnessCount = data.witnesses.length;
  // Steps: 1=intro, 2..N+1=witnesses, N+2=evidence, N+3=vote, N+4=truth
  const STEP_INTRO = 1;
  const STEP_FIRST_WITNESS = 2;
  const STEP_EVIDENCE = STEP_FIRST_WITNESS + witnessCount;
  const STEP_VOTE = STEP_EVIDENCE + 1;
  const STEP_TRUTH = STEP_VOTE + 1;
  const TOTAL_STEPS = STEP_TRUTH;

  const [step, setStep] = useState(STEP_INTRO);
  const [revealedSecrets, setRevealedSecrets] = useState<Set<number>>(new Set());
  const [readEvidence, setReadEvidence] = useState<Set<number>>(new Set());
  const [currentEvidenceIdx, setCurrentEvidenceIdx] = useState(0);
  const [evidence5Revealed, setEvidence5Revealed] = useState(false);
  const [vote, setVote] = useState('');
  const [voteReason, setVoteReason] = useState('');
  const [rpEarned, setRpEarned] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newBadges, setNewBadges] = useState<string[]>([]);
  const [streakInfo, setStreakInfo] = useState<{ streak: number; multiplier: number } | null>(null);
  const [lockStatus, setLockStatus] = useState<'checking' | 'unlocked' | 'locked'>('checking');
  const [lockRpNeeded, setLockRpNeeded] = useState(0);
  const fontSize = useFontSize();

  const startTimeRef = useRef(Date.now());
  const stepTimesRef = useRef<Record<number, number>>({});
  const stepEnterRef = useRef(Date.now());
  const earnedSetRef = useRef<Set<string>>(new Set());
  const contentRef = useRef<HTMLDivElement>(null);

  // Phase 83: Background time exclusion for accurate duration
  const hiddenSinceRef = useRef(0);
  const stepBackgroundMsRef = useRef(0);
  const totalBackgroundMsRef = useRef(0);

  // Phase 83: Track background time via visibilitychange
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        hiddenSinceRef.current = Date.now();
      } else if (hiddenSinceRef.current > 0) {
        const bg = Date.now() - hiddenSinceRef.current;
        stepBackgroundMsRef.current += bg;
        totalBackgroundMsRef.current += bg;
        hiddenSinceRef.current = 0;
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Phase 94: Unlock check on mount
  // Note: SSG delivers full scenario HTML regardless of lock status. The unlock gate
  // is a motivational mechanism for elementary students, not cryptographic DRM.
  // Page-source inspection is not a realistic threat for the target audience.
  useEffect(() => {
    const threshold = getUnlockThreshold(data.volume);
    if (threshold === 0) { setLockStatus('unlocked'); return; }

    const studentId = localStorage.getItem(LS_STUDENT_ID);
    const studentToken = localStorage.getItem(LS_STUDENT_TOKEN);
    if (!studentId || !studentToken || !supabase) {
      // Not logged in and scenario requires RP — prompt login
      setLockRpNeeded(threshold);
      setLockStatus('locked');
      return;
    }

    Promise.all([
      supabase.rpc('rpc_fetch_solo_history', { p_student_id: studentId, p_student_token: studentToken }),
      fetchStudentAssignments(studentId, studentToken),
    ]).then(([historyRes, assignRes]) => {
      const totalRp = (historyRes.data as Record<string, unknown>)?.total_rp as number || 0;
      const assignedSlugs = new Set(assignRes.assignments.map(a => a.scenario_slug));
      if (isUnlocked(data.volume, totalRp, assignedSlugs, data.slug)) {
        setLockStatus('unlocked');
      } else {
        setLockRpNeeded(threshold - totalRp);
        setLockStatus('locked');
      }
    }).catch(() => setLockStatus('unlocked'));
  }, [data.volume, data.slug]);

  // --- RP helpers ---
  const earnRP = useCallback((key: string, amount: number) => {
    if (earnedSetRef.current.has(key)) return;
    earnedSetRef.current.add(key);
    setRpEarned(prev => prev + amount);
  }, []);

  // --- Navigation ---
  const recordStepTime = useCallback(() => {
    const elapsed = Math.round((Date.now() - stepEnterRef.current - stepBackgroundMsRef.current) / 1000);
    stepTimesRef.current[step] = (stepTimesRef.current[step] || 0) + Math.max(0, elapsed);
    stepBackgroundMsRef.current = 0;
  }, [step]);

  const goToStep = useCallback((target: number) => {
    recordStepTime();
    setStep(target);
    stepEnterRef.current = Date.now();
    stepBackgroundMsRef.current = 0;
    contentRef.current?.scrollTo(0, 0);
  }, [recordStepTime]);

  const goNext = useCallback(() => {
    if (step < TOTAL_STEPS) goToStep(step + 1);
  }, [step, TOTAL_STEPS, goToStep]);

  const goBack = useCallback(() => {
    if (step > STEP_INTRO) goToStep(step - 1);
  }, [step, goToStep]);

  // --- Witness actions ---
  const revealSecret = useCallback((witnessIdx: number) => {
    setRevealedSecrets(prev => new Set(prev).add(witnessIdx));
    earnRP(`testimony-${witnessIdx}`, RP_READ_TESTIMONY);
  }, [earnRP]);

  // --- Evidence actions ---
  const openEvidence = useCallback((cardNumber: number) => {
    setReadEvidence(prev => new Set(prev).add(cardNumber));
    earnRP(`evidence-${cardNumber}`, RP_READ_EVIDENCE);
  }, [earnRP]);

  const nextEvidence = useCallback(() => {
    if (currentEvidenceIdx < data.evidenceCards.length - 1) {
      setCurrentEvidenceIdx(prev => prev + 1);
    }
  }, [currentEvidenceIdx, data.evidenceCards.length]);

  const prevEvidence = useCallback(() => {
    if (currentEvidenceIdx > 0) {
      setCurrentEvidenceIdx(prev => prev - 1);
    }
  }, [currentEvidenceIdx]);

  // --- Vote & Complete ---
  const handleComplete = useCallback(async () => {
    recordStepTime();
    if (vote) earnRP('vote', RP_VOTE);
    if (voteReason.trim().length >= 10) earnRP('vote-reason', RP_VOTE_REASON);
    earnRP('complete', RP_COMPLETE);

    const studentId = localStorage.getItem(LS_STUDENT_ID);
    const studentToken = localStorage.getItem(LS_STUDENT_TOKEN);
    const duration = Math.round(((Date.now() - startTimeRef.current) - totalBackgroundMsRef.current) / 1000);
    const finalRp = rpEarned + RP_COMPLETE
      + (vote && !earnedSetRef.current.has('vote') ? RP_VOTE : 0)
      + (voteReason.trim().length >= 10 && !earnedSetRef.current.has('vote-reason') ? RP_VOTE_REASON : 0);

    if (studentId && studentToken && supabase) {
      setSaving(true);
      // Phase 90: Fetch streak BEFORE save to apply multiplier to rp_earned
      const streakResult = await fetchStudentStreak(studentId, studentToken);
      const multiplier = streakResult.multiplier || 1.0;
      const multipliedRp = Math.round(finalRp * multiplier);

      // Phase 118: Determine is_correct from feedback data
      const isCorrect = vote && feedbackData && feedbackData[vote]
        ? feedbackData[vote].correct
        : null;

      await supabase.rpc('rpc_save_solo_session', {
        p_student_id: studentId,
        p_student_token: studentToken,
        p_scenario_slug: data.slug,
        p_started_at: new Date(startTimeRef.current).toISOString(),
        p_duration_seconds: duration,
        p_vote: vote || null,
        p_vote_reason: voteReason || null,
        p_evidence_read_order: Array.from(readEvidence),
        p_time_per_step: stepTimesRef.current,
        p_rp_earned: multipliedRp,
        p_hints_used: 0,
        p_is_correct: isCorrect,
      });

      // Phase 89: Check badges after save
      const badgeResult = await checkAndAwardBadges(studentId, studentToken);
      if (badgeResult.new_badges.length > 0) {
        setNewBadges(badgeResult.new_badges);
      }
      if (streakResult.streak > 0) {
        setStreakInfo(streakResult);
      }
      // Update displayed RP to match saved value
      if (multiplier > 1.0) {
        setRpEarned(multipliedRp);
      }
      setSaving(false);
    }

    setCompleted(true);
    goToStep(STEP_TRUTH);
  }, [vote, voteReason, rpEarned, readEvidence, data.slug, earnRP, recordStepTime, goToStep, STEP_TRUTH]);

  // --- Step label ---
  const stepLabel = (s: number): string => {
    if (s === STEP_INTRO) return '事件概要';
    if (s >= STEP_FIRST_WITNESS && s < STEP_EVIDENCE) {
      const idx = s - STEP_FIRST_WITNESS;
      return `${data.witnesses[idx]?.name}の証言`;
    }
    if (s === STEP_EVIDENCE) return '証拠調査';
    if (s === STEP_VOTE) return '最終推理';
    if (s === STEP_TRUTH) return '真相解明';
    return '';
  };

  // --- Render ---

  // Phase 94: Lock screen
  if (lockStatus === 'checking') {
    return (
      <div class="flex flex-col h-[100dvh] bg-gray-50 items-center justify-center">
        <p class="text-gray-400">読み込み中...</p>
      </div>
    );
  }
  if (lockStatus === 'locked') {
    const isLoggedIn = !!localStorage.getItem(LS_STUDENT_ID);
    return (
      <div class="flex flex-col h-[100dvh] bg-gray-50 items-center justify-center p-6">
        <div class="text-center space-y-4 max-w-sm">
          <p class="text-5xl">&#128274;</p>
          <h1 class="text-xl font-black text-gray-900">このシナリオはロック中</h1>
          {isLoggedIn ? (
            <>
              <p class="text-sm text-gray-500">
                あと <span class="font-black text-amber-600">{lockRpNeeded} RP</span> でアンロック！
              </p>
              <p class="text-xs text-gray-400">
                他のシナリオをプレイしてRPを貯めよう
              </p>
            </>
          ) : (
            <p class="text-sm text-gray-500">
              ログインしてRPを確認しよう
            </p>
          )}
          <div class="flex gap-3 pt-2">
            {isLoggedIn ? (
              <a
                href="/my"
                class="flex-1 py-3 bg-amber-500 text-white rounded-xl text-sm font-black text-center hover:bg-amber-600 transition-colors"
              >
                マイページへ
              </a>
            ) : (
              <a
                href="/login"
                class="flex-1 py-3 bg-amber-500 text-white rounded-xl text-sm font-black text-center hover:bg-amber-600 transition-colors"
              >
                ログインする
              </a>
            )}
            <a
              href="/"
              class="flex-1 py-3 bg-gray-200 text-gray-700 rounded-xl text-sm font-bold text-center hover:bg-gray-300 transition-colors"
            >
              トップへ
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="flex flex-col h-[100dvh] bg-gray-50">
      {/* Header */}
      <div class="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between shrink-0">
        <div class="min-w-0">
          <p class="text-xs text-gray-500 truncate">{data.seriesName}</p>
          <p class="text-sm font-black text-gray-900 truncate">{data.title}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0 ml-2">
          <button
            onClick={fontSize.cycle}
            class="text-[10px] text-gray-400 hover:text-gray-600 transition-colors px-1 py-0.5 border border-gray-200 rounded"
            title={`文字サイズ: ${fontSize.label}`}
          >
            Aa
          </button>
          <span class="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
            {rpEarned} RP
          </span>
          <span class="text-xs text-gray-500">
            {step}/{TOTAL_STEPS}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div class="px-4 py-2 bg-white border-b border-gray-100 shrink-0">
        <div class="flex items-center gap-1">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => {
            const s = i + 1;
            const isCurrent = s === step;
            const isDone = s < step || completed;
            return (
              <div key={s} class="flex items-center flex-1">
                <button
                  onClick={() => { if (isDone || isCurrent) goToStep(s); }}
                  class={`min-w-[44px] min-h-[44px] w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isCurrent
                      ? 'bg-amber-500 text-white ring-2 ring-amber-300'
                      : isDone
                        ? 'bg-amber-200 text-amber-800 cursor-pointer hover:bg-amber-300'
                        : 'bg-gray-200 text-gray-500'
                  }`}
                  disabled={!isDone && !isCurrent}
                  title={stepLabel(s)}
                >
                  {isDone && !isCurrent ? '\u2713' : s}
                </button>
                {s < TOTAL_STEPS && (
                  <div class={`flex-1 h-0.5 mx-0.5 ${isDone ? 'bg-amber-200' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>
        <p class="text-xs text-gray-500 font-bold mt-1 text-center">{stepLabel(step)}</p>
      </div>

      {/* Content area */}
      <div ref={contentRef} class="flex-1 overflow-y-auto px-4 py-4">
        <div class="max-w-lg mx-auto">

          {/* Step 1: Intro */}
          {step === STEP_INTRO && (
            <div class="space-y-4">
              <div class="bg-white rounded-2xl border-2 border-amber-200 p-5">
                <div class="text-center mb-4">
                  <p class="text-3xl mb-2">&#128269;</p>
                  <h1 class="text-xl font-black text-gray-900">{data.title}</h1>
                  <div class="flex justify-center gap-3 mt-2 text-xs text-gray-500">
                    <span>{data.subject}</span>
                    <span>{data.difficulty}</span>
                  </div>
                </div>
                <div class="solo-content" dangerouslySetInnerHTML={{ __html: data.commonHtml }} />
              </div>
            </div>
          )}

          {/* Steps 2-N+1: Witness testimonies */}
          {step >= STEP_FIRST_WITNESS && step < STEP_EVIDENCE && (() => {
            const idx = step - STEP_FIRST_WITNESS;
            const w = data.witnesses[idx];
            if (!w) return null;
            const isRevealed = revealedSecrets.has(idx);

            return (
              <div class="space-y-4">
                {/* Witness card */}
                <div class="bg-white rounded-2xl border border-gray-200 p-5">
                  <div class="flex items-center gap-3 mb-3">
                    <div class="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-lg font-black text-amber-700">
                      {w.name.charAt(0)}
                    </div>
                    <div>
                      <h2 class="font-black text-gray-900">{w.name}</h2>
                      <p class="text-xs text-gray-500">{w.role}</p>
                    </div>
                  </div>

                  {/* Intro */}
                  {w.introHtml && (
                    <div class="solo-content text-sm text-gray-700 mb-3" dangerouslySetInnerHTML={{ __html: w.introHtml }} />
                  )}

                  {/* Public testimony */}
                  <div class="bg-blue-50 rounded-xl p-4 mb-3">
                    <p class="text-xs font-bold text-blue-600 mb-2">&#128483; {w.name}の証言</p>
                    <div class="solo-content text-sm" dangerouslySetInnerHTML={{ __html: w.publicHtml }} />
                  </div>

                  {/* Secret reveal */}
                  {!isRevealed ? (
                    <button
                      onClick={() => revealSecret(idx)}
                      class="w-full py-3 bg-amber-500 text-white rounded-xl font-black text-sm hover:bg-amber-600 active:bg-amber-700 transition-colors"
                    >
                      &#128270; 深掘り調査する
                    </button>
                  ) : (
                    <div class="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 animate-fadeIn">
                      <p class="text-xs font-black text-amber-700 mb-2">&#128275; 調査で判明した事実</p>
                      <div class="solo-content text-sm" dangerouslySetInnerHTML={{ __html: w.secretHtml }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Step N+2: Evidence investigation */}
          {step === STEP_EVIDENCE && (
            <div class="space-y-4">
              {/* Evidence cards */}
              <div class="flex justify-center gap-2 mb-2">
                {data.evidenceCards.map((card, i) => (
                  <button
                    key={card.number}
                    onClick={() => { setCurrentEvidenceIdx(i); openEvidence(card.number); }}
                    class={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold transition-colors ${
                      currentEvidenceIdx === i
                        ? 'bg-amber-500 text-white ring-2 ring-amber-300'
                        : readEvidence.has(card.number)
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {card.number}
                  </button>
                ))}
                {data.evidence5 && (
                  <button
                    onClick={() => {
                      if (!evidence5Revealed) {
                        setEvidence5Revealed(true);
                        openEvidence(5);
                      }
                      setCurrentEvidenceIdx(data.evidenceCards.length);
                    }}
                    class={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold transition-colors ${
                      currentEvidenceIdx === data.evidenceCards.length && evidence5Revealed
                        ? 'bg-red-500 text-white ring-2 ring-red-300'
                        : evidence5Revealed
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-300 text-gray-500'
                    }`}
                    disabled={!evidence5Revealed && readEvidence.size < data.evidenceCards.length}
                    title={readEvidence.size < data.evidenceCards.length ? '証拠1-4を先に読もう' : '新証拠'}
                  >
                    5
                  </button>
                )}
              </div>

              {/* Current evidence card */}
              {currentEvidenceIdx < data.evidenceCards.length ? (() => {
                const card = data.evidenceCards[currentEvidenceIdx];
                const isRead = readEvidence.has(card.number);
                return (
                  <div class="bg-white rounded-2xl border border-gray-200 p-5">
                    <div class="flex items-center gap-2 mb-3">
                      <span class="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-sm font-black text-amber-700">
                        {card.number}
                      </span>
                      <h2 class="font-black text-gray-900 text-sm">{card.title}</h2>
                    </div>
                    {!isRead ? (
                      <button
                        onClick={() => openEvidence(card.number)}
                        class="w-full py-3 bg-amber-500 text-white rounded-xl font-black text-sm hover:bg-amber-600 transition-colors"
                      >
                        &#128194; 証拠ファイルを開く
                      </button>
                    ) : (
                      <div class="solo-content text-sm animate-fadeIn" dangerouslySetInnerHTML={{ __html: card.contentHtml }} />
                    )}
                  </div>
                );
              })() : evidence5Revealed && data.evidence5 && (
                <div class="bg-white rounded-2xl border-2 border-red-200 p-5 animate-fadeIn">
                  <div class="flex items-center gap-2 mb-3">
                    <span class="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-sm font-black text-red-700">
                      5
                    </span>
                    <h2 class="font-black text-red-800 text-sm">&#9889; {data.evidence5.title}</h2>
                  </div>
                  <div class="solo-content text-sm" dangerouslySetInnerHTML={{ __html: data.evidence5.contentHtml }} />
                </div>
              )}

              {/* Evidence navigation */}
              <div class="flex justify-between">
                <button
                  onClick={prevEvidence}
                  disabled={currentEvidenceIdx === 0}
                  class="px-4 py-2 text-sm font-bold text-gray-500 disabled:opacity-30"
                >
                  &#9664; 前の証拠
                </button>
                {readEvidence.size < data.evidenceCards.length && (
                  <p class="text-xs text-gray-500 self-center">
                    {readEvidence.size}/{data.evidenceCards.length} 読了
                  </p>
                )}
                <button
                  onClick={nextEvidence}
                  disabled={currentEvidenceIdx >= data.evidenceCards.length - 1 && !evidence5Revealed}
                  class="px-4 py-2 text-sm font-bold text-gray-500 disabled:opacity-30"
                >
                  次の証拠 &#9654;
                </button>
              </div>

              {/* Unlock evidence 5 */}
              {!evidence5Revealed && data.evidence5 && readEvidence.size >= data.evidenceCards.length && (
                <button
                  onClick={() => {
                    setEvidence5Revealed(true);
                    openEvidence(5);
                    setCurrentEvidenceIdx(data.evidenceCards.length);
                  }}
                  class="w-full py-3 bg-red-500 text-white rounded-xl font-black text-sm hover:bg-red-600 transition-colors"
                >
                  &#9889; 新しい証拠が見つかった！
                </button>
              )}
            </div>
          )}

          {/* Step N+3: Vote */}
          {step === STEP_VOTE && !completed && (
            <div class="space-y-4">
              <div class="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 class="font-black text-gray-900 text-center mb-4">&#128300; 最終推理</h2>
                <p class="text-sm text-gray-600 text-center mb-4">
                  証拠と証言を踏まえて、あなたの考えを選んでください
                </p>

                {/* Character vote buttons */}
                <div class="grid grid-cols-2 gap-2 mb-4">
                  {data.witnesses.map(w => (
                    <button
                      key={w.id}
                      onClick={() => setVote(w.name)}
                      class={`py-3 px-3 rounded-xl text-sm font-bold transition-colors ${
                        vote === w.name
                          ? 'bg-amber-500 text-white ring-2 ring-amber-300'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {w.name}
                    </button>
                  ))}
                </div>

                {/* Vote reason */}
                <div>
                  <label class="block text-sm font-bold text-gray-700 mb-1">
                    なぜそう思う？
                  </label>
                  <textarea
                    value={voteReason}
                    onInput={(e) => setVoteReason((e.target as HTMLTextAreaElement).value)}
                    class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm resize-none focus:ring-2 focus:ring-amber-400 outline-none"
                    rows={3}
                    maxLength={300}
                    placeholder="理由を書いてみよう（10文字以上で+10RP）"
                  />
                  <p class="text-xs text-gray-500 text-right">{voteReason.length}/300</p>
                </div>
              </div>

              {/* Killer questions as thinking hints */}
              {data.killerQuestions.length > 0 && (
                <div class="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                  <p class="text-xs font-black text-blue-700 mb-3">&#128161; 考えるヒント</p>
                  <ul class="space-y-2">
                    {data.killerQuestions.slice(0, 3).map((q, i) => (
                      <li key={i} class="text-sm text-blue-900 leading-relaxed">
                        {q.question}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                onClick={handleComplete}
                disabled={saving}
                class={`w-full py-4 rounded-2xl font-black text-lg transition-colors ${
                  saving
                    ? 'bg-gray-300 text-gray-500'
                    : 'bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700'
                }`}
              >
                {saving ? '保存中...' : '&#128270; 真相を見る'}
              </button>
            </div>
          )}

          {/* Step N+4: Truth */}
          {step === STEP_TRUTH && (
            <div class="space-y-4">
              {/* Score card */}
              <div class="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 text-center">
                <p class="text-3xl mb-2">&#128269;</p>
                <p class="text-sm text-amber-700 font-bold">捜査完了！</p>
                <p class="text-3xl font-black text-amber-800 mt-1">{rpEarned} RP</p>
                <div class="flex justify-center gap-4 mt-3 text-xs text-amber-600">
                  <span>証言 {revealedSecrets.size}/{witnessCount}</span>
                  <span>証拠 {readEvidence.size}/{data.evidenceCards.length + (data.evidence5 ? 1 : 0)}</span>
                  {vote && <span>投票: {vote}</span>}
                </div>
                {/* Phase 90: Streak info */}
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

              {/* Phase 89: New badge notification */}
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

              {/* Your reasoning */}
              {(vote || voteReason) && (
                <div class="bg-white rounded-2xl border border-gray-200 p-4">
                  <h3 class="text-sm font-black text-gray-700 mb-2">あなたの推理</h3>
                  {vote && <p class="text-sm"><span class="font-bold">選択:</span> {vote}</p>}
                  {voteReason && <p class="text-sm mt-1"><span class="font-bold">理由:</span> {voteReason}</p>}
                </div>
              )}

              {/* Phase 105: Solo feedback */}
              <SoloFeedback votedFor={vote} feedbackData={feedbackData} />

              {/* Truth reveal */}
              <div class="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 class="font-black text-gray-900 text-center mb-4">&#128161; 真相</h2>
                <div class="solo-content text-sm" dangerouslySetInnerHTML={{ __html: data.solutionHtml }} />
              </div>

              {/* Challenge problems */}
              {data.challengeHtml && (
                <details class="bg-white rounded-2xl border-2 border-green-200 overflow-hidden">
                  <summary class="px-5 py-4 cursor-pointer font-black text-green-800 text-sm hover:bg-green-50 transition-colors">
                    &#127942; チャレンジ問題に挑戦する
                  </summary>
                  <div class="px-5 pb-5">
                    <div class="solo-content text-sm" dangerouslySetInnerHTML={{ __html: data.challengeHtml }} />
                  </div>
                </details>
              )}

              {/* Actions */}
              <div class="flex flex-col gap-2">
                <a
                  href="/my"
                  class="block w-full py-3 bg-amber-500 text-white rounded-xl font-black text-sm text-center hover:bg-amber-600 transition-colors"
                >
                  マイページへ
                </a>
                <a
                  href="/"
                  class="block w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm text-center hover:bg-gray-200 transition-colors"
                >
                  トップに戻る
                </a>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Bottom navigation */}
      {step !== STEP_TRUTH && (
        <div class="bg-white border-t border-gray-200 px-4 py-3 flex justify-between items-center shrink-0">
          <button
            onClick={goBack}
            disabled={step === STEP_INTRO}
            class="px-5 py-2 rounded-xl text-sm font-bold text-gray-500 disabled:opacity-30 hover:bg-gray-100 transition-colors"
          >
            &#9664; 戻る
          </button>
          {step === STEP_VOTE ? (
            <span class="text-xs text-gray-500">
              {vote ? '準備OK' : '投票してから真相へ'}
            </span>
          ) : (
            <button
              onClick={goNext}
              disabled={step >= STEP_VOTE}
              class="px-5 py-2 rounded-xl text-sm font-black bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700 disabled:opacity-30 transition-colors"
            >
              次へ &#9654;
            </button>
          )}
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
      `}</style>
    </div>
  );
}
