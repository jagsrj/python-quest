// Local dev server: serves dist/ and runs the Cloudflare Pages Functions in functions/
// with an in-memory stand-in for the KV namespace, so accounts and sync can be tested locally.
//   python3 build.py && node scripts/dev-server.mjs            → http://localhost:8788
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const PORT = +(process.env.PORT || 8788);

const mem = new Map();
const STORE = {
  async get(key, type) { const v = mem.get(key); return v === undefined ? null : type === 'json' ? JSON.parse(v) : v; },
  async put(key, value) { mem.set(key, value); },
  async delete(key) { mem.delete(key); },
  async list({ prefix = '' } = {}) { return { keys: [...mem.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }; },
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.zip': 'application/zip' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const file = resolve(root, 'functions' + url.pathname + '.js');
      if (!existsSync(file)) { res.statusCode = 404; return res.end('{"error":"not_found"}'); }
      const chunks = []; for await (const c of req) chunks.push(c);
      const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
      const request = new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const mod = await import(pathToFileURL(file).href);
      const fn = (req.method === 'GET' && mod.onRequestGet) || (req.method === 'POST' && mod.onRequestPost) || mod.onRequest;
      const env = process.env.NO_STORE ? {} : { STORE };
      const response = fn ? await fn({ request, env }) : new Response('not found', { status: 404 });
      res.statusCode = response.status;
      response.headers.forEach((v, k) => { if (k !== 'set-cookie') res.setHeader(k, v); });
      const cookies = response.headers.getSetCookie(); if (cookies.length) res.setHeader('set-cookie', cookies);
      return res.end(Buffer.from(await response.arrayBuffer()));
    }
    if (url.pathname.startsWith('/pyodide/')) {
      const f = resolve(root, 'dist', url.pathname.slice(1));
      if (!f.startsWith(resolve(root, 'dist/pyodide'))) { res.statusCode = 404; return res.end(); }
      res.setHeader('content-type', TYPES[extname(f)] || 'application/octet-stream');
      return res.end(await readFile(f));
    }
    const html = await readFile(resolve(root, 'dist/index.html'), 'utf8');
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(html);
  } catch (e) { res.statusCode = 500; res.end(String(e)); }
}).listen(PORT, () => console.log(`Python Quest dev server on http://localhost:${PORT}`));
