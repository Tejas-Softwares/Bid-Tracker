// Backups kept in the database: one automatic copy a day (90 days kept), plus copies made by hand. Admins only.
import { db } from '../lib/db.js';
import { route, send, fail, body, query } from '../lib/http.js';
import { requireUser, requireAdmin } from '../lib/auth.js';
import { snapshot, restoreSnapshot } from '../lib/records.js';
import { logActivity } from '../lib/activity.js';

export default route(async (req, res) => {
  const q = await db();
  const me = await requireUser(q, req);
  requireAdmin(me);
  if (req.method === 'GET') {
    const id = query(req).id;
    if (id) {
      const r = (await q(`select at, records from backups where id = $1`, [Number(id)]))[0];
      if (!r) fail(404, 'That backup was not found.', 'not_found');
      return send(res, 200, { app: 'tejas-bid-tracker', format: 1, savedAt: new Date(r.at).getTime(), records: r.records });
    }
    const rows = await q(`select id, day, kind, at, by_name, count from backups order by at desc limit 120`);
    return send(res, 200, { backups: rows.map((r) => ({ id: Number(r.id), kind: r.kind, at: new Date(r.at).getTime(), by: r.by_name, count: r.count })) });
  }
  if (req.method !== 'POST') fail(405, 'Not allowed.', 'method');
  const b = body(req);
  if (b.action === 'create') {
    const n = await snapshot(q, 'manual', me.name);
    await logActivity(q, req, me, [{ action: 'data.backup', summary: `Saved a backup (${n} records)` }]);
    return send(res, 200, { ok: true });
  }
  if (b.action === 'restore') {
    const r = (await q(`select at, kind, records from backups where id = $1`, [Number(b.id)]))[0];
    if (!r) fail(404, 'That backup was not found.', 'not_found');
    await snapshot(q, 'before-restore', me.name);
    const n = await restoreSnapshot(q, me, r.records);
    await logActivity(q, req, me, [{ action: 'data.restore', summary: `Restored the ${r.kind} backup of ${new Date(r.at).toISOString().slice(0, 10)} (${n} records changed). A copy of what was there before was saved first.` }]);
    return send(res, 200, { ok: true, changed: n });
  }
  fail(400, 'Unknown action.', 'bad_request');
});
