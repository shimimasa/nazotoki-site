/**
 * Supabase Client + All Type Definitions
 * Phase 114: Split from monolithic supabase.ts
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

export const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// --- Auth & Teacher Profile ---

export type TeacherRole = 'teacher' | 'admin';
export type SubscriptionPlan = 'free' | 'standard' | 'school';
export type GroupRole = 'group_admin' | null;

export interface TeacherProfile {
  id: string;
  auth_user_id: string;
  display_name: string;
  school_id: string | null;
  role: TeacherRole;
  group_role: GroupRole;
  subscription_plan: SubscriptionPlan;
  subscription_status: string;
  created_at: string;
}

// --- School ---

export interface SchoolGroupRow {
  id: string;
  name: string;
  contact_email: string | null;
  created_at: string;
}

export type SchoolType = 'elementary' | 'junior_high' | 'high' | 'combined' | 'special_needs' | 'other';

export interface SchoolRow {
  id: string;
  name: string;
  school_type: SchoolType | null;
  address: string | null;
  principal_name: string | null;
  phone_number: string | null;
  website_url: string | null;
  contact_email: string | null;
  group_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchoolProfileUpdate {
  name?: string;
  school_type?: SchoolType | null;
  address?: string | null;
  principal_name?: string | null;
  phone_number?: string | null;
  website_url?: string | null;
  contact_email?: string | null;
}

// --- Class ---

export interface ClassRow {
  id: string;
  teacher_id: string;
  class_name: string;
  grade_label: string | null;
  description: string | null;
  created_at: string;
}

export interface ClassWithStats extends ClassRow {
  session_count: number;
  student_count: number;
}

// --- Student ---

export interface StudentRow {
  id: string;
  class_id: string;
  student_name: string;
  login_id: string | null;
  pin_hash: string | null;
  student_token: string | null;
  token_expires_at: string | null;
  parent_link_code: string | null;
  parent_link_expires_at: string | null;
  created_at: string;
}

export interface StudentCredential {
  student_id: string;
  student_name: string;
  login_id: string;
  pin: string | null;
  already_exists: boolean;
}

export interface StudentLoginResult {
  student_id: string;
  student_name: string;
  class_id: string;
  login_id: string;
  student_token: string;
  token_expires_at: string;
}

// --- Session Logs ---

export interface StudentSessionLogRow {
  id: string;
  session_log_id: string;
  student_id: string;
  voted_for: string | null;
  vote_reason: string | null;
  is_correct: boolean | null;
  created_at: string;
}

export interface StudentSessionLogInsert {
  session_log_id: string;
  student_id: string;
  voted_for?: string;
  vote_reason?: string;
  is_correct?: boolean;
}

export interface SessionLogRecord {
  scenario_slug: string;
  scenario_title: string;
  start_time: string | null;
  end_time: string;
  duration: number | null;
  phase_durations: Record<string, number>;
  vote_results: Record<string, string>;
  vote_reasons: Record<string, string>;
  discovered_evidence: number[];
  twist_revealed: boolean;
  correct_players: string[] | null;
  gm_memo: string;
  reflections?: string[] | null;
  environment?: string | null;
  player_count?: number | null;
  teacher_name?: string | null;
  teacher_id?: string | null;
  class_id?: string | null;
}

export interface SessionLogRow {
  id: string;
  scenario_slug: string;
  scenario_title: string | null;
  start_time: string | null;
  end_time: string | null;
  duration: number | null;
  phase_durations: Record<string, number> | null;
  vote_results: Record<string, string> | null;
  vote_reasons: Record<string, string> | null;
  discovered_evidence: number[] | null;
  twist_revealed: boolean;
  correct_players: string[] | null;
  gm_memo: string | null;
  reflections: string[] | null;
  environment: string | null;
  player_count: number | null;
  teacher_name: string | null;
  teacher_id: string | null;
  class_id: string | null;
  created_at: string;
}

// --- Analytics ---

export interface StudentWithClass {
  id: string;
  student_name: string;
  class_id: string;
  class_name: string;
}

export interface StudentLogSummary {
  student_id: string;
  is_correct: boolean | null;
  vote_reason: string | null;
  created_at: string;
}

export interface MonthlyReportRow {
  id: string;
  teacher_id: string;
  year: number;
  month: number;
  summary_json: Record<string, unknown>;
  insights_json: Record<string, unknown>;
  generated_at: string;
  created_at: string;
}

// --- Admin ---

export interface SchoolTeacher {
  id: string;
  display_name: string;
  role: TeacherRole;
  created_at: string;
}

export interface RoleChangeLog {
  id: string;
  school_id: string;
  actor_teacher_id: string;
  target_teacher_id: string;
  action: string;
  before_role: string;
  after_role: string;
  created_at: string;
}

export interface RoleChangeLogQuery {
  schoolId: string;
  page?: number;
  pageSize?: number;
  actorTeacherId?: string;
  targetTeacherId?: string;
  roleChange?: 'promoted' | 'demoted';
}

export interface PaginatedRoleChangeLogs {
  items: RoleChangeLog[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface TeacherInvitationRow {
  id: string;
  school_id: string;
  invited_by_teacher_id: string;
  invite_email: string | null;
  token: string;
  role: string;
  expires_at: string;
  used_at: string | null;
  used_by_teacher_id: string | null;
  created_at: string;
}

export interface InvitationPreview {
  valid: boolean;
  error?: string;
  school_name?: string;
  expires_at?: string;
}

export interface InvitationConsumeResult {
  ok: boolean;
  error?: string;
  status?: 'joined' | 'already_member';
}

// --- Assignments ---

export interface AssignmentRow {
  id: string;
  teacher_id: string;
  class_id: string;
  scenario_slug: string;
  scenario_title: string;
  description: string;
  due_date: string | null;
  created_at: string;
}

export interface AssignmentInsert {
  teacher_id: string;
  class_id: string;
  scenario_slug: string;
  scenario_title: string;
  description?: string;
  due_date?: string | null;
}

export interface StudentAssignment {
  id: string;
  scenario_slug: string;
  scenario_title: string;
  description: string;
  due_date: string | null;
  created_at: string;
  completed: boolean;
  rp_earned: number;
}

// --- Gamification ---

export interface StreakInfo {
  streak: number;
  multiplier: number;
}

export interface LeaderboardEntry {
  rank: number;
  student_name: string;
  total_rp: number;
  clear_count: number;
  is_me: boolean;
}

// --- Session Feedback ---

export interface SessionFeedbackRow {
  id: string;
  session_run_id: string;
  participant_id: string;
  fun_rating: number;
  difficulty_rating: number;
  comment: string;
  created_at: string;
}

// --- Solo Progress ---

export interface SoloSessionRow {
  id: string;
  student_id: string;
  scenario_slug: string;
  completed_at: string | null;
  duration_seconds: number | null;
  vote: string | null;
  vote_reason: string | null;
  is_correct: boolean | null;
  rp_earned: number;
  created_at: string;
}

// --- Rubric Evaluations ---

export interface RubricEvaluationRow {
  id: string;
  teacher_id: string;
  student_id: string;
  session_log_id: string;
  scenario_slug: string;
  thinking: number;
  expression: number;
  collaboration: number;
  comment: string;
  created_at: string;
  updated_at: string;
}

export interface RubricEvaluationUpsert {
  teacher_id: string;
  student_id: string;
  session_log_id: string;
  scenario_slug: string;
  thinking: number;
  expression: number;
  collaboration: number;
  comment?: string;
}

// --- Lesson Plans ---

export interface LessonPlanRow {
  id: string;
  teacher_id: string;
  class_id: string;
  scenario_slug: string;
  planned_date: string;
  notes: string;
  status: 'planned' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface LessonPlanInsert {
  teacher_id: string;
  class_id: string;
  scenario_slug: string;
  planned_date: string;
  notes?: string;
}

// --- AI Analysis Cache ---

export interface AiAnalysisCacheRow {
  id: string;
  teacher_id: string;
  cache_key: string;
  analysis_type: 'vote_analysis' | 'solo_feedback' | 'class_insight';
  result_json: unknown;
  model_used: string;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
}
