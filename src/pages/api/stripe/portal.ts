import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
    const stripeSecretKey = import.meta.env.STRIPE_SECRET_KEY;

    if (!supabaseUrl || !supabaseServiceKey || !stripeSecretKey) {
      return new Response(
        JSON.stringify({ ok: false, error: '課金システムが設定されていません' }),
        { status: 500, headers },
      );
    }

    // Verify teacher JWT
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ ok: false, error: '認証が必要です' }),
        { status: 401, headers },
      );
    }

    const token = authHeader.slice(7);
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: '認証に失敗しました' }),
        { status: 401, headers },
      );
    }

    const { data: teacher } = await supabaseAdmin
      .from('teachers')
      .select('id, stripe_customer_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!teacher?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'サブスクリプションが見つかりません' }),
        { status: 404, headers },
      );
    }

    const stripe = new Stripe(stripeSecretKey);
    const origin = request.headers.get('Origin') || 'https://nazotoki.gamanavi.com';

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: teacher.stripe_customer_id,
      return_url: `${origin}/dashboard`,
    });

    return new Response(
      JSON.stringify({ ok: true, url: portalSession.url }),
      { status: 200, headers },
    );
  } catch (err) {
    console.error('Stripe portal error:', err);
    const message = err instanceof Error ? err.message : 'ポータルの作成に失敗しました';
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers },
    );
  }
};
