// POST /api/auth/signup { username, password, grownupOk } → creates an account, signs in,
// and returns a one-time Save Code (recovery code) the learner writes down.
// Only a username and a hashed password are stored. grownupOk must be true: the sign-up form asks
// the learner to confirm a parent or teacher said it is OK to make an account.
import { json, overLimit, clientIp, sameOrigin } from '../../_lib/util.js';
import { USERNAME_RE, hashSecret, loadUserByName, newRecoveryCode, publicUser, randomId, saveUser, sessionCookie, needStore } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const ns = needStore(env); if (ns) return ns;
  if (overLimit('signup:' + clientIp(request), 10, 3600)) return json({ error: 'rate_limited' }, 429);
  let body; try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (body.grownupOk !== true) return json({ error: 'need_grownup' }, 400);
  if (!USERNAME_RE.test(username)) return json({ error: 'bad_username' }, 400);
  if (password.length < 8 || password.length > 200) return json({ error: 'weak_password' }, 400);
  if (await loadUserByName(env, username)) return json({ error: 'username_taken' }, 409);
  const recovery = newRecoveryCode();
  const user = { id: randomId(), username, pw: await hashSecret(password), recovery: await hashSecret(recovery), createdAt: new Date().toISOString(), sv: 0 };
  if (!(await saveUser(env, user))) return json({ error: 'storage_busy' }, 503);
  return new Response(JSON.stringify({ user: publicUser(user), recoveryCode: recovery }), {
    status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'set-cookie': await sessionCookie(env, request, user) },
  });
}
