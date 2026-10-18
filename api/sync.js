// The shared bid data: GET fetches what changed since a point, POST saves changes.
import { db } from '../lib/db.js';
import { route, send, fail, body, query } from '../lib/http.js';
import { requireUser, publicUser } from '../lib/auth.js';
import { pull, push, maxSeq, dailyIfNeeded, snapshot } from '../lib/records.js';

const REASONS = ['import', 'sample', 'restore-file', 'merge-file', 'clear-sample', 'erase'];
const ADMIN_ONLY = ['sample', 'restore-file', 'merge-file', 'clear-sample', 'erase'];

export default route(async (req, res) => {
  const q = await db();
  const user = await requireUser(q, req);
  if (req.method === 'GET') {
    const since = Math.max(0, Number(query(req).since) || 0);
    const out = await pull(q, since);
    const users = await q(`select id, name, email, position, role, status from users where status = 'active' order by name`);
    try { await dailyIfNeeded(q); } catch (e) { console.error('daily backup', e); }
    return send(res, 200, { ...out, users: users.map((u) => publicUser(u)), me: publicUser(user) });
  }
  if (req.method !== 'POST') fail(405, 'Not allowed.', 'method');
  const b = body(req);
  const reason = REASONS.includes(b.reason) ? b.reason : null;
  if (ADMIN_ONLY.includes(reason) && user.role !== 'admin') fail(403, 'Only an admin can do this.', 'admin_only');
  // Before wiping or replacing everything, keep a copy of what is there (once per operation, even if it arrives in parts)
  if (reason === 'erase' || reason === 'restore-file') {
    const kind = reason === 'erase' ? 'before-erase' : 'before-restore';
    const recent = await q(`select 1 from backups where kind = $1 and at > now() - interval '5 minutes' limit 1`, [kind]);
    if (!recent.length) await snapshot(q, kind, user.name);
  }
  const out = await push(q, req, user, b.records, reason);
  return send(res, 200, { ...out, cursor: await maxSeq(q) });
});
