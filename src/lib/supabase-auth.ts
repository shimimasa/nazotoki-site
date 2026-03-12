/**
 * Auth & Teacher Profile Functions
 * Phase 114: Split from monolithic supabase.ts
 */
import { supabase } from './supabase-client';
import type { TeacherProfile, SubscriptionPlan } from './supabase-client';

// --- Plan limits (Phase 109) ---

const PLAN_LIMITS = {
  free: { maxClasses: 1, maxScenarios: 10, aiAnalysis: false },
  standard: { maxClasses: Infinity, maxScenarios: Infinity, aiAnalysis: true },
  school: { maxClasses: Infinity, maxScenarios: Infinity, aiAnalysis: true },
} as const;

export function getPlanLimits(plan: SubscriptionPlan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

export function isPremiumFeature(plan: SubscriptionPlan): boolean {
  return plan === 'standard' || plan === 'school';
}

// --- Auth Functions ---

export async function signUp(email: string, password: string, displayName: string): Promise<{ teacher: TeacherProfile | null; error: string | null }> {
  if (!supabase) return { teacher: null, error: 'Supabase not configured' };
  const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
  if (authError || !authData.user) return { teacher: null, error: authError?.message || 'Sign up failed' };

  const { data: teacher, error: profileError } = await supabase
    .from('teachers')
    .insert({ auth_user_id: authData.user.id, display_name: displayName })
    .select()
    .single();
  if (profileError) return { teacher: null, error: profileError.message };
  return { teacher, error: null };
}

export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase not configured' };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message || null };
}

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase not configured' };
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/dashboard`,
    },
  });
  return { error: error?.message || null };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function resetPasswordForEmail(email: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase not configured' };
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return { error: error?.message || null };
}

export async function getCurrentTeacher(): Promise<TeacherProfile | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('teachers')
    .select('*')
    .eq('auth_user_id', user.id)
    .single();
  if (data) {
    return { ...data, role: data.role || 'teacher', group_role: data.group_role || null, subscription_plan: data.subscription_plan || 'free', subscription_status: data.subscription_status || 'active' };
  }
  // OAuth first login: auto-create teacher profile from auth user metadata
  const meta = user.user_metadata || {};
  const displayName = meta.full_name || meta.name || user.email?.split('@')[0] || '先生';
  const { data: newTeacher, error: insertError } = await supabase
    .from('teachers')
    .insert({ auth_user_id: user.id, display_name: displayName })
    .select()
    .single();
  if (insertError) {
    console.error('Auto-create teacher failed:', insertError);
    return null;
  }
  return { ...newTeacher, role: newTeacher.role || 'teacher', subscription_plan: newTeacher.subscription_plan || 'free', subscription_status: newTeacher.subscription_status || 'active' };
}

export function detectSchoolDomain(email: string): string | null {
  const match = email.match(/@(.+)$/);
  if (!match) return null;
  const domain = match[1];
  if (domain.endsWith('.ed.jp') || domain.endsWith('.ac.jp')) {
    const parts = domain.split('.');
    return parts[0] || null;
  }
  return null;
}

export function onAuthStateChange(callback: (teacher: TeacherProfile | null) => void) {
  if (!supabase) return { unsubscribe: () => {} };
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      const teacher = await getCurrentTeacher();
      callback(teacher);
    } else if (event === 'SIGNED_OUT') {
      callback(null);
    }
  });
  return { unsubscribe: () => subscription.unsubscribe() };
}
