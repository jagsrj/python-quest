// Small helpers shared by the /api functions (Cloudflare Pages Functions).
// Rate limits are counted in memory per Cloudflare server: KV writes are the scarce resource
// on the free plan (1,000 a day), so a KV-backed counter would waste them.
const mem = new Map();
export function overLimit(key, max, ttlSeconds) {
  const now = Date.now(), e = mem.get(key);
  if (mem.size > 5000) for (const [k, v] of mem) if (v.reset < now) mem.delete(k);
  if (!e || e.reset < now) { mem.set(key, { n: 1, reset: now + ttlSeconds * 1000 }); return false; }
  if (e.n >= max) return true;
  e.n++;
  return false;
}
/** Writes to KV, returning false (instead of throwing) when the daily write allowance is used up. */
export async function safePut(env, key, value, opts) {
  try { await env.STORE.put(key, value, opts); return true; }
  catch (e) { console.log('kv-put-failed', String(e && e.message || e).slice(0, 120)); return false; }
}
export const clientIp = (request) => request.headers.get('cf-connecting-ip') || 'unknown';
export const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  try { return !origin || new URL(origin).host === new URL(request.url).host; } catch { return false; }
}
