import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const stripeSecretKey = import.meta.env.STRIPE_SECRET_KEY;
    const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Webhook not configured' }),
        { status: 500, headers },
      );
    }

    const stripe = new Stripe(stripeSecretKey);
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return new Response(
        JSON.stringify({ error: 'Missing signature' }),
        { status: 400, headers },
      );
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 400, headers },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const teacherId = session.metadata?.teacher_id;
        const plan = session.metadata?.plan;
        if (teacherId && plan) {
          await supabaseAdmin
            .from('teachers')
            .update({
              subscription_plan: plan,
              subscription_status: 'active',
              stripe_customer_id: session.customer as string,
            })
            .eq('id', teacherId);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const status = subscription.status;

        const planStatus = status === 'active' || status === 'trialing'
          ? 'active'
          : status === 'past_due'
            ? 'past_due'
            : 'canceled';

        const expiresAt = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null;

        await supabaseAdmin
          .from('teachers')
          .update({
            subscription_status: planStatus,
            subscription_expires_at: expiresAt,
          })
          .eq('stripe_customer_id', customerId);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        await supabaseAdmin
          .from('teachers')
          .update({
            subscription_plan: 'free',
            subscription_status: 'canceled',
            subscription_expires_at: null,
          })
          .eq('stripe_customer_id', customerId);
        break;
      }

      default:
        // Unhandled event type — log and acknowledge
        console.log(`Unhandled Stripe event: ${event.type}`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers },
    );
  } catch (err) {
    console.error('Stripe webhook error:', err);
    return new Response(
      JSON.stringify({ error: 'Webhook processing failed' }),
      { status: 500, headers },
    );
  }
};
