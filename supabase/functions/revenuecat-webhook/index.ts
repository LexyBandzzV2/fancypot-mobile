// RevenueCat → Supabase webhook.
//
// Keeps `profiles.plan` authoritative for MOBILE purchases, the same way the
// existing Stripe webhook (api/public/payments/webhook.ts) does for WEB. With
// both writing to the same column, a user's entitlement is unified across web,
// iOS and Android — the whole point of sharing one Supabase project.
//
// Deploy to the SHARED Supabase project:
//   supabase functions deploy revenuecat-webhook --no-verify-jwt --project-ref gizqpfbmqgwhbalywkqv
// Then in the RevenueCat dashboard → Integrations → Webhooks:
//   URL:  https://gizqpfbmqgwhbalywkqv.supabase.co/functions/v1/revenuecat-webhook
//   Authorization header: <the same secret you set as REVENUECAT_WEBHOOK_SECRET>
//
// Required function secrets:
//   supabase secrets set REVENUECAT_WEBHOOK_SECRET=<random-long-string>
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// RevenueCat entitlement identifier  ->  backend plan value.
// "business" is the mobile name for the tier the DB/web call "ultimate".
const ENTITLEMENT_TO_PLAN: Record<string, string> = {
  pro: 'pro',
  business: 'ultimate',
};

type RCEvent = {
  event?: {
    type?: string;
    app_user_id?: string;
    entitlement_ids?: string[];
    entitlement_id?: string | null;
  };
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Shared-secret auth: RevenueCat sends the Authorization header you configure.
  const expected = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  const got = req.headers.get('Authorization');
  if (!expected || got !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: RCEvent;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const event = body.event ?? {};
  const userId = event.app_user_id;
  if (!userId) {
    return new Response('Missing app_user_id', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Determine the resulting plan from the event.
  const type = (event.type ?? '').toUpperCase();
  const REVOKING = ['CANCELLATION', 'EXPIRATION', 'SUBSCRIPTION_PAUSED', 'BILLING_ISSUE'];

  let plan = 'free';
  if (!REVOKING.includes(type)) {
    const ents = event.entitlement_ids ?? (event.entitlement_id ? [event.entitlement_id] : []);
    // Highest entitlement wins.
    if (ents.includes('business')) plan = 'ultimate';
    else if (ents.includes('pro')) plan = 'pro';
    else {
      // Fallback: map whatever single entitlement we got.
      for (const e of ents) {
        if (ENTITLEMENT_TO_PLAN[e]) plan = ENTITLEMENT_TO_PLAN[e];
      }
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ plan })
    .eq('id', userId);

  if (error) {
    console.error('revenuecat-webhook: failed to update plan', error);
    return new Response('DB error', { status: 500 });
  }

  console.log(`revenuecat-webhook: user ${userId} -> plan ${plan} (event ${type})`);
  return new Response(JSON.stringify({ ok: true, plan }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
