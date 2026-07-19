// AdMob Rewarded Server-Side Verification (SSV) → Supabase.
//
// When a free user finishes a rewarded ad, AdMob calls this endpoint (an HTTP
// GET with a cryptographic signature). We verify the signature against Google's
// public verifier keys, then grant a small bonus AI allowance (one extra
// try-on's worth) via grant_ai_reward, which enforces a per-day cap and is
// idempotent by transaction_id. The client is NEVER trusted to grant a reward.
//
// Deploy to the SHARED Supabase project (public endpoint — the signature is the
// auth, so JWT verification must be OFF):
//   supabase functions deploy admob-ssv --no-verify-jwt --project-ref gizqpfbmqgwhbalywkqv
// Then in AdMob → your rewarded ad unit → Server-side verification, set:
//   https://gizqpfbmqgwhbalywkqv.supabase.co/functions/v1/admob-ssv
// and click "Verify URL".
//
// Requires no extra secrets (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are
// injected automatically). Reward size and daily cap are fixed server-side.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// One rewarded ad grants this many AI cents. try-on costs 4¢ in ai-router.ts,
// so this is "watch an ad → one extra try-on". Kept in sync with that cost.
const REWARD_CENTS = 4;
// Server-side daily cap (defense-in-depth; the client also caps at 3/day).
const DAILY_CAP = 3;

const VERIFIER_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type VerifierKey = { keyId: number; pem?: string; base64?: string };
type KeyCache = { keys: VerifierKey[]; fetchedAtMs: number };
let keyCache: KeyCache | null = null;
// Google rotates keys and says not to cache beyond 24h; we refetch hourly and
// also force a refetch on any key_id cache-miss before rejecting.
const KEY_CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchVerifierKeys(): Promise<VerifierKey[]> {
  const res = await fetch(VERIFIER_KEYS_URL);
  if (!res.ok) throw new Error(`verifier-keys fetch failed: ${res.status}`);
  const json = (await res.json()) as { keys: VerifierKey[] };
  keyCache = { keys: json.keys ?? [], fetchedAtMs: Date.now() };
  return keyCache.keys;
}

async function getKeyById(keyId: string): Promise<VerifierKey | null> {
  const match = (keys: VerifierKey[]) => keys.find((k) => String(k.keyId) === keyId) ?? null;
  if (keyCache && Date.now() - keyCache.fetchedAtMs < KEY_CACHE_TTL_MS) {
    const hit = match(keyCache.keys);
    if (hit) return hit;
  }
  // Cache miss or stale — refetch once (handles mid-window rotation).
  const keys = await fetchVerifierKeys();
  return match(keys);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return base64ToBytes(padded);
}

function stripLeadingZeros(buf: Uint8Array): Uint8Array {
  let i = 0;
  while (i < buf.length - 1 && buf[i] === 0x00) i++;
  return buf.slice(i);
}

// DER (ASN.1 SEQUENCE{INTEGER r, INTEGER s}) -> IEEE P1363 (r||s), what Web
// Crypto's ECDSA verify requires. For P-256, r and s are each 32 bytes.
function derToP1363(der: Uint8Array, byteLen = 32): Uint8Array {
  let offset = 0;
  if (der[offset++] !== 0x30) throw new Error('Invalid DER: expected SEQUENCE');

  function readLength(): number {
    let len = der[offset++];
    if (len & 0x80) {
      const numBytes = len & 0x7f;
      len = 0;
      for (let i = 0; i < numBytes; i++) len = (len << 8) | der[offset++];
    }
    return len;
  }
  readLength(); // sequence length — consume, value unused

  function readInt(): Uint8Array {
    if (der[offset++] !== 0x02) throw new Error('Invalid DER: expected INTEGER');
    const len = readLength();
    const bytes = der.slice(offset, offset + len);
    offset += len;
    return bytes;
  }

  const r = stripLeadingZeros(readInt());
  const s = stripLeadingZeros(readInt());
  if (r.length > byteLen || s.length > byteLen) {
    throw new Error('Invalid DER: r/s too large for curve');
  }
  const out = new Uint8Array(byteLen * 2);
  out.set(r, byteLen - r.length);
  out.set(s, byteLen * 2 - s.length);
  return out;
}

async function importSpkiKey(key: VerifierKey): Promise<CryptoKey> {
  let spki: Uint8Array;
  if (key.base64) {
    spki = base64ToBytes(key.base64);
  } else if (key.pem) {
    const body = key.pem
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s+/g, '');
    spki = base64ToBytes(body);
  } else {
    throw new Error('verifier key has neither base64 nor pem');
  }
  return crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'verify',
  ]);
}

async function verifySignature(
  signedContent: string,
  signatureB64Url: string,
  key: VerifierKey,
): Promise<boolean> {
  const publicKey = await importSpkiKey(key);
  const rawSig = derToP1363(base64UrlToBytes(signatureB64Url), 32);
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    rawSig,
    new TextEncoder().encode(signedContent),
  );
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // The signed content is the raw query string exactly as received, up to
    // (but not including) "&signature=". It must NOT be re-encoded, so we slice
    // the raw URL rather than reserializing URLSearchParams.
    const rawUrl = req.url;
    const qIndex = rawUrl.indexOf('?');
    const rawQuery = qIndex === -1 ? '' : rawUrl.slice(qIndex + 1);
    const sigMarker = '&signature=';
    const sigIndex = rawQuery.indexOf(sigMarker);
    if (sigIndex === -1) {
      return new Response('Missing signature', { status: 400 });
    }
    const signedContent = rawQuery.slice(0, sigIndex);

    // Pull individual values via URLSearchParams (safe to decode these).
    const params = new URL(rawUrl).searchParams;
    const signature = params.get('signature');
    const keyId = params.get('key_id');
    const transactionId = params.get('transaction_id');
    // We set both user_id and custom_data to the Supabase user id client-side,
    // so either one identifies the user (AdMob occasionally drops one of them).
    const userId = params.get('user_id') || params.get('custom_data');

    if (!signature || !keyId || !transactionId) {
      return new Response('Malformed callback', { status: 400 });
    }

    const key = await getKeyById(keyId);
    if (!key) {
      return new Response('Unknown key_id', { status: 400 });
    }

    let valid = false;
    try {
      valid = await verifySignature(signedContent, signature, key);
    } catch (e) {
      console.error('admob-ssv: signature verify threw', e);
      valid = false;
    }
    if (!valid) {
      return new Response('Invalid signature', { status: 403 });
    }

    // Signature is authentic past this point.
    if (!userId || !UUID_RE.test(userId)) {
      // Verified but no usable user to credit — AdMob dropped both ids, or the
      // value isn't a Supabase user uuid. Return 200 so AdMob stops retrying an
      // unrecoverable callback (a non-uuid would otherwise error the RPC → 500 →
      // endless retries).
      console.warn('admob-ssv: verified callback without a usable user id', { transactionId });
      return new Response(JSON.stringify({ ok: true, credited: false, reason: 'no_user' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data, error } = await supabase.rpc('grant_ai_reward', {
      p_user_id: userId,
      p_transaction_id: transactionId,
      p_cents: REWARD_CENTS,
      p_daily_cap: DAILY_CAP,
    });
    if (error) {
      console.error('admob-ssv: grant_ai_reward failed', error);
      return new Response('DB error', { status: 500 });
    }

    // data is 'granted' | 'duplicate' | 'capped'. All are terminal successes as
    // far as AdMob is concerned — return 200 so it stops retrying.
    console.log(`admob-ssv: user ${userId} tx ${transactionId} -> ${data}`);
    return new Response(JSON.stringify({ ok: true, result: data }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('admob-ssv: unexpected error', e);
    return new Response('Server error', { status: 500 });
  }
});
