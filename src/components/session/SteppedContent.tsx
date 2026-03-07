import { useState, useEffect, useRef } from 'preact/hooks';
import { splitHtmlByHr, extractHeading } from './splitHtml';

interface SteppedContentProps {
  html: string;
  /** Show all sections at once without stepping */
  showAll?: boolean;
}

export default function SteppedContent({
  html,
  showAll = false,
}: SteppedContentProps) {
  const sections = splitHtmlByHr(html);
  const [visibleCount, setVisibleCount] = useState(1);
  const [animating, setAnimating] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const total = sections.length;
  const allVisible = visibleCount >= total;

  // Reset when html changes
  useEffect(() => {
    setVisibleCount(showAll ? total : 1);
  }, [html, showAll, total]);

  const handleNext = () => {
    if (allVisible) return;
    setAnimating(true);
    setVisibleCount((c) => c + 1);
    setTimeout(() => {
      setAnimating(false);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  };

  // If only 1 section, just render it
  if (total <= 1) {
    return (
      <div
        class="prose prose-lg max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  if (showAll) {
    return (
      <div class="prose prose-lg max-w-none">
        {sections.map((sec, i) => (
          <div key={i} dangerouslySetInnerHTML={{ __html: sec }} />
        ))}
      </div>
    );
  }

  const nextHeading = !allVisible
    ? extractHeading(sections[visibleCount]) || null
    : null;

  return (
    <div class="space-y-4">
      {/* Sections */}
      <div class="prose prose-lg max-w-none space-y-4">
        {sections.slice(0, visibleCount).map((sec, i) => {
          const isLatest = i === visibleCount - 1 && visibleCount > 1;
          return (
            <div
              key={i}
              class={`transition-all duration-500 ${
                isLatest && animating
                  ? 'opacity-0 translate-y-4'
                  : 'opacity-100 translate-y-0'
              }`}
              dangerouslySetInnerHTML={{ __html: sec }}
            />
          );
        })}
      </div>

      <div ref={bottomRef} />

      {/* Progress + Next button */}
      <div class="flex items-center justify-between pt-2">
        <span class="text-xs text-gray-400 font-bold">
          {visibleCount} / {total}
        </span>
        {!allVisible ? (
          <button
            onClick={handleNext}
            class="px-5 py-2.5 bg-indigo-500 text-white rounded-xl font-bold hover:bg-indigo-600 transition-colors flex items-center gap-2"
          >
            <span>
              {nextHeading ? `${nextHeading} \u25B6` : '\u25B6 \u6B21\u3078'}
            </span>
          </button>
        ) : (
          <span class="text-xs text-green-600 font-bold">
            {'\u2705'} {'\u5168\u3066\u8AAD\u307F\u4E0A\u3052\u307E\u3057\u305F'}
          </span>
        )}
      </div>
    </div>
  );
}
