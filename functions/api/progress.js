// POST /api/progress — the signed-in learner's saved progress.
//   { op: 'get' } | { op: 'put', data }
// The payload is one Python Quest profile: nickname, buddy, track, streak, badges and per-mission progress.
import { json, safePut, sameOrigin, overLimit, clientIp } from '../_lib/util.js';
import { currentUser, needStore } from '../_lib/auth.js';

const MAX_BYTES = 400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validPayload(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d) || d.version !== 1) return false;
  if (typeof d.progress !== 'object' || d.progress === null || Array.isArray(d.progress)) return false;
  if (Object.keys(d.progress).length > 500) return false;
  if (d.badges !== undefined && !Array.isArray(d.badges)) return false;
  if (d.lastDay != null && !DATE.test(String(d.lastDay))) return false;
  if (d.name !== undefined && (typeof d.name !== 'string' || d.name.length > 40)) return false;
  return true;
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const ns = needStore(env); if (ns) return ns;
  const user = await currentUser(env, request);
  if (!user) return json({ error: 'signed_out' }, 401);
  if (overLimit('progress:' + clientIp(request), 240, 3600)) return json({ error: 'rate_limited' }, 429);
  const raw = await request.text();
  if (raw.length > MAX_BYTES) return json({ error: 'too_large' }, 413);
  let body; try { body = JSON.parse(raw); } catch { return json({ error: 'bad_request' }, 400); }
  const key = 'prog:' + user.id;

  if (body.op === 'get') return json({ data: (await env.STORE.get(key, 'json')) || null });
  if (body.op === 'put') {
    if (!validPayload(body.data)) return json({ error: 'bad_request' }, 400);
    const next = JSON.stringify(body.data);
    if ((await env.STORE.get(key)) === next) return json({ ok: true, unchanged: true });
    if (!(await safePut(env, key, next))) return json({ error: 'storage_busy' }, 503);
    return json({ ok: true });
  }
  return json({ error: 'bad_request' }, 400);
}
export const onRequest = () => json({ error: 'method_not_allowed' }, 405);
