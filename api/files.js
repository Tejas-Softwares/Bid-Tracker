// Files attached to a bid (tender documents). Stored on the server with that bid, not in the sync records.
import { db } from '../lib/db.js';
import { route, send, fail, body, query } from '../lib/http.js';
import { requireUser } from '../lib/auth.js';
import { logActivity } from '../lib/activity.js';

const MAX_FILE = 2 * 1024 * 1024;
const MAX_BID_BYTES = 20 * 1024 * 1024;
const MAX_BID_FILES = 50;

function cleanName(s) {
  s = String(s || '').replace(/[/\\]/g, '_').replace(/[^\w.+ ()\-\[\]]+/g, '_').replace(/_+/g, '_').trim();
  return s.slice(0, 180) || 'file';
}
function cleanPath(s) {
  const parts = String(s || '').replace(/\\/g, '/').split('/').filter((p) => p && p !== '.' && p !== '..').map(cleanName);
  return parts.join('/').slice(0, 400);
}
function newId() {
  const a = new Uint8Array(12);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
function b64Bytes(s) {
  const t = String(s || '').replace(/\s/g, '');
  if (!t || /[^A-Za-z0-9+/=]/.test(t)) return -1;
  try { return Buffer.from(t, 'base64').length; } catch { return -1; }
}

async function bidMeta(q, bidId) {
  const row = (await q(`select data from records where coll = 'bids' and id = $1 and not del`, [bidId]))[0];
  return row?.data || null;
}

export default route(async (req, res) => {
  const q = await db();
  const me = await requireUser(q, req);
  const p = query(req);

  if (req.method === 'GET' && p.id) {
    const row = (await q(`select id, bid_id, name, path, mime, size, content from bid_files where id = $1`, [String(p.id)]))[0];
    if (!row) fail(404, 'That file is no longer attached.', 'not_found');
    const bytes = Buffer.from(String(row.content || ''), 'base64');
    const safe = String(row.name || 'file').replace(/[\r\n"]/g, '');
    res.statusCode = 200;
    res.setHeader('Content-Type', row.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${p.inline ? 'inline' : 'attachment'}; filename="${safe}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(bytes);
    return;
  }

  if (req.method === 'GET') {
    const bidId = String(p.bid || '');
    if (!bidId) fail(400, 'Which bid?', 'bad_request');
    const rows = await q(`select id, bid_id, name, path, mime, size, by_name, at from bid_files where bid_id = $1 order by path, at`, [bidId]);
    const files = rows.map((r) => ({
      id: r.id, name: r.name, path: r.path, mime: r.mime, size: Number(r.size),
      by: r.by_name || '', at: new Date(r.at).getTime(),
    }));
    return send(res, 200, { files });
  }

  if (req.method !== 'POST') fail(405, 'Not allowed.', 'method');
  const b = body(req);

  if (b.action === 'delete') {
    const row = (await q(`select * from bid_files where id = $1`, [String(b.id || '')]))[0];
    if (!row) fail(404, 'That file is no longer attached.', 'not_found');
    await q(`delete from bid_files where id = $1`, [row.id]);
    const bid = await bidMeta(q, row.bid_id);
    await logActivity(q, req, me, [{
      action: 'bid.file.delete', entity: 'bid', entityId: row.bid_id, bidId: row.bid_id,
      bidNo: bid?.no || '', bidName: bid?.name || '',
      summary: `Removed document ${row.path || row.name} from ${bid?.no || 'a bid'}`,
    }]);
    return send(res, 200, { ok: true });
  }

  if (b.action !== 'upload') fail(400, 'Unknown action.', 'bad_request');
  const bidId = String(b.bidId || '');
  const bid = await bidMeta(q, bidId);
  if (!bid) fail(404, 'That bid is no longer in the tracker.', 'not_found');
  const name = cleanName(b.name);
  const path = cleanPath(b.path || name);
  const mime = String(b.mime || 'application/octet-stream').slice(0, 120);
  const content = String(b.content || '').replace(/\s/g, '');
  const size = b64Bytes(content);
  if (size < 1) fail(400, 'That file could not be read.', 'empty');
  if (size > MAX_FILE) fail(413, 'Each file can be up to 2 MB.', 'too_large');
  const stats = (await q(`select count(*)::int as n, coalesce(sum(size), 0)::bigint as bytes from bid_files where bid_id = $1`, [bidId]))[0];
  if (Number(stats.n) >= MAX_BID_FILES) fail(413, 'This bid already has 50 files. Remove some first.', 'too_many');
  if (Number(stats.bytes) + size > MAX_BID_BYTES) fail(413, 'This bid’s attached files would go over 20 MB.', 'too_large');
  const id = newId();
  await q(`insert into bid_files (id, bid_id, name, path, mime, size, content, by_name, by_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, bidId, name, path, mime, size, content, me.name, me.id]);
  await logActivity(q, req, me, [{
    action: 'bid.file.add', entity: 'bid', entityId: bidId, bidId, bidNo: bid.no || '', bidName: bid.name || '',
    summary: `Attached ${path} to ${bid.no || 'a bid'}`,
  }]);
  return send(res, 200, { ok: true, file: { id, name, path, mime, size, by: me.name, at: Date.now() } });
});
