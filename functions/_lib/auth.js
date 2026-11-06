// Accounts for Python Quest, stored in Cloudflare KV (binding STORE).
// Kid-safe by design: a username and a password are the only details collected. No email, no real name, no Google.
//
// KV keys
//   user:<username lower-case>  → { id, username, pw, recovery, createdAt, sv }
//   uid:<id>                    → username lower-case (lookup for sessions)
//   prog:<id>                   → progress JSON
//
// Passwords and recovery codes (shown to learners as their "Save Code") are hashed with PBKDF2-SHA256 (100,000 iterations, the Workers maximum).
// Sessions are stateless: an HMAC-signed token in an HttpOnly cookie, so signing in costs no KV write.
import { json, safePut } from './util.js';

export const USERNAME_RE = /^[a-z0-9_]{3,24}$/;
export const SESSION_COOKIE = 'pq_session';
const SESSION_DAYS = 90;
const enc = new TextEncoder();

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

export function randomId(bytes = 12) { return b64url(crypto.getRandomValues(new Uint8Array(bytes))); }

export function newRecoveryCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const b = crypto.getRandomValues(new Uint8Array(16));
  let s = '';
  b.forEach((x, i) => { s += A[x % A.length]; if (i % 4 === 3 && i < 15) s += '-'; });
  return s;
}
export const normaliseCode = (c) => {
  const raw = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return raw.length === 16 ? raw.match(/.{4}/g).join('-') : '';
};

export async function hashSecret(secret, saltB64) {
  const salt = saltB64 ? fromB64url(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return `pbkdf2$100000$${b64url(salt)}$${b64url(bits)}`;
}
export async function verifySecret(secret, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [, , salt, want] = stored.split('$');
  const got = (await hashSecret(secret, salt)).split('$')[3];
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

async function hmacKey(env) {
  let secret = env.AUTH_SECRET;
  if (!secret) {
    secret = await env.STORE.get('auth:hmac');
    if (!secret) { secret = randomId(32); await env.STORE.put('auth:hmac', secret); }
  }
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function signToken(env, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}
export async function verifyToken(env, token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(env), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    if (!p.exp || p.exp < Date.now()) return null;
    return p;
  } catch { return null; }
}

export function getCookie(request, name) {
  const m = (request.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
export function cookie(name, value, maxAgeSeconds, request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export async function sessionCookie(env, request, user) {
  const token = await signToken(env, { uid: user.id, u: user.username, exp: Date.now() + SESSION_DAYS * 86400000, v: user.sv || 0 });
  return cookie(SESSION_COOKIE, token, SESSION_DAYS * 86400, request);
}
export const clearSessionCookie = (request) => cookie(SESSION_COOKIE, '', 0, request);

export async function loadUserByName(env, username) { return env.STORE.get('user:' + username.toLowerCase(), 'json'); }
export async function loadUserById(env, id) {
  const name = await env.STORE.get('uid:' + id);
  return name ? loadUserByName(env, name) : null;
}
export async function saveUser(env, user) {
  const ok = await safePut(env, 'user:' + user.username.toLowerCase(), JSON.stringify(user));
  if (ok) await safePut(env, 'uid:' + user.id, user.username.toLowerCase());
  return ok;
}

/** Returns the signed-in user (from the session cookie), or null. Sessions die when the password changes (sv). */
export async function currentUser(env, request) {
  const p = await verifyToken(env, getCookie(request, SESSION_COOKIE));
  if (!p) return null;
  const user = await loadUserById(env, p.uid);
  if (!user || (user.sv || 0) !== (p.v || 0)) return null;
  return user;
}

export const publicUser = (u) => ({ username: u.username, createdAt: u.createdAt });

export function needStore(env) { return env.STORE ? null : json({ error: 'not_configured' }, 503); }
