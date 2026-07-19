/**
 * Client-side daily cap for rewarded ads.
 *
 * Free users can watch at most REWARD_DAILY_CAP rewarded ads per day, then the
 * app tells them to come back tomorrow — this is a deliberate nudge toward
 * upgrading rather than farming ads forever. This local counter drives the
 * instant UX (whether to offer the ad at all). The SERVER enforces the same cap
 * independently in grant_ai_reward, so clearing app storage can't mint extra
 * rewards — it would only let the client offer an ad the server then declines
 * to credit. The two caps use each side's local calendar day, which can differ
 * by a few hours across timezones; that's harmless for a bonus feature.
 *
 * Stored per-user so switching accounts on one device doesn't share a counter.
 */
import * as SecureStore from 'expo-secure-store';

export const REWARD_DAILY_CAP = 3;

type DailyRecord = { date: string; count: number };

/** Local calendar day as YYYY-MM-DD (device timezone). */
function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// SecureStore keys allow [A-Za-z0-9._-] only; uuids qualify, but strip to be safe.
function keyFor(userId: string): string {
  return `fancypot_ad_reward_${userId.replace(/[^A-Za-z0-9._-]/g, '')}`;
}

async function read(userId: string): Promise<DailyRecord | null> {
  try {
    const raw = await SecureStore.getItemAsync(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DailyRecord;
    if (typeof parsed?.date !== 'string' || typeof parsed?.count !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** How many rewarded ads the user may still watch today (0..REWARD_DAILY_CAP). */
export async function rewardsRemainingToday(userId: string): Promise<number> {
  const rec = await read(userId);
  if (!rec || rec.date !== today()) return REWARD_DAILY_CAP;
  return Math.max(0, REWARD_DAILY_CAP - rec.count);
}

/**
 * Record that the user just earned a rewarded ad, returning how many remain
 * today. Call this on the EARNED_REWARD event, not merely on ad open.
 *
 * The read-modify-write here isn't atomic, but AdsProvider serializes reward
 * flows (its one-at-a-time guard) so concurrent calls can't happen, and the
 * server re-enforces the cap regardless. Don't reuse this from parallel callers.
 */
export async function recordRewardWatched(userId: string): Promise<number> {
  const rec = await read(userId);
  const t = today();
  const count = (rec && rec.date === t ? rec.count : 0) + 1;
  try {
    await SecureStore.setItemAsync(keyFor(userId), JSON.stringify({ date: t, count }));
  } catch {
    // Non-fatal: worst case the cap resets on next launch. Server cap still holds.
  }
  return Math.max(0, REWARD_DAILY_CAP - count);
}
