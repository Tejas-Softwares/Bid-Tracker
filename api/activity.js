// The activity log: who did what, filterable. Admins can bring back a deleted bid from here.
import { db } from '../lib/db.js';
import { route, send, fail, body, query } from '../lib/http.js';
import { requireUser, requireAdmin } from '../lib/auth.js';
import { CATEGORIES, logActivity } from '../lib/activity.js';
import { restoreDeleted } from '../lib/records.js';

export default route(async (req, res) => {
  const q = await db();
  const me = await requireUser(q, req);
  if (req.method === 'GET') {
    const p = query(req);
    const where = [];
    const args = [];
    const add = (sql, v) => { args.push(v); where.push(sql.replace('?', '$' + args.length)); };
    if (p.category && CATEGORIES[p.category]) add('action = any(?::text[])', CATEGORIES[p.category].actions);
    if (p.user) add('user_id = ?', String(p.user));
    if (p.bid) add('bid_id = ?', String(p.bid));
    if (p.from) add('at >= ?::timestamptz', String(p.from));
    if (p.to) add('at < ?::timestamptz', String(p.to));
    if (p.q) add(`(summary ilike ? or coalesce(bid_no, '') ilike $${args.length + 1} or coalesce(user_name, '') ilike $${args.length + 1} or coalesce(user_email, '') ilike $${args.length + 1})`, `%${String(p.q).replace(/[%_\\]/g, (c) => '\\' + c)}%`);
    if (p.before) add('id < ?', Number(p.before));
    const limit = Math.min(200, Math.max(1, Number(p.limit) || 100));
    const rows = await q(`select id, at, user_id, user_name, user_email, action, entity, entity_id, bid_id, bid_no, bid_name, summary, details from activity ${where.length ? 'where ' + where.join(' and ') : ''} order by id desc limit ${limit + 1}`, args);
    const more = rows.length > limit;
    const items = rows.slice(0, limit).map((r) => ({ ...r, id: Number(r.id), at: new Date(r.at).getTime() }));
    // which deleted bids are still deleted, so the Restore button only shows when it can work
    const delIds = [...new Set(items.filter((r) => r.action === 'bid.delete').map((r) => r.bid_id))];
    let stillDeleted = [];
    if (delIds.length) stillDeleted = (await q(`select id from records where coll = 'bids' and del and id = any($1::text[])`, [delIds])).map((r) => r.id);
    return send(res, 200, { items, more, stillDeleted, categories: Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, v.label])) });
  }
  if (req.method !== 'POST') fail(405, 'Not allowed.', 'method');
  const b = body(req);
  if (b.action === 'restore') {
    requireAdmin(me);
    const n = await restoreDeleted(q, req, me, Number(b.id));
    return send(res, 200, { ok: true, restored: n });
  }
  if (b.action === 'log') {
    const allowed = { 'data.export': 'Exported to Excel', 'data.backup': 'Downloaded a backup' };
    if (!allowed[b.event]) fail(400, 'Unknown activity.', 'bad_request');
    await logActivity(q, req, me, [{ action: b.event, summary: String(b.summary || allowed[b.event]).slice(0, 200) }]);
    return send(res, 200, { ok: true });
  }
  fail(400, 'Unknown action.', 'bad_request');
});
