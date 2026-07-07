// Account deletion — required by App Store Guideline 5.1.1(v) and Google Play.
//
// Erases the authenticated user's data and deletes their auth record. Called by
// the app from Profile → Delete account. Must run with the service role.
//
// Deploy:
//   supabase functions deploy delete-account --project-ref gizqpfbmqgwhbalywkqv
// (Keep JWT verification ON — we need to know WHO is calling to delete them.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Not authenticated' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Identify the caller from their JWT.
  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userErr,
  } = await asUser.auth.getUser();
  if (userErr || !user) {
    return json({ error: 'Not authenticated' }, 401);
  }

  const admin = createClient(url, serviceKey);
  const uid = user.id;

  try {
    // 1) Delete storage objects under the user's folder in the wardrobe bucket.
    const { data: files } = await admin.storage.from('wardrobe').list(uid, { limit: 1000 });
    if (files?.length) {
      await admin.storage.from('wardrobe').remove(files.map((f) => `${uid}/${f.name}`));
    }

    // 2) Delete user-owned rows. RLS is bypassed by the service role.
    const tables = [
      'wardrobe_items',
      'outfits',
      'product_reactions',
      'feed_impressions',
      'try_on_usage',
      'phone_verifications',
      'ai_usage',
      'subscriptions',
      'device_tokens',
      'profiles', // keyed by user_id like the rest (its id column is a row UUID)
    ];
    for (const t of tables) {
      await admin.from(t).delete().eq('user_id', uid);
    }

    // 3) Delete the auth user itself.
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) throw delErr;

    return json({ ok: true }, 200);
  } catch (e) {
    console.error('delete-account failed', e);
    return json({ error: 'Deletion failed. Contact support@fancypot.org.' }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
