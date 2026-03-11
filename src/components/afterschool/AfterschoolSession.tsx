import { useState, useRef, useCallback } from 'preact/hooks';

// --- Types (same as SoloData) ---

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

interface AfterschoolData {
  slug: string;
  title: string;
  seriesName: string;
  subject: string;
  difficulty: string;
  commonHtml: string;
  witnesses: Witness[];
  evidenceCards: EvidenceCardData[];
  evidence5: EvidenceCardData | null;
  solutionHtml: string;
  killerQuestions: { scene: string; question: string }[];
}

interface Props {
  data: AfterschoolData;
}

// --- Component ---

export default function AfterschoolSession({ data }: Props) {
  const witnessCount = data.witnesses.length;
  const STEP_INTRO = 1;
  const STEP_FIRST_WITNESS = 2;
  const STEP_EVIDENCE = STEP_FIRST_WITNESS + witnessCount;
  const STEP_DISCUSS = STEP_EVIDENCE + 1;
  const STEP_TRUTH = STEP_DISCUSS + 1;
  const TOTAL_STEPS = STEP_TRUTH;

  const [step, setStep] = useState(STEP_INTRO);
  const [started, setStarted] = useState(false);
  const [showScript, setShowScript] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);

  const goToStep = useCallback((target: number) => {
    setStep(target);
    contentRef.current?.scrollTo(0, 0);
  }, []);

  const goNext = useCallback(() => {
    if (step < TOTAL_STEPS) goToStep(step + 1);
  }, [step, TOTAL_STEPS, goToStep]);

  const goBack = useCallback(() => {
    if (step > STEP_INTRO) goToStep(step - 1);
  }, [step, goToStep]);

  const stepLabel = (s: number): string => {
    if (s === STEP_INTRO) return '事件紹介';
    if (s >= STEP_FIRST_WITNESS && s < STEP_EVIDENCE) {
      const idx = s - STEP_FIRST_WITNESS;
      return `${data.witnesses[idx]?.name}の話`;
    }
    if (s === STEP_EVIDENCE) return '証拠確認';
    if (s === STEP_DISCUSS) return 'みんなで考えよう';
    if (s === STEP_TRUTH) return '答え合わせ';
    return '';
  };

  // --- Title screen ---
  if (!started) {
    return (
      <div class="flex flex-col items-center justify-center min-h-[100dvh] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8">
        <div class="text-center max-w-2xl space-y-6">
          <p class="text-6xl">&#128269;</p>
          <h1 class="text-3xl sm:text-5xl font-black leading-tight">{data.title}</h1>
          <div class="flex justify-center gap-4 text-lg text-slate-300">
            <span>{data.seriesName}</span>
            <span>{data.subject}</span>
            <span>{data.difficulty}</span>
          </div>
          <div class="pt-4">
            <button
              onClick={() => setStarted(true)}
              class="px-12 py-5 bg-amber-500 text-white text-2xl font-black rounded-2xl hover:bg-amber-600 active:bg-amber-700 transition-colors shadow-lg"
            >
              &#9654; はじめる
            </button>
          </div>
          <p class="text-sm text-slate-500 pt-4">
            放課後デイモード: 「次へ」ボタンだけで進行できます
          </p>
        </div>
      </div>
    );
  }

  // --- Main session ---
  return (
    <div class="flex flex-col h-[100dvh] bg-slate-50">
      {/* Header */}
      <div class="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div class="min-w-0">
          <p class="text-lg font-black text-gray-900 truncate">{data.title}</p>
          <p class="text-sm text-gray-600">{stepLabel(step)} ({step}/{TOTAL_STEPS})</p>
        </div>
        <button
          onClick={() => setShowScript(!showScript)}
          class={`text-sm font-bold px-3 py-1.5 rounded-lg transition-colors ${
            showScript ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {showScript ? '&#128214; 台本ON' : '台本OFF'}
        </button>
      </div>

      {/* Progress dots */}
      <div class="px-6 py-2 bg-white border-b border-gray-100 shrink-0">
        <div class="flex items-center gap-1">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => {
            const s = i + 1;
            const isCurrent = s === step;
            const isDone = s < step;
            return (
              <div key={s} class="flex items-center flex-1">
                <button
                  onClick={() => { if (isDone || isCurrent) goToStep(s); }}
                  class={`min-w-[44px] min-h-[44px] w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                    isCurrent
                      ? 'bg-amber-500 text-white ring-2 ring-amber-300'
                      : isDone
                        ? 'bg-amber-200 text-amber-800 cursor-pointer hover:bg-amber-300'
                        : 'bg-gray-200 text-gray-500'
                  }`}
                  disabled={!isDone && !isCurrent}
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
      </div>

      {/* Content */}
      <div ref={contentRef} class="flex-1 overflow-y-auto px-6 py-6">
        <div class="max-w-3xl mx-auto">

          {/* Step 1: Intro */}
          {step === STEP_INTRO && (
            <div class="space-y-6">
              {showScript && (
                <ScriptBox>
                  「今日はナゾトキをやるよ！ある事件が起きました。みんなで犯人を見つけよう！」
                </ScriptBox>
              )}
              <ContentCard title={"\u{1F50D} 事件のあらまし"}>
                <div class="afterschool-content" dangerouslySetInnerHTML={{ __html: data.commonHtml }} />
              </ContentCard>
              {showScript && (
                <ScriptBox>
                  「これから関係者の話を聞いていくよ。よく聞いてね！」
                </ScriptBox>
              )}
            </div>
          )}

          {/* Witness steps */}
          {step >= STEP_FIRST_WITNESS && step < STEP_EVIDENCE && (() => {
            const idx = step - STEP_FIRST_WITNESS;
            const w = data.witnesses[idx];
            if (!w) return null;
            return (
              <div class="space-y-6">
                {showScript && (
                  <ScriptBox>
                    「{idx + 1}人目の話を聞いてみよう。{w.name}さんです。」
                  </ScriptBox>
                )}
                <ContentCard title={`\u{1F5E3}\u{FE0F} ${w.name}（${w.role}）`}>
                  {w.introHtml && (
                    <div class="afterschool-content text-gray-600 mb-4" dangerouslySetInnerHTML={{ __html: w.introHtml }} />
                  )}
                  <div class="bg-blue-50 rounded-xl p-5 mb-4">
                    <p class="text-sm font-bold text-blue-600 mb-2">&#128172; {w.name}の話</p>
                    <div class="afterschool-content" dangerouslySetInnerHTML={{ __html: w.publicHtml }} />
                  </div>
                  <div class="bg-amber-50 border-2 border-amber-300 rounded-xl p-5">
                    <p class="text-sm font-black text-amber-700 mb-2">&#128275; くわしく聞いたら...</p>
                    <div class="afterschool-content" dangerouslySetInnerHTML={{ __html: w.secretHtml }} />
                  </div>
                </ContentCard>
                {showScript && (
                  <ScriptBox>
                    「{w.name}さんの話、どう思った？ 気になったところはある？」
                  </ScriptBox>
                )}
              </div>
            );
          })()}

          {/* Evidence step */}
          {step === STEP_EVIDENCE && (
            <div class="space-y-6">
              {showScript && (
                <ScriptBox>
                  「次は証拠を確認するよ！ヒントが隠れているかも？」
                </ScriptBox>
              )}
              {data.evidenceCards.map(card => (
                <ContentCard key={card.number} title={`\u{1F4C2} 証拠${card.number}: ${card.title}`}>
                  <div class="afterschool-content" dangerouslySetInnerHTML={{ __html: card.contentHtml }} />
                </ContentCard>
              ))}
              {data.evidence5 && (
                <ContentCard title={`\u{26A1} 新証拠: ${data.evidence5.title}`}>
                  <div class="afterschool-content" dangerouslySetInnerHTML={{ __html: data.evidence5.contentHtml }} />
                </ContentCard>
              )}
            </div>
          )}

          {/* Discuss step */}
          {step === STEP_DISCUSS && (
            <div class="space-y-6">
              {showScript && (
                <ScriptBox>
                  「さあ、みんなで考えよう！ 誰が怪しいと思う？ 手を挙げて教えてね！」
                </ScriptBox>
              )}
              <ContentCard title={"\u{1F914} みんなで考えよう"}>
                <div class="grid grid-cols-2 gap-4 mb-6">
                  {data.witnesses.map(w => (
                    <div
                      key={w.id}
                      class="bg-gray-50 border-2 border-gray-200 rounded-xl p-5 text-center"
                    >
                      <div class="w-14 h-14 mx-auto rounded-full bg-amber-100 flex items-center justify-center text-2xl font-black text-amber-700 mb-2">
                        {w.name.charAt(0)}
                      </div>
                      <p class="text-lg font-black text-gray-900">{w.name}</p>
                      <p class="text-sm text-gray-500">{w.role}</p>
                    </div>
                  ))}
                </div>
                {data.killerQuestions.length > 0 && (
                  <div class="bg-blue-50 border border-blue-200 rounded-xl p-5">
                    <p class="text-sm font-black text-blue-700 mb-3">&#128161; こんなことを考えてみよう</p>
                    <ul class="space-y-2">
                      {data.killerQuestions.slice(0, 3).map((q, i) => (
                        <li key={i} class="text-base text-blue-900 leading-relaxed">
                          {q.question}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </ContentCard>
              {showScript && (
                <ScriptBox>
                  「理由も言えるかな？ 『○○だから怪しい！』って教えてね。準備できたら答え合わせしよう！」
                </ScriptBox>
              )}
            </div>
          )}

          {/* Truth step */}
          {step === STEP_TRUTH && (
            <div class="space-y-6">
              {showScript && (
                <ScriptBox>
                  「それでは、答え合わせです！ 当たった人はいるかな？」
                </ScriptBox>
              )}
              <ContentCard title={"\u{1F4A1} 真相"}>
                <div class="afterschool-content" dangerouslySetInnerHTML={{ __html: data.solutionHtml }} />
              </ContentCard>
              {showScript && (
                <ScriptBox>
                  「おつかれさま！ みんなすごいね。どんなところが面白かった？」
                </ScriptBox>
              )}
              <div class="text-center pt-4">
                <button
                  onClick={() => { setStarted(false); setStep(STEP_INTRO); }}
                  class="px-8 py-4 bg-amber-500 text-white text-lg font-black rounded-2xl hover:bg-amber-600 transition-colors"
                >
                  タイトルに戻る
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom nav */}
      {step !== STEP_TRUTH && (
        <div class="bg-white border-t border-gray-200 px-6 py-4 flex justify-between items-center shrink-0">
          <button
            onClick={goBack}
            disabled={step === STEP_INTRO}
            class="px-6 py-3 rounded-xl text-base font-bold text-gray-500 disabled:opacity-30 hover:bg-gray-100 transition-colors"
          >
            &#9664; 戻る
          </button>
          <span class="text-sm text-gray-400 font-bold">
            {stepLabel(step)}
          </span>
          <button
            onClick={goNext}
            class="px-8 py-3 rounded-xl text-base font-black bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700 transition-colors shadow-md"
          >
            次へ &#9654;
          </button>
        </div>
      )}

      <style>{`
        .afterschool-content { font-size: 1.125rem; line-height: 2; }
        .afterschool-content h2 { font-size: 1.5rem; font-weight: 900; margin-top: 1.5rem; }
        .afterschool-content h3 { font-size: 1.25rem; font-weight: 700; margin-top: 1rem; }
        .afterschool-content p { margin: 0.5rem 0; }
        .afterschool-content ul, .afterschool-content ol { margin: 0.5rem 0; padding-left: 1.5rem; }
        .afterschool-content table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; }
        .afterschool-content th, .afterschool-content td { border: 1px solid #e5e7eb; padding: 0.5rem 0.75rem; text-align: left; }
        .afterschool-content th { background: #f9fafb; font-weight: 700; }
        .afterschool-content blockquote { border-left: 4px solid #d97706; padding-left: 1rem; margin: 0.75rem 0; color: #92400e; }
        .afterschool-content strong { color: #92400e; }
      `}</style>
    </div>
  );
}

// --- Sub-components ---

function ScriptBox({ children }: { children: string }) {
  return (
    <div class="bg-blue-50 border-2 border-blue-300 rounded-2xl p-5">
      <p class="text-xs font-bold text-blue-500 mb-1">&#128214; 読み上げ台本</p>
      <p class="text-lg text-blue-900 font-bold leading-relaxed">{children}</p>
    </div>
  );
}

function ContentCard({ title, children }: { title: string; children: any }) {
  return (
    <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h2 class="text-xl font-black text-gray-900 mb-4">{title}</h2>
      {children}
    </div>
  );
}
