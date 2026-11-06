// POST /api/auth/logout
import { clearSessionCookie } from '../../_lib/auth.js';
export const onRequestPost = ({ request }) => new Response('{"ok":true}', { headers: { 'content-type': 'application/json', 'set-cookie': clearSessionCookie(request) } });
