// GET /api/auth/me — the signed-in user, or null.
import { json } from '../../_lib/util.js';
import { currentUser, publicUser } from '../../_lib/auth.js';
export async function onRequestGet({ request, env }) {
  if (!env.STORE) return json({ user: null, configured: false });
  const u = await currentUser(env, request);
  return json({ user: u ? publicUser(u) : null, configured: true });
}
