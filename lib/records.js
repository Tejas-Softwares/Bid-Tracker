// Shared bid data. Every record carries a version; a change is accepted only if it is newer than what the
// server holds (higher version, then later time), so two people editing at once always end up agreeing.
import { fail } from './http.js';
import { logActivity, bidChanges, describeBidUpdate, statusLabel, inr } from './activity.js';

export const COLLS = ['bids', 'revisions', 'notes', 'clients', 'settings', 'nt'];
const MAX_RECORD = 200 * 1024;
const num = (x) => (x === null || x === undefined ? 0 : Number(x));

export async function pull(q, since, limit = 5000) {
  const rows = await q(`select data, seq from records where seq > $1 order by seq limit $2`, [since, limit]);
  const records = rows.map((r) => r.data);
  const cursor = rows.length ? num(rows[rows.length - 1].seq) : since;
  return { records, cursor, more: rows.length === limit };
}

export async function maxSeq(q) {
  const r = await q(`select coalesce(max(seq), 0) as m from records`);
  return num(r[0].m);
}

function key(r) { return r._c + ':' + r.id; }
function newer(a, b) {
  if (num(a._v) !== num(b._v)) return num(a._v) > num(b._v);
  if (num(a._ts) !== num(b._ts)) return num(a._ts) > num(b._ts);
  return String(a._dev || '') > String(b._dev || '');
}

async function fetchExisting(q, keys) {
  if (!keys.length) return new Map();
  const rows = await q(`select r.coll, r.id, r.data from records r join unnest($1::text[], $2::text[]) as k(coll, id) on r.coll = k.coll and r.id = k.id`,
    [keys.map((k) => k.split(':')[0]), keys.map((k) => k.slice(k.indexOf(':') + 1))]);
  return new Map(rows.map((r) => [r.coll + ':' + r.id, r.data]));
}

// Write records that win over what is stored. Returns the keys actually written.
export async function upsert(q, list, byName) {
  const written = new Set();
  for (let i = 0; i < list.length; i += 400) {
    const part = list.slice(i, i + 400);
    const rows = await q(`insert into records (coll, id, v, ts, dev, del, data, seq, updated_by)
      select k.coll, k.id, k.v, k.ts, k.dev, k.del, k.data, nextval('rec_seq'), $8
      from unnest($1::text[], $2::text[], $3::int[], $4::bigint[], $5::text[], $6::boolean[], $7::jsonb[]) as k(coll, id, v, ts, dev, del, data)
      on conflict (coll, id) do update set v = excluded.v, ts = excluded.ts, dev = excluded.dev, del = excluded.del, data = excluded.data, seq = excluded.seq, updated_by = excluded.updated_by, updated_at = now()
      where (records.v, records.ts, records.dev) < (excluded.v, excluded.ts, excluded.dev)
      returning coll, id`,
    [part.map((r) => r._c), part.map((r) => r.id), part.map((r) => num(r._v)), part.map((r) => num(r._ts)), part.map((r) => String(r._dev || '')),
      part.map((r) => !!r._del), part.map((r) => JSON.stringify(r)), byName || '']);
    for (const r of rows) written.add(r.coll + ':' + r.id);
  }
  return written;
}

// A push from a browser: validate, stamp who did it, write what wins, log what changed.
export async function push(q, req, user, incoming, reason) {
  if (!Array.isArray(incoming)) fail(400, 'Nothing to save.', 'bad_request');
  if (incoming.length > 2000) fail(413, 'Too many changes at once.', 'too_many');
  const best = new Map();
  for (const r of incoming) {
    if (!r || typeof r !== 'object' || !COLLS.includes(r._c) || typeof r.id !== 'string' || !r.id || r.id.length > 64) continue;
    if (JSON.stringify(r).length > MAX_RECORD) fail(413, 'One of the records is too large to save.', 'too_large');
    if (!Number.isFinite(Number(r._v)) || !Number.isFinite(Number(r._ts))) continue;
    const k = key(r);
    if (!best.has(k) || newer(r, best.get(k))) best.set(k, r);
  }
  const keys = [...best.keys()];
  const old = await fetchExisting(q, keys);
  const toWrite = [];
  const fromFile = reason === 'restore-file' || reason === 'merge-file';
  for (const [k, r0] of best) {
    const prev = old.get(k);
    if (r0._c === 'settings' && user.role !== 'admin') continue; // only admins change settings
    const r = { ...r0, _by: user.name, _uid: user.id };
    // who created something is set by the server and never changes afterwards
    if (r._c === 'bids') {
      if (prev) { r.createdBy = prev.createdBy; r.createdUid = prev.createdUid; r.createdAt = prev.createdAt; }
      else if (fromFile && r0.createdBy) { r.createdUid = ''; r.createdAt = r.createdAt || Date.now(); } // keep who made it in the old tracker
      else { r.createdBy = user.name; r.createdUid = user.id; r.createdAt = r.createdAt || Date.now(); }
    }
    if (r._c === 'notes' || r._c === 'nt') {
      if (prev) { r.by = prev.by; r.uid = prev.uid; } else if (fromFile && r0.by) { r.uid = ''; } else { r.by = user.name; r.uid = user.id; }
    }
    toWrite.push(r);
  }
  const written = await upsert(q, toWrite, user.name);
  // what is stored now, for the browser to adopt
  const stored = await fetchExisting(q, keys);
  const applied = toWrite.filter((r) => written.has(key(r)));
  await logPush(q, req, user, applied, old, reason);
  return { records: [...stored.values()] };
}

async function bidLookup(q, applied) {
  const map = new Map();
  for (const r of applied) if (r._c === 'bids') map.set(r.id, r);
  const need = [...new Set(applied.filter((r) => r.bidId && !map.has(r.bidId)).map((r) => r.bidId))];
  if (need.length) {
    const rows = await q(`select id, data from records where coll = 'bids' and id = any($1::text[])`, [need]);
    for (const r of rows) map.set(r.id, r.data);
  }
  return map;
}

async function logPush(q, req, user, applied, old, reason) {
  if (!applied.length) return;
  const count = (c, f = () => true) => applied.filter((r) => r._c === c && f(r)).length;
  if (reason) {
    const parts = [];
    const live = (r) => !r._del;
    const dead = (r) => r._del;
    if (reason === 'erase' || reason === 'clear-sample') {
      const n = count('bids', dead);
      const summary = reason === 'erase' ? `Deleted everything: ${n} bid${n === 1 ? '' : 's'}, ${count('clients', dead)} client${count('clients', dead) === 1 ? '' : 's'}` : `Removed ${n} sample bid${n === 1 ? '' : 's'}`;
      return logActivity(q, req, user, [{ action: reason === 'erase' ? 'data.erase' : 'data.sample', summary, details: { counts: { bids: n } } }]);
    }
    const n = (k, one, many) => { const c = count(k, live); if (c) parts.push(`${c} ${c === 1 ? one : many}`); };
    n('bids', 'bid', 'bids'); n('revisions', 'offer', 'offers'); n('nt', 'NT item', 'NT items'); n('clients', 'client', 'clients');
    const what = parts.join(', ') || `${applied.length} records`;
    const action = reason === 'import' ? 'data.import' : reason === 'sample' ? 'data.sample' : 'data.restore';
    const summary = reason === 'import' ? `Imported ${what} from Excel` : reason === 'sample' ? `Loaded ${what} as sample data` : reason === 'merge-file' ? `Added ${what} from a backup file` : `Replaced everything with a backup file (${what})`;
    return logActivity(q, req, user, [{ action, summary, details: { counts: { bids: count('bids'), revisions: count('revisions'), clients: count('clients'), notes: count('notes') } } }]);
  }
  const bids = await bidLookup(q, applied);
  const entries = [];
  const deletedBids = new Set(applied.filter((r) => r._c === 'bids' && r._del && !(old.get(key(r))?._del)).map((r) => r.id));
  const related = new Map(); // bid id -> keys deleted along with it
  for (const r of applied) {
    const prev = old.get(key(r));
    const b = r._c === 'bids' ? r : bids.get(r.bidId) || {};
    const ctx = { entity: r._c, entityId: r.id, bidId: r._c === 'bids' ? r.id : r.bidId || null, bidNo: b.no || '', bidName: b.name || '' };
    const no = b.no || 'a bid';
    if (r._c !== 'bids' && r.bidId && deletedBids.has(r.bidId) && r._del) { if (!related.has(r.bidId)) related.set(r.bidId, []); related.get(r.bidId).push(key(r)); continue; }
    if (r._c === 'bids') {
      if (!prev) entries.push({ ...ctx, action: 'bid.create', summary: `Added bid ${r.no || ''} ${r.name || ''}`.replace(/\s+/g, ' ').trim(), details: { client: r.client || '', company: r.company || '' } });
      else if (r._del && !prev._del) entries.push({ ...ctx, action: 'bid.delete', summary: `Deleted bid ${r.no || ''} ${r.name || ''}`.trim(), details: { client: r.client || '', status: statusLabel(r.status) } });
      else if (!r._del && prev._del) entries.push({ ...ctx, action: 'bid.restore', summary: `Restored bid ${r.no || ''} ${r.name || ''}`.trim() });
      else {
        if (prev.status !== r.status) entries.push({ ...ctx, action: 'bid.status', summary: `Moved ${no} from ${statusLabel(prev.status)} to ${statusLabel(r.status)}`, details: { from: prev.status, to: r.status } });
        const ch = bidChanges(prev, r);
        if (ch.length) entries.push({ ...ctx, action: 'bid.update', summary: describeBidUpdate(no, ch), details: { changes: ch } });
      }
    } else if (r._c === 'revisions') {
      const v = inr(r.value);
      if (!prev) entries.push({ ...ctx, action: 'offer.add', summary: `Added offer ${v} on ${no}${r.reason ? ` (${r.reason})` : ''}`, details: { value: r.value, reason: r.reason || '' } });
      else if (r._del && !prev._del) entries.push({ ...ctx, action: 'offer.delete', summary: `Deleted offer ${inr(prev.value)} on ${no}`, details: { value: prev.value } });
      else if (!r._del) entries.push({ ...ctx, action: 'offer.edit', summary: `Edited offer on ${no}${prev.value !== r.value ? `: ${inr(prev.value)} to ${v}` : ''}`, details: { changes: bidChanges(prev, r).map((c) => ({ ...c, label: c.f })) } });
    } else if (r._c === 'nt') {
      if (!prev) entries.push({ ...ctx, action: 'nt.add', summary: `Added NT item "${String(r.desc || '').slice(0, 60)}" ${inr(r.amount)} on ${no}`, details: { amount: r.amount, status: r.status || '' } });
      else if (r._del && !prev._del) entries.push({ ...ctx, action: 'nt.delete', summary: `Deleted NT item "${String(prev.desc || '').slice(0, 60)}" on ${no}`, details: { amount: prev.amount } });
      else if (!r._del) entries.push({ ...ctx, action: 'nt.edit', summary: `Edited NT item "${String(r.desc || '').slice(0, 60)}" on ${no}`, details: { changes: bidChanges(prev, r).map((c) => ({ ...c, label: c.f })) } });
    } else if (r._c === 'notes') {
      if (r.kind === 'event') continue;
      if (!prev) entries.push({ ...ctx, action: 'note.add', summary: `Added a note on ${no}`, details: { text: String(r.text || '').slice(0, 300) } });
      else if (r._del && !prev._del) entries.push({ ...ctx, action: 'note.delete', summary: `Deleted a note on ${no}`, details: { text: String(prev.text || '').slice(0, 300) } });
    } else if (r._c === 'clients') {
      const c2 = { ...ctx, bidId: null, bidNo: '', bidName: '' };
      if (!prev) entries.push({ ...c2, action: 'client.create', summary: `Added client ${r.name || ''}` });
      else if (r._del && !prev._del) entries.push({ ...c2, action: 'client.delete', summary: `Deleted client ${prev.name || ''}` });
      else if (!r._del) {
        const ch = bidChanges(prev, r).map((c) => ({ ...c, label: c.f === 'contacts' ? 'contacts' : c.label }));
        if (ch.length) entries.push({ ...c2, action: 'client.update', summary: `Edited client ${r.name || ''}: ${[...new Set(ch.map((c) => c.label))].join(', ')}`, details: { changes: ch } });
      }
    } else if (r._c === 'settings') {
      const ch = bidChanges(prev || {}, r).map((c) => c.f);
      entries.push({ entity: 'settings', entityId: r.id, action: 'settings.update', summary: `Changed settings: ${ch.join(', ') || 'lists'}`, details: { keys: ch } });
    }
  }
  for (const e of entries) if (e.action === 'bid.delete') e.details.related = related.get(e.bidId) || [];
  await logActivity(q, req, user, entries);
}

// Bring back a deleted bid together with its offers, notes and NT items deleted with it
export async function restoreDeleted(q, req, user, activityId) {
  const a = (await q(`select * from activity where id = $1`, [activityId]))[0];
  if (!a || a.action !== 'bid.delete') fail(404, 'That deletion was not found.', 'not_found');
  const keys = [`bids:${a.bid_id}`, ...((a.details && a.details.related) || [])];
  const existing = await fetchExisting(q, keys);
  const bid = existing.get(`bids:${a.bid_id}`);
  if (!bid) fail(404, 'That bid is no longer in the database.', 'not_found');
  if (!bid._del) fail(409, 'That bid has already been restored.', 'already');
  const now = Date.now();
  const list = [];
  for (const r of existing.values()) {
    if (!r._del) continue;
    const n = { ...r, _v: num(r._v) + 1, _ts: Math.max(now, num(r._ts) + 1), _by: user.name, _uid: user.id, _dev: 'server' };
    delete n._del;
    list.push(n);
  }
  await upsert(q, list, user.name);
  await logActivity(q, req, user, [{ action: 'bid.restore', entity: 'bids', entityId: bid.id, bidId: bid.id, bidNo: bid.no || '', bidName: bid.name || '', summary: `Restored bid ${bid.no || ''} ${bid.name || ''} (deleted by ${a.user_name || 'someone'})`.trim(), details: { restored: list.length } }]);
  return list.length;
}

// ---------- backups ----------
export async function snapshot(q, kind, byName) {
  const rows = await q(`select data from records`);
  const records = rows.map((r) => r.data);
  const live = records.filter((r) => !r._del).length;
  if (kind === 'daily') {
    await q(`insert into backups (day, kind, by_name, count, records) values (current_date, 'daily', $1, $2, $3::jsonb) on conflict do nothing`, [byName || 'automatic', live, JSON.stringify(records)]);
  } else {
    await q(`insert into backups (day, kind, by_name, count, records) values (current_date, $1, $2, $3, $4::jsonb)`, [kind, byName || '', live, JSON.stringify(records)]);
  }
  await q(`delete from backups where at < now() - interval '90 days'`);
  return live;
}

let lastDaily = '';
export async function dailyIfNeeded(q) {
  const day = new Date().toISOString().slice(0, 10);
  if (lastDaily === day) return;
  const r = await q(`select 1 from backups where kind = 'daily' and day = current_date`);
  if (!r.length) {
    const any = await q(`select 1 from records where not del limit 1`);
    if (any.length) await snapshot(q, 'daily', 'automatic');
  }
  lastDaily = day;
}

// Put the whole tracker back the way it was in a backup; the restore reaches every browser
export async function restoreSnapshot(q, user, records) {
  const now = Date.now();
  const current = new Map((await q(`select data from records`)).map((r) => [r.data._c + ':' + r.data.id, r.data]));
  const keep = new Set();
  const list = [];
  for (const r of records) {
    if (!r || !COLLS.includes(r._c) || !r.id) continue;
    const k = key(r);
    keep.add(k);
    const cur = current.get(k);
    list.push({ ...r, _v: Math.max(num(cur?._v), num(r._v)) + 1, _ts: now, _by: user.name, _uid: user.id, _dev: 'server' });
  }
  for (const [k, cur] of current) {
    if (keep.has(k) || cur._del) continue;
    list.push({ ...cur, _del: true, _v: num(cur._v) + 1, _ts: now, _by: user.name, _uid: user.id, _dev: 'server' });
  }
  await upsert(q, list, user.name);
  return list.length;
}

// When someone's name changes, the bids they own follow, and every browser picks the change up
export async function renameOwner(q, userId, name) {
  await q(`update records set
      data = data || jsonb_build_object('owner', $2::text, '_v', v + 1, '_ts', (extract(epoch from now()) * 1000)::bigint),
      v = v + 1, ts = (extract(epoch from now()) * 1000)::bigint, seq = nextval('rec_seq'), updated_at = now()
    where coll = 'bids' and data->>'ownerUid' = $1 and not del`, [userId, name]);
}
