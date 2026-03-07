import { useState } from 'preact/hooks';

interface GmNoteProps {
  children: preact.ComponentChildren;
  label?: string;
  defaultOpen?: boolean;
}

export default function GmNote({
  children,
  label = 'GM',
  defaultOpen = false,
}: GmNoteProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div class="rounded-xl border border-indigo-200 overflow-hidden bg-indigo-50/40">
      <button
        onClick={() => setOpen(!open)}
        class="w-full px-4 py-2.5 flex items-center gap-2 text-left hover:bg-indigo-50 transition-colors"
      >
        <span class="px-2 py-0.5 bg-indigo-600 text-white text-xs font-black rounded">
          {label}
        </span>
        <span class="flex-1 text-sm font-bold text-indigo-900">
          {open ? '\u25B2 閉じる' : '\u25BC 進行ヒントを見る'}
        </span>
      </button>
      {open && (
        <div class="px-4 pb-4 border-t border-indigo-100 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}
