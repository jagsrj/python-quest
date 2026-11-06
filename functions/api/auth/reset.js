// POST /api/auth/reset { username, recoveryCode, password } — forgotten password.
// The recovery code is single-use: a new one is issued and returned.
import { json, overLimit, clientIp, sameOrigin } from '../../_lib/util.js';
import { hashSecret, loadUserByName, newRecoveryCode, normaliseCode, publicUser, saveUser, sessionCookie, verifySecret, needStore } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const ns = needStore(env); if (ns) return ns;
  let body; try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const username = String(body.username || '').trim().toLowerCase();
  if (overLimit('reset-ip:' + clientIp(request), 10, 3600) || overLimit('reset-user:' + username, 5, 3600)) return json({ error: 'rate_limited' }, 429);
  const password = String(body.password || '');
  if (password.length < 8 || password.length > 200) return json({ error: 'weak_password' }, 400);
  const user = await loadUserByName(env, username);
  const code = normaliseCode(body.recoveryCode);
  if (!user || !code || !(await verifySecret(code, user.recovery))) return json({ error: 'bad_recovery' }, 401);
  const recovery = newRecoveryCode();
  user.pw = await hashSecret(password);
  user.recovery = await hashSecret(recovery);
  user.sv = (user.sv || 0) + 1; // signs out every other device
  if (!(await saveUser(env, user))) return json({ error: 'storage_busy' }, 503);
  return new Response(JSON.stringify({ user: publicUser(user), recoveryCode: recovery }), {
    status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'set-cookie': await sessionCookie(env, request, user) },
  });
}
