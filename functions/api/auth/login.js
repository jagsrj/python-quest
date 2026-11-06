// POST /api/auth/login { username, password }
import { json, overLimit, clientIp, sameOrigin } from '../../_lib/util.js';
import { loadUserByName, publicUser, sessionCookie, verifySecret, needStore } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const ns = needStore(env); if (ns) return ns;
  let body; try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (overLimit('login-ip:' + clientIp(request), 30, 3600) || overLimit('login-user:' + username, 10, 900)) return json({ error: 'rate_limited' }, 429);
  const user = username ? await loadUserByName(env, username) : null;
  if (!user || !user.pw || !(await verifySecret(password, user.pw))) {
    return json({ error: 'bad_login' }, 401);
  }
  return new Response(JSON.stringify({ user: publicUser(user) }), {
    status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'set-cookie': await sessionCookie(env, request, user) },
  });
}
