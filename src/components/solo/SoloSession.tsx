import { useState, useRef, useCallback } from 'preact/hooks';
import { supabase } from '../../lib/supabase';

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
  subject: string;
  difficulty: string;
  time: string;
  commonHtml: string;
  witnesses: Witness[];
  evidenceCards: EvidenceCardData[];
  evidence5: EvidenceCardData | null;
  solutionHtml: string;
  truthHtml: string;
  thumbnailUrl?: string;
}

interface Props {
  data: SoloData;
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

export default function SoloSession({ data }: Props) {
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

  const startTimeRef = useRef(Date.now());
  const stepTimesRef = useRef<Record<number, number>>({});
  const stepEnterRef = useRef(Date.now());
  const earnedSetRef = useRef<Set<string>>(new Set());
  const contentRef = useRef<HTMLDivElement>(null);

  // --- RP helpers ---
  const earnRP = useCallback((key: string, amount: number) => {
    if (earnedSetRef.current.has(key)) return;
    earnedSetRef.current.add(key);
    setRpEarned(prev => prev + amount);
  }, []);

  // --- Navigation ---
  const recordStepTime = useCallback(() => {
    const elapsed = Math.round((Date.now() - stepEnterRef.current) / 1000);
    stepTimesRef.current[step] = (stepTimesRef.current[step] || 0) + elapsed;
  }, [step]);

  const goToStep = useCallback((target: number) => {
    recordStepTime();
    setStep(target);
    stepEnterRef.current = Date.now();
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
    const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
    const finalRp = rpEarned + RP_COMPLETE
      + (vote && !earnedSetRef.current.has('vote') ? RP_VOTE : 0)
      + (voteReason.trim().length >= 10 && !earnedSetRef.current.has('vote-reason') ? RP_VOTE_REASON : 0);

    if (studentId && studentToken && supabase) {
      setSaving(true);
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
        p_rp_earned: finalRp,
        p_hints_used: 0,
      });
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
  return (
    <div class="flex flex-col h-[100dvh] bg-gray-50">
      {/* Header */}
      <div class="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between shrink-0">
        <div class="min-w-0">
          <p class="text-xs text-gray-400 truncate">{data.seriesName}</p>
          <p class="text-sm font-black text-gray-900 truncate">{data.title}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0 ml-2">
          <span class="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
            {rpEarned} RP
          </span>
          <span class="text-xs text-gray-400">
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
                  class={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isCurrent
                      ? 'bg-amber-500 text-white ring-2 ring-amber-300'
                      : isDone
                        ? 'bg-amber-200 text-amber-800 cursor-pointer hover:bg-amber-300'
                        : 'bg-gray-200 text-gray-400'
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
                  <p class="text-xs text-gray-400 self-center">
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
                  <p class="text-xs text-gray-400 text-right">{voteReason.length}/300</p>
                </div>
              </div>

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
              </div>

              {/* Your reasoning */}
              {(vote || voteReason) && (
                <div class="bg-white rounded-2xl border border-gray-200 p-4">
                  <h3 class="text-sm font-black text-gray-700 mb-2">あなたの推理</h3>
                  {vote && <p class="text-sm"><span class="font-bold">選択:</span> {vote}</p>}
                  {voteReason && <p class="text-sm mt-1"><span class="font-bold">理由:</span> {voteReason}</p>}
                </div>
              )}

              {/* Truth reveal */}
              <div class="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 class="font-black text-gray-900 text-center mb-4">&#128161; 真相</h2>
                <div class="solo-content text-sm" dangerouslySetInnerHTML={{ __html: data.solutionHtml }} />
              </div>

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
            <span class="text-xs text-gray-400">
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
