/**
 * Barrel re-export — backwards compatibility layer
 * Phase 114: All 34 importing files continue to work unchanged.
 *
 * Module structure:
 *   supabase-client.ts    — Supabase client + all type definitions
 *   supabase-auth.ts      — Auth, plans, teacher profile
 *   supabase-students.ts  — Student CRUD, PIN auth, parent links, badges, streaks
 *   supabase-sessions.ts  — Class CRUD, session logs, GM memo, feedback, assignments
 *   supabase-admin.ts     — School management, admin, invitations, role audit
 *   supabase-analytics.ts — Analytics, reports, rubrics, lesson plans, AI cache
 */
export * from './supabase-client';
export * from './supabase-auth';
export * from './supabase-students';
export * from './supabase-sessions';
export * from './supabase-admin';
export * from './supabase-analytics';
