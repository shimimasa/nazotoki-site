/**
 * Deterministic color avatar based on character name.
 * Same name always produces the same color across sessions.
 * Phase 157: imageUrl support with error fallback.
 */
import { useState } from 'preact/hooks';

interface Props {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  imageUrl?: string;
}

// 12 distinct hues that work well as avatar backgrounds
const PALETTE = [
  { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
  { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
  { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200' },
  { bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-200' },
  { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' },
  { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200' },
  { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200' },
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

const SIZE_CLASSES = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
};

const IMG_SIZE_CLASSES = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
};

export default function CharacterAvatar({ name, size = 'md', imageUrl }: Props) {
  const [imgError, setImgError] = useState(false);
  const color = PALETTE[hashName(name) % PALETTE.length];
  const initial = name.charAt(0);

  if (imageUrl && !imgError) {
    return (
      <img
        src={imageUrl}
        alt={name}
        title={name}
        class={`${IMG_SIZE_CLASSES[size]} rounded-full object-cover border ${color.border} shrink-0`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      class={`${SIZE_CLASSES[size]} ${color.bg} ${color.text} ${color.border} rounded-full border flex items-center justify-center font-black shrink-0`}
      title={name}
    >
      {initial}
    </div>
  );
}

/** Get color classes for a character name (for inline use without the component) */
export function getCharacterColor(name: string) {
  return PALETTE[hashName(name) % PALETTE.length];
}
