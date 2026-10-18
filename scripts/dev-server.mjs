// Runs the tracker on your own computer, the way Vercel runs it: the built app from public/ and the API
// functions from api/, with an in-process Postgres (PGlite) instead of Neon. For trying changes and for tests.
//
//   npm run dev                      -> http://localhost:3000, data kept in .dev-data/
//   PORT=4100 DEV_DATA=memory node scripts/dev-server.mjs   -> fresh, in-memory database
//
// The first account needs the setup code: SETUP_CODE (default "dev-setup").
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pub = path.join(root, 'public');
const port = Number(process.env.PORT) || 3000;
process.env.SETUP_CODE = process.env.SETUP_CODE || 'dev-setup';
process.env.CRON_SECRET = process.env.CRON_SECRET || 'dev-cron';

const dataDir = process.env.DEV_DATA === 'memory' ? undefined : (process.env.DEV_DATA || path.join(root, '.dev-data'));
const pg = new PGlite(dataDir);
await pg.waitReady;
// Same shape as the Neon driver: rows back, numbers from bigint columns as strings
globalThis.__TBT_DB = async (text, params = []) => {
  const r = await pg.query(text, params, { rowMode: 'object' });
  return r.rows.map((row) => { for (const k in row) if (typeof row[k] === 'bigint') row[k] = String(row[k]); return row; });
};

const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };

function headersFor(url) {
  const out = {};
  for (const h of vercel.headers || []) {
    const re = new RegExp('^' + h.source.replace(/\(\.\*\)/g, '(.*)').replace(/\//g, '\\/') + '$');
    if (re.test(url)) for (const { key, value } of h.headers) if (key !== 'Strict-Transport-Security') out[key] = value;
  }
  return out;
}

const handlers = {};
async function api(name) {
  if (!/^[a-z-]+$/.test(name)) return null;
  const file = path.join(root, 'api', name + '.js');
  if (!fs.existsSync(file)) return null;
  if (!handlers[name]) handlers[name] = (await import(file)).default;
  return handlers[name];
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (u.pathname.startsWith('/api/')) {
      const fn = await api(u.pathname.slice(5).replace(/\/$/, ''));
      if (!fn) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"Not found"}'); return; }
      // what Vercel adds to a Node request
      req.query = Object.fromEntries(u.searchParams);
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString('utf8');
      req.body = raw && /json/.test(req.headers['content-type'] || '') ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : raw || undefined;
      for (const [k, v] of Object.entries(headersFor(u.pathname))) res.setHeader(k, v);
      await fn(req, res);
      return;
    }
    let p = decodeURIComponent(u.pathname);
    if (p === '/') p = '/index.html';
    const file = path.join(pub, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(pub) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', ...headersFor(u.pathname) });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500);
    res.end('Server error');
  }
});

server.listen(port, () => console.log(`Tejas Bid Tracker running at http://localhost:${port}  (setup code: ${process.env.SETUP_CODE}, data: ${dataDir || 'in memory'})`));
