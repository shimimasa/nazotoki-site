import { useState, useRef, useEffect } from 'preact/hooks';

interface SearchItem {
  slug: string;
  title: string;
  series: string;
}

interface Props {
  items: SearchItem[];
}

const SERIES_EMOJI: Record<string, string> = {
  'time-travel': '\uD83D\uDD70\uFE0F',
  'literature': '\uD83D\uDCD6',
  'popculture': '\uD83C\uDFAD',
  'math': '\uD83D\uDD22',
  'science': '\uD83D\uDD2C',
  'moral': '\u2696\uFE0F',
};

export default function SearchBar({ items }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const results = query.trim().length >= 1
    ? items.filter(it =>
        it.title.toLowerCase().includes(query.trim().toLowerCase()) ||
        it.slug.includes(query.trim().toLowerCase())
      ).slice(0, 8)
    : [];

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        class="p-1.5 text-slate-400 hover:text-slate-600 transition-colors rounded-lg hover:bg-gray-100"
        aria-label="シナリオ検索"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
      </button>
    );
  }

  return (
    <div ref={wrapperRef} class="relative">
      <div class="flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
        <svg class="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setOpen(false); setQuery(''); }
            if (e.key === 'Enter' && results.length > 0) {
              window.location.href = `/solo/${results[0].slug}`;
            }
          }}
          placeholder="シナリオ検索..."
          class="bg-transparent outline-none text-sm w-32 sm:w-48 text-gray-700 placeholder:text-gray-400"
        />
        <button
          onClick={() => { setOpen(false); setQuery(''); }}
          class="text-gray-400 hover:text-gray-600 p-0.5"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {query.trim().length >= 1 && (
        <div class="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 w-72 max-h-80 overflow-y-auto py-1">
          {results.length === 0 ? (
            <p class="px-4 py-3 text-sm text-gray-400 text-center">見つかりませんでした</p>
          ) : (
            results.map(r => (
              <a
                key={r.slug}
                href={`/solo/${r.slug}`}
                class="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-slate-50 no-underline"
              >
                <span class="shrink-0">{SERIES_EMOJI[r.series] || '\uD83D\uDD0D'}</span>
                <span class="truncate">{r.title}</span>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  );
}
