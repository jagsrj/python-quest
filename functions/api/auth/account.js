// POST /api/auth/account — signed-in account actions.
//   { op: 'password', current, password }  change the password
//   { op: 'recovery' }                     issue a new Save Code (the old one stops working)
//   { op: 'delete', confirm: username }    delete the account and all saved progress
import { json, sameOrigin, overLimit, clientIp } from '../../_lib/util.js';
import { clearSessionCookie, currentUser, hashSecret, newRecoveryCode, publicUser, saveUser, sessionCookie, verifySecret, needStore } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const ns = needStore(env); if (ns) return ns;
  const user = await currentUser(env, request);
  if (!user) return json({ error: 'signed_out' }, 401);
  if (overLimit('account:' + clientIp(request), 20, 3600)) return json({ error: 'rate_limited' }, 429);
  let body; try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }

  if (body.op === 'password') {
    const password = String(body.password || '');
    if (password.length < 8 || password.length > 200) return json({ error: 'weak_password' }, 400);
    if (!(await verifySecret(String(body.current || ''), user.pw))) return json({ error: 'bad_login' }, 401);
    user.pw = await hashSecret(password);
    user.sv = (user.sv || 0) + 1;
    if (!(await saveUser(env, user))) return json({ error: 'storage_busy' }, 503);
    return new Response(JSON.stringify({ user: publicUser(user) }), { headers: { 'content-type': 'application/json', 'set-cookie': await sessionCookie(env, request, user) } });
  }
  if (body.op === 'recovery') {
    const recovery = newRecoveryCode();
    user.recovery = await hashSecret(recovery);
    if (!(await saveUser(env, user))) return json({ error: 'storage_busy' }, 503);
    return json({ recoveryCode: recovery });
  }
  if (body.op === 'delete') {
    if (String(body.confirm || '').toLowerCase() !== user.username) return json({ error: 'bad_request' }, 400);
    await Promise.all([
      env.STORE.delete('user:' + user.username), env.STORE.delete('uid:' + user.id), env.STORE.delete('prog:' + user.id),
    ]);
    return new Response('{"ok":true}', { headers: { 'content-type': 'application/json', 'set-cookie': clearSessionCookie(request) } });
  }
  return json({ error: 'bad_request' }, 400);
}
