// Activity: everything anyone has done in the tracker, newest first, with the person's name and email.
// The server writes every entry from what actually changed, so entries cannot be edited from a browser.
import { store } from '../store.js';
import { ui, openBid, rerender } from '../nav.js';
import { api, pull } from '../server.js';
import { esc, fmtDate, fmtTime, fmtDateTime, timeAgo, today, addDays, plural, debounce, isoDate, DAYS_LONG } from '../util.js';
import { icon, avatar, toast, confirmBox } from '../ui.js';

// The main kinds of activity, shown as quick filters. The server keeps the same list (lib/activity.js).
const CATS = [
  ['', 'Everything'],
  ['deletes', 'Deletions and restores'],
  ['bids_added', 'Bids added'],
  ['status', 'Stage changes'],
  ['bids_changed', 'Bids edited'],
  ['offers', 'Offers and NT items'],
  ['notes', 'Notes'],
  ['clients', 'Clients'],
  ['signins', 'Sign-ins'],
  ['users', 'Users and access'],
  ['data', 'Settings and data'],
];
const PERIODS = [['1', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 3 months'], ['365', 'Last 12 months'], ['all', 'All time']];

// What kind of thing happened, for the small tag in front of each entry
const KIND = {
  create: ['Added', 'add'], add: ['Added', 'add'], update: ['Edited', 'edit'], edit: ['Edited', 'edit'], status: ['Stage', 'stage'],
  delete: ['Deleted', 'del'], restore: ['Restored', 'add'], erase: ['Erased', 'del'], decline: ['Declined', 'del'], disable: ['Turned off', 'del'],
  signin: ['Signed in', 'auth'], signout: ['Signed out', 'auth'], failed: ['Failed sign-in', 'del'], approve: ['Approved', 'add'], enable: ['Turned on', 'add'],
  signup: ['Signed up', 'auth'], setup: ['Set up', 'auth'], role: ['Role', 'edit'], reset: ['Reset link', 'auth'], password: ['Password', 'auth'],
  import: ['Imported', 'add'], export: ['Exported', 'auth'], sample: ['Sample', 'edit'], backup: ['Backup', 'auth'],
};
const ENTITY_ICON = { bid: 'bids', offer: 'rupee', nt: 'list', note: 'note', client: 'clients', auth: 'shield', user: 'user', settings: 'settings', data: 'folder' };

export const act = {
  category: '', user: '', period: '30', q: '',
  items: [], more: false, stillDeleted: new Set(),
  loading: false, error: '', key: null, fetchedAt: 0, open: new Set(),
};

const keyOf = () => JSON.stringify([act.category, act.user, act.period, act.q.trim()]);

function params(before) {
  const p = { limit: 100 };
  if (act.category) p.category = act.category;
  if (act.user) p.user = act.user;
  if (act.period !== 'all') p.from = new Date(addDays(today(), -(Number(act.period) - 1)) + 'T00:00:00').toISOString();
  if (act.q.trim()) p.q = act.q.trim();
  if (before) p.before = before;
  return p;
}

async function load(more = false) {
  if (act.loading) return;
  const key = keyOf();
  act.loading = true; act.error = '';
  if (!more) act.key = key;
  try {
    const r = await api('activity', { query: params(more ? act.items[act.items.length - 1]?.id : 0) });
    if (keyOf() !== key) return; // filters changed while loading; the next render loads again
    act.items = more ? [...act.items, ...r.items] : r.items;
    act.more = r.more;
    act.stillDeleted = new Set([...(more ? act.stillDeleted : []), ...r.stillDeleted]);
    act.fetchedAt = Date.now();
  } catch (e) {
    act.error = e.message;
    act.fetchedAt = Date.now();
  } finally {
    act.loading = false;
    if (ui.view === 'activity') rerender();
  }
}

// People to filter by: admins see everyone (also accounts that were turned off), members see the active team
function people() {
  const list = new Map();
  for (const u of (store.isAdmin && ui.allUsers) || store.users || []) list.set(u.id, { id: u.id, name: u.name, email: u.email });
  for (const it of act.items) if (it.user_id && !list.has(it.user_id)) list.set(it.user_id, { id: it.user_id, name: it.user_name, email: it.user_email });
  return [...list.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function dayLabel(ms) {
  const d = isoDate(new Date(ms));
  if (d === today()) return 'Today';
  if (d === addDays(today(), -1)) return 'Yesterday';
  return `${DAYS_LONG[new Date(ms).getDay()]} ${fmtDate(d)}`;
}
const clock = (ms) => { const d = new Date(ms); return fmtTime(`${d.getHours()}:${d.getMinutes()}`); };

function detailsHtml(it) {
  const d = it.details || {};
  const parts = [];
  if (Array.isArray(d.changes) && d.changes.length) {
    parts.push(`<table class="tbl compact act-changes"><thead><tr><th>What</th><th>Before</th><th>After</th></tr></thead><tbody>${d.changes.slice(0, 40).map((c) => `<tr><td>${esc(c.label || c.f)}</td><td>${c.from ? esc(c.from) : '<span class="muted">empty</span>'}</td><td>${c.to ? esc(c.to) : '<span class="muted">empty</span>'}</td></tr>`).join('')}</tbody></table>`);
  }
  if (d.text) parts.push(`<blockquote class="act-quote">${esc(d.text)}</blockquote>`);
  if (d.counts) parts.push(`<p class="small">${Object.entries(d.counts).filter(([, n]) => n).map(([k, n]) => `${n} ${esc(k)}`).join(' · ') || 'Nothing'}</p>`);
  if (d.client) parts.push(`<p class="small">Client: ${esc(d.client)}${d.status ? ` · stage when deleted: ${esc(d.status)}` : ''}</p>`);
  if (Array.isArray(d.related) && d.related.length) parts.push(`<p class="small muted">${plural(d.related.length, 'offer, note or NT item')} went with it.</p>`);
  return parts.join('');
}
const hasDetails = (it) => { const d = it.details || {}; return (Array.isArray(d.changes) && d.changes.length) || d.text || d.counts || d.client; };

function entry(it) {
  const [ent, verb] = String(it.action).split('.');
  const [kindLabel, kindCls] = KIND[verb] || ['Other', 'edit'];
  const bidHere = it.bid_id && store.get('bids', it.bid_id);
  const canRestore = it.action === 'bid.delete' && store.isAdmin && act.stillDeleted.has(it.bid_id);
  const open = act.open.has(it.id);
  const more = hasDetails(it);
  return `<li class="act-item ${open ? 'open' : ''}" data-act-id="${it.id}">
    <div class="act-time" title="${esc(fmtDateTime(it.at))}">${esc(clock(it.at))}</div>
    <div class="act-who">${avatar(it.user_name || '?', 'sm')}<div><b>${esc(it.user_name || 'Unknown')}</b><span>${esc(it.user_email || '')}</span></div></div>
    <div class="act-what">
      <div class="act-line"><span class="act-tag ${kindCls}">${icon(ENTITY_ICON[ent] || 'history')}${esc(kindLabel)}</span><span class="act-sum">${esc(it.summary)}</span></div>
      ${(it.bid_name && !String(it.summary).includes(it.bid_name)) ? `<div class="small muted">${esc(it.bid_name)}</div>` : ''}
      ${open && more ? `<div class="act-details">${detailsHtml(it)}</div>` : ''}
    </div>
    <div class="act-btns">
      ${more ? `<button class="btn btn-ghost btn-sm" data-act="act-toggle" data-id="${it.id}" aria-expanded="${open}">${open ? 'Hide' : 'Details'}</button>` : ''}
      ${bidHere ? `<button class="btn btn-ghost btn-sm" data-act="act-open-bid" data-id="${esc(it.bid_id)}">Open bid</button>` : ''}
      ${canRestore ? `<button class="btn btn-sm" data-act="act-restore" data-id="${it.id}">${icon('refresh')} Restore bid</button>` : ''}
    </div>
  </li>`;
}

export function renderActivity() {
  const ppl = people();
  const filtered = act.category || act.user || act.q.trim() || act.period !== '30';
  const groups = [];
  for (const it of act.items) {
    const lbl = dayLabel(it.at);
    if (!groups.length || groups[groups.length - 1].lbl !== lbl) groups.push({ lbl, items: [] });
    groups[groups.length - 1].items.push(it);
  }
  const catName = (CATS.find((c) => c[0] === act.category) || CATS[0])[1];
  let list;
  if (act.error && !act.items.length) list = `<div class="empty"><h3>The activity could not be loaded</h3><p>${esc(act.error)}</p><div class="acts"><button class="btn" data-act="act-refresh">${icon('refresh')} Try again</button></div></div>`;
  else if (act.key !== keyOf() || (!act.items.length && act.loading)) list = `<p class="muted" style="padding:20px 4px">Loading activity…</p>`;
  else if (!act.items.length) list = `<div class="empty"><h3>Nothing here</h3><p>No ${act.category ? esc(catName.toLowerCase()) : 'activity'} ${act.period === 'all' ? '' : 'in ' + esc((PERIODS.find((p) => p[0] === act.period) || [])[1] || '').toLowerCase()}${act.user ? ' by this person' : ''}.</p>${filtered ? '<div class="acts"><button class="btn" data-act="act-clear">Clear filters</button></div>' : ''}</div>`;
  else list = groups.map((g) => `<section class="act-day"><h3>${esc(g.lbl)}</h3><ul class="act-list">${g.items.map(entry).join('')}</ul></section>`).join('')
    + (act.more ? `<div style="text-align:center;margin:16px 0"><button class="btn" data-act="act-more" ${act.loading ? 'disabled' : ''}>${act.loading ? 'Loading…' : 'Show older activity'}</button></div>` : `<p class="small muted" style="text-align:center;margin:18px 0">That is everything${act.period === 'all' ? '' : ' for this period'}.</p>`);

  return `
  <p class="lead-in">Every change anyone makes, with their name and email. Entries are written by the server and cannot be edited or removed.${store.isAdmin ? ' As an admin you can bring back a deleted bid from here.' : ''}</p>
  <div class="status-filter" role="group" aria-label="Kind of activity">
    ${CATS.map(([k, l]) => `<button class="${act.category === k ? 'on' : ''}" data-act="act-cat" data-v="${k}">${k === 'deletes' ? icon('trash') : ''}${esc(l)}</button>`).join('')}
  </div>
  <div class="toolbar">
    <select class="inp" data-af="user" aria-label="Person"><option value="">Everyone</option>${ppl.map((p) => `<option value="${esc(p.id)}" ${act.user === p.id ? 'selected' : ''}>${esc(p.name)} (${esc(p.email)})</option>`).join('')}</select>
    <select class="inp" data-af="period" aria-label="Period">${PERIODS.map(([k, l]) => `<option value="${k}" ${act.period === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
    <input class="inp" type="search" data-af="q" placeholder="Search bid number, name, person…" value="${esc(act.q)}" aria-label="Search activity" style="width:250px">
    ${filtered ? '<button class="btn btn-ghost btn-sm" data-act="act-clear">Clear filters</button>' : ''}
    <span class="grow"></span>
    <span class="count small muted">${act.items.length ? `${plural(act.items.length, 'entry', 'entries')}${act.more ? '+' : ''}` : ''}${act.fetchedAt ? ` · updated ${esc(timeAgo(act.fetchedAt))}` : ''}</span>
    <button class="btn btn-sm" data-act="act-refresh" ${act.loading ? 'disabled' : ''}>${icon('refresh')} Refresh</button>
  </div>
  ${act.error && act.items.length ? `<div class="banner">${icon('alert')}<span class="grow">${esc(act.error)}</span></div>` : ''}
  <div class="act-wrap">${list}</div>`;
}

// Load when the screen opens, when a filter changes, and again if the list is more than 20 seconds old
export function mountActivity() {
  if (act.loading) return;
  if (act.key !== keyOf() || Date.now() - act.fetchedAt > 20000) load();
}

export async function activityAction(name, el) {
  switch (name) {
    case 'act-cat': act.category = el.dataset.v; act.open.clear(); rerenderNow(); return true;
    case 'act-clear': Object.assign(act, { category: '', user: '', period: '30', q: '' }); act.open.clear(); rerenderNow(); return true;
    case 'act-refresh': act.fetchedAt = 0; load(); rerenderNow(); return true;
    case 'act-more': load(true); rerenderNow(); return true;
    case 'act-toggle': { const id = Number(el.dataset.id); if (act.open.has(id)) act.open.delete(id); else act.open.add(id); rerenderNow(); return true; }
    case 'act-open-bid': openBid(el.dataset.id); return true;
    case 'act-restore': {
      const it = act.items.find((x) => x.id === Number(el.dataset.id));
      if (!it) return true;
      if (!(await confirmBox(`Bring back ${esc(it.bid_no || '')} ${esc(it.bid_name || 'this bid')}, with its offers, notes and NT items? It was deleted by ${esc(it.user_name)} on ${esc(fmtDateTime(it.at))}.`, { title: 'Restore this bid?', ok: 'Restore bid' }))) return true;
      try {
        await api('activity', { method: 'POST', body: { action: 'restore', id: it.id } });
        await pull();
        toast('Bid restored');
        act.fetchedAt = 0; load();
      } catch (e) { toast(e.message); }
      return true;
    }
    default: return false;
  }
}

export function activityChange(el) {
  const k = el.dataset.af;
  if (k !== 'user' && k !== 'period') return false;
  act[k] = el.value; act.open.clear();
  rerenderNow();
  return true;
}

const typed = debounce((v) => { act.q = v; rerenderNow(); }, 300);
export function activityInput(el) {
  if (el.dataset.af !== 'q') return false;
  typed(el.value);
  return true;
}

const rerenderNow = () => rerender();
