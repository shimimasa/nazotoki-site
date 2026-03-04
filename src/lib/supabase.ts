import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

export const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export interface SessionRecord {
  teacher_name: string;
  slug: string;
  scenario_title: string;
  environment: 'classroom' | 'dayservice' | 'home';
  player_count: number;
  started_at: string;
  completed_at?: string;
  phase_durations?: Record<string, number>;
}

export interface VoteRecord {
  session_id: string;
  voter_name: string;
  suspect_name: string;
  is_correct: boolean;
}

export interface ReflectionRecord {
  session_id: string;
  content: string;
}

export async function createSession(data: SessionRecord) {
  if (!supabase) return null;
  const { data: row, error } = await supabase
    .from('sessions')
    .insert(data)
    .select('id')
    .single();
  if (error) {
    console.error('Failed to create session:', error);
    return null;
  }
  return row.id as string;
}

export async function completeSession(
  sessionId: string,
  phaseDurations: Record<string, number>,
) {
  if (!supabase) return;
  await supabase
    .from('sessions')
    .update({
      completed_at: new Date().toISOString(),
      phase_durations: phaseDurations,
    })
    .eq('id', sessionId);
}

export async function saveVotes(votes: VoteRecord[]) {
  if (!supabase || votes.length === 0) return;
  await supabase.from('votes').insert(votes);
}

export async function saveReflections(reflections: ReflectionRecord[]) {
  if (!supabase || reflections.length === 0) return;
  await supabase.from('reflections').insert(reflections);
}
