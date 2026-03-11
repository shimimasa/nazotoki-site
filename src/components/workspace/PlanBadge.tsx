import type { SubscriptionPlan } from '../../lib/supabase';

const PLAN_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  free: { label: 'Free', color: 'text-gray-600', bg: 'bg-gray-100' },
  standard: { label: 'Standard', color: 'text-amber-700', bg: 'bg-amber-100' },
  school: { label: 'School', color: 'text-indigo-700', bg: 'bg-indigo-100' },
};

interface Props {
  plan: SubscriptionPlan;
  onUpgrade?: () => void;
}

export default function PlanBadge({ plan, onUpgrade }: Props) {
  const config = PLAN_CONFIG[plan] || PLAN_CONFIG.free;

  return (
    <span class="inline-flex items-center gap-1.5">
      <span class={`px-2 py-0.5 rounded-full text-xs font-bold ${config.color} ${config.bg}`}>
        {config.label}
      </span>
      {plan === 'free' && onUpgrade && (
        <button
          onClick={onUpgrade}
          class="text-xs text-amber-600 font-bold hover:underline"
        >
          Upgrade
        </button>
      )}
    </span>
  );
}
