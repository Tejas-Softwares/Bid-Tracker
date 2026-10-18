// Talking to the server: a small fetch wrapper, and the sync loop that sends this browser's changes and
// picks up everyone else's every few seconds.
import { store, wins } from './store.js';
import { fixDuplicateNumbers } from './derive.js';
import { debounce } from './util.js';

export class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

let onSignedOut = () => {};
export function setSignedOutHandler(fn) { onSignedOut = fn; }

export async function api(path, { method = 'GET', body, query } = {}) {
  const url = '/api/' + path + (query ? '?' + new URLSearchParams(query).toString() : '');
  let r;
  try {
    r = await fetch(url, { method, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-TBT': '1' }, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check the internet connection.', 'offline');
  }
  let j = {};
  try { j = await r.json(); } catch { j = {}; }
  if (!r.ok) {
    const err = new ApiError(r.status, j.error || `The server answered with an error (${r.status}).`, j.code);
    if (r.status === 401 && path !== 'auth') onSignedOut(err);
    throw err;
  }
  return j;
}

// ---------- sync ----------
const listeners = new Set();
export const net = {
  status: 'connecting', // connecting | online | saving | offline
  lastSync: 0,
  error: '',
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
function set(patch) {
  const before = net.status;
  Object.assign(net, patch);
  if (patch.status !== undefined && patch.status !== before) for (const fn of listeners) { try { fn(net); } catch (e) { console.error(e); } }
  else if (patch.lastSync) for (const fn of listeners) { try { fn(net); } catch (e) { console.error(e); } }
}

const POLL_MS = 8000;
let timer = null;
let running = false;

export async function startSync() {
  running = true;
  await pull();
  await push();
  clearInterval(timer);
  timer = setInterval(() => { if (document.visibilityState === 'visible') { pull(); if (store.pendingCount()) push(); } }, POLL_MS);
}
export function stopSync() { running = false; clearInterval(timer); timer = null; }
document.addEventListener('visibilitychange', () => { if (running && document.visibilityState === 'visible') { pull(); push(); } });
window.addEventListener('online', () => { if (running) { push(); pull(); } });

let pulling = null;
export function pull() {
  if (pulling) return pulling;
  pulling = (async () => {
    try {
      let more = true;
      let merged = 0;
      while (more) {
        const r = await api('sync', { query: { since: store.cursor } });
        merged += store.merge(r.records, { persist: true });
        await store.saveCursor(r.cursor);
        if (r.users) store.users = r.users;
        if (r.me && store.user) store.user = { ...store.user, ...r.me };
        more = r.more;
      }
      if (merged) fixDuplicateNumbers();
      set({ status: store.pendingCount() ? 'saving' : 'online', lastSync: Date.now(), error: '' });
    } catch (e) {
      if (e.status !== 401) set({ status: 'offline', error: e.message });
    } finally { pulling = null; }
  })();
  return pulling;
}

let pushing = null;
let again = false;
export const pushSoon = debounce(() => push(), 500);
export function push() {
  if (pushing) { again = true; return pushing; }
  if (!store.pendingCount()) { if (net.status === 'saving') set({ status: 'online' }); return Promise.resolve(); }
  pushing = (async () => {
    set({ status: 'saving' });
    try {
      // one batch per reason, so an import is logged as one import
      const groups = new Map();
      for (const p of store.pendingList()) { const k = p.reason || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.rec); }
      for (const [reason, recs] of groups) {
        for (let i = 0; i < recs.length; i += 300) {
          const part = recs.slice(i, i + 300);
          const r = await api('sync', { method: 'POST', body: { records: part, reason: reason || undefined } });
          const back = new Map(r.records.map((x) => [x._c + ':' + x.id, x]));
          store.merge(r.records);
          // anything the server refused (for example settings changed by someone who is not an admin) goes back to the server's copy
          const refused = part.filter((x) => { const s = back.get(x._c + ':' + x.id); return !s || wins(x, s); });
          if (refused.length) store.refuse(refused, back);
        }
      }
      set({ status: 'online', lastSync: Date.now(), error: '' });
    } catch (e) {
      if (e.status !== 401) set({ status: 'offline', error: e.message });
    } finally {
      pushing = null;
      if (again) { again = false; setTimeout(push, 50); }
    }
  })();
  return pushing;
}

// Before signing out: make sure nothing is left unsent
export async function flush() { pushSoon.flush && pushSoon.flush(); try { await push(); } catch { /* */ } return store.pendingCount() === 0; }
