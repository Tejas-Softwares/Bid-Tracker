// The data store in the browser. Every piece of data is a "record" in one of six collections.
// Each record carries a version (_v), a timestamp (_ts), who changed it (_by, set by the server) and on
// which browser (_dev). Deleting keeps a tombstone (_del) so the deletion reaches everyone.
// The server holds the shared copy; this store keeps a cache so the app opens instantly and works
// through a short network drop, and records which changes still have to reach the server.

import { uid, debounce, normName } from './util.js';
import { DEFAULT_SETTINGS } from './config.js';

export const COLLS = ['bids', 'revisions', 'notes', 'clients', 'settings', 'nt'];
const IDB_NAME = 'tejas-bid-tracker-web';
const LS = 'tbtw.';

// ---------- tiny IndexedDB wrapper ----------
let idbP = null;
function idb() {
  if (idbP) return idbP;
  idbP = new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return idbP;
}
export async function kvGet(key) {
  const db = await idb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try { const r = db.transaction('kv').objectStore('kv').get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => resolve(undefined); } catch { resolve(undefined); }
  });
}
export async function kvSet(key, val) {
  const db = await idb();
  if (!db) return false;
  return new Promise((resolve) => {
    try { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(val, key); tx.oncomplete = () => resolve(true); tx.onerror = () => resolve(false); } catch { resolve(false); }
  });
}

// Per-browser preferences (last filters and the like). Not shared with the team.
export const prefs = {
  get(k, d) { try { const v = localStorage.getItem(LS + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch { /* */ } },
  del(k) { try { localStorage.removeItem(LS + k); } catch { /* */ } },
};

// ---------- the store ----------
const data = Object.fromEntries(COLLS.map((c) => [c, new Map()]));
const listeners = new Set();
let version = 0;
let device = prefs.get('device', null);
if (!device) { device = uid('d'); prefs.set('device', device); }
// Changes not yet confirmed by the server: key -> { rec, reason }
const pending = new Map();

export const store = {
  device,
  user: null,   // the signed-in person: { id, name, email, position, role }
  users: [],    // everyone with an active account (for the bid owner list)
  cursor: 0,    // how far this browser has read the server's changes
  get version() { return version; },
  get me() { return this.user ? this.user.name : ''; },
  get isAdmin() { return !!(this.user && this.user.role === 'admin'); },

  // Open the cached copy, but only if it belongs to the person who is signed in
  async load(userId) {
    const owner = await kvGet('cacheUser');
    if (owner && owner !== userId) { await this.wipeLocal(); }
    const saved = await kvGet('records');
    if (Array.isArray(saved)) for (const r of saved) if (r && COLLS.includes(r._c) && r.id) data[r._c].set(r.id, r);
    this.cursor = (await kvGet('cursor')) || 0;
    const pend = await kvGet('pending');
    if (Array.isArray(pend)) for (const p of pend) if (p && p.rec) pending.set(p.rec._c + ':' + p.rec.id, p);
    await kvSet('cacheUser', userId);
    version++;
  },

  all(coll) { return Array.from(data[coll].values()).filter((r) => !r._del); },
  get(coll, id) { const r = data[coll].get(id); return r && !r._del ? r : null; },
  raw(coll, id) { return data[coll].get(id) || null; },
  count() { return COLLS.reduce((n, c) => n + this.all(c).length, 0); },
  records() { const out = []; for (const c of COLLS) for (const r of data[c].values()) out.push(r); return out; },

  create(coll, fields, opts = {}) {
    const id = fields.id || uid(coll[0]);
    const rec = { ...fields, id, _c: coll, _v: 1, _ts: Date.now(), _by: this.me, _dev: device };
    if (coll === 'bids') { rec.createdAt = rec.createdAt || Date.now(); rec.createdBy = rec.createdBy || this.me; rec.createdDev = rec.createdDev || device; }
    data[coll].set(id, rec);
    changed({ local: true, recs: [rec], reason: opts.reason });
    return rec;
  },

  update(coll, id, patch, opts = {}) {
    const old = data[coll].get(id);
    if (!old) return null;
    let diff = false;
    for (const k of Object.keys(patch)) if (JSON.stringify(old[k]) !== JSON.stringify(patch[k])) { diff = true; break; }
    if (!diff && !old._del) return old;
    const rec = { ...old, ...patch, _v: (old._v || 0) + 1, _ts: Math.max(Date.now(), (old._ts || 0) + 1), _by: this.me, _dev: device };
    delete rec._del;
    if (patch._del) rec._del = true;
    data[coll].set(id, rec);
    changed({ local: true, recs: [rec], reason: opts.reason });
    return rec;
  },

  remove(coll, id) { return this.update(coll, id, { _del: true }); },
  restore(coll, id) { const r = data[coll].get(id); if (!r) return null; return this.update(coll, id, { _restored: Date.now() }); },

  // Many records at once (import, sample data) go to the server as one change with a reason
  createMany(list, reason) {
    const recs = [];
    for (const [coll, fields] of list) {
      const id = fields.id || uid(coll[0]);
      const rec = { ...fields, id, _c: coll, _v: 1, _ts: Date.now(), _by: this.me, _dev: device };
      if (coll === 'bids') { rec.createdAt = rec.createdAt || Date.now(); rec.createdBy = rec.createdBy || this.me; rec.createdDev = device; }
      data[coll].set(id, rec); recs.push(rec);
    }
    changed({ local: true, recs, reason });
  },
  removeMany(pairs, reason) {
    const recs = [];
    for (const [coll, id] of pairs) {
      const old = data[coll].get(id); if (!old || old._del) continue;
      const rec = { ...old, _del: true, _v: (old._v || 0) + 1, _ts: Math.max(Date.now(), (old._ts || 0) + 1), _by: this.me, _dev: device };
      data[coll].set(id, rec); recs.push(rec);
    }
    changed({ local: true, recs, reason });
  },

  // Records from the server. Newer versions win; a copy with the same version replaces ours too,
  // because the server adds who made the change.
  merge(records, opts = {}) {
    let n = 0; const ids = new Set();
    for (const r of records) {
      if (!r || !COLLS.includes(r._c) || !r.id) continue;
      const k = r._c + ':' + r.id;
      const cur = data[r._c].get(r.id);
      const same = cur && cur._v === r._v && cur._ts === r._ts && cur._dev === r._dev;
      if (!cur || wins(r, cur) || (same && JSON.stringify(cur) !== JSON.stringify(r))) {
        // never let an older server copy overwrite a change still waiting to be sent
        const p = pending.get(k);
        if (p && wins(p.rec, r)) continue;
        data[r._c].set(r.id, r); n++; ids.add(r.id);
      }
      const p = pending.get(k);
      if (p && !wins(p.rec, r)) pending.delete(k);
    }
    if (n) changed({ local: false, ids, quiet: opts.quiet });
    else if (opts.persist) persist();
    return n;
  },

  // The server refused these changes: go back to its copy (or drop a record it never accepted)
  refuse(list, serverCopies) {
    const ids = new Set();
    for (const r of list) {
      const k = r._c + ':' + r.id;
      pending.delete(k);
      const s = serverCopies.get(k);
      if (s) data[r._c].set(r.id, s); else data[r._c].delete(r.id);
      ids.add(r.id);
    }
    persistPending();
    changed({ local: false, ids });
  },

  // Changes waiting for the server, grouped so an import goes as one batch
  pendingList() { return Array.from(pending.values()); },
  pendingCount() { return pending.size; },
  confirm(keysSent) { for (const k of keysSent) { const p = pending.get(k.key); if (p && p.rec._v === k.v && p.rec._ts === k.ts) pending.delete(k.key); } persistPending(); },

  // Restore a backup file: every record gets a newer version, and records not in the backup are deleted
  restoreSnapshot(records) {
    const keep = new Set();
    const now = Date.now();
    const recs = [];
    for (const r of records) {
      if (!r || !COLLS.includes(r._c) || !r.id) continue;
      const cur = data[r._c].get(r.id);
      keep.add(r._c + ':' + r.id);
      const rec = { ...r, _v: Math.max(cur?._v || 0, r._v || 0) + 1, _ts: now, _by: this.me, _dev: device };
      data[r._c].set(r.id, rec); recs.push(rec);
    }
    for (const c of COLLS) for (const [id, cur] of data[c]) {
      if (keep.has(c + ':' + id) || cur._del) continue;
      const rec = { ...cur, _del: true, _v: (cur._v || 0) + 1, _ts: now, _by: this.me, _dev: device };
      data[c].set(id, rec); recs.push(rec);
    }
    changed({ local: true, recs, reason: 'restore-file' });
  },

  // Add the records from a backup file that are not here yet; nothing here changes. Bids that already exist
  // under the same name and client are skipped together with their offers, notes and NT items.
  mergeSnapshot(records) {
    const now = Date.now();
    const recs = [];
    const have = new Set(this.all('bids').map((b) => normName(b.name) + '|' + normName(b.client)));
    const skipBid = new Set();
    for (const r of records) if (r && r._c === 'bids' && !r._del && !data.bids.has(r.id) && have.has(normName(r.name) + '|' + normName(r.client))) skipBid.add(r.id);
    for (const r of records) {
      if (!r || !COLLS.includes(r._c) || !r.id || r._del || data[r._c].has(r.id)) continue;
      if (skipBid.has(r.id) || (r.bidId && skipBid.has(r.bidId))) continue;
      let rec = { ...r, _v: Math.max(1, r._v || 1), _ts: now, _by: this.me, _dev: device };
      if (r._c === 'settings') {
        if (r.id !== 'main') continue;
        const { team, prefix, ...lists } = rec; // people now come from accounts, prefixes from the companies
        rec = lists;
      }
      data[r._c].set(r.id, rec); recs.push(rec);
    }
    if (recs.length) changed({ local: true, recs, reason: 'merge-file' });
    return recs.length;
  },

  settings() {
    const s = data.settings.get('main');
    const merged = { ...DEFAULT_SETTINGS, ...(s && !s._del ? s : {}) };
    merged.probabilities = { ...DEFAULT_SETTINGS.probabilities, ...(merged.probabilities || {}) };
    if (!Array.isArray(merged.companies) || merged.companies.length < 2) merged.companies = DEFAULT_SETTINGS.companies;
    return merged;
  },
  saveSettings(patch) {
    if (!data.settings.get('main')) return this.create('settings', { id: 'main', ...patch });
    return this.update('settings', 'main', patch);
  },

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  // Forget this browser's copy (on sign-out, or when someone else signs in here)
  async wipeLocal() {
    for (const c of COLLS) data[c].clear();
    pending.clear();
    this.cursor = 0;
    version++;
    await kvSet('records', []);
    await kvSet('pending', []);
    await kvSet('cursor', 0);
  },
  async saveCursor(c) { this.cursor = c; await kvSet('cursor', c); },
};

export function wins(a, b) {
  if ((a._v || 0) !== (b._v || 0)) return (a._v || 0) > (b._v || 0);
  if ((a._ts || 0) !== (b._ts || 0)) return (a._ts || 0) > (b._ts || 0);
  return String(a._dev || '') > String(b._dev || '');
}

const persist = debounce(() => kvSet('records', store.records()), 300);
const persistPending = debounce(() => kvSet('pending', Array.from(pending.values())), 100);
window.addEventListener('beforeunload', () => { persist.flush(); persistPending.flush(); });

function changed(info) {
  version++;
  if (info.local && info.recs) {
    for (const r of info.recs) pending.set(r._c + ':' + r.id, { rec: r, reason: info.reason || null });
    persistPending();
  }
  persist();
  for (const fn of listeners) { try { fn(info); } catch (e) { console.error(e); } }
}
