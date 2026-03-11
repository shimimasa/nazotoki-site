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

    if (!teacher) {
      return new Response(
        JSON.stringify({ ok: false, error: '教員アカウントが必要です' }),
        { status: 403, headers },
      );
    }

    // Parse plan from body
    const body = await request.json();
    const { plan } = body as { plan?: string };

    const priceMap: Record<string, string | undefined> = {
      standard: import.meta.env.STRIPE_PRICE_ID_STANDARD,
      school: import.meta.env.STRIPE_PRICE_ID_SCHOOL,
    };

    const priceId = plan ? priceMap[plan] : undefined;
    if (!priceId) {
      return new Response(
        JSON.stringify({ ok: false, error: '無効なプランです' }),
        { status: 400, headers },
      );
    }

    const stripe = new Stripe(stripeSecretKey);

    // Create or reuse Stripe customer
    let customerId = teacher.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { teacher_id: teacher.id },
      });
      customerId = customer.id;

      await supabaseAdmin
        .from('teachers')
        .update({ stripe_customer_id: customerId })
        .eq('id', teacher.id);
    }

    // Create Checkout Session
    const origin = request.headers.get('Origin') || 'https://nazotoki.gamanavi.com';
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard?payment=success`,
      cancel_url: `${origin}/pricing?payment=canceled`,
      metadata: { teacher_id: teacher.id, plan: plan || '' },
    });

    return new Response(
      JSON.stringify({ ok: true, url: session.url }),
      { status: 200, headers },
    );
  } catch (err) {
    console.error('Stripe checkout error:', err);
    const message = err instanceof Error ? err.message : '決済処理中にエラーが発生しました';
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers },
    );
  }
};
