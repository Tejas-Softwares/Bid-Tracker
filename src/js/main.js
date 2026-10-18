// App shell: sign-in gate, sidebar, top bar, routing, keyboard shortcuts and the one place every click is handled.
import { store, prefs } from './store.js';
import { derived, view } from './derive.js';
import { STATUS, OPEN_KEYS } from './config.js';
import { esc, today, timeAgo, plural, debounce, initials } from './util.js';
import { icon, toast, popMenu, initTips, initFormChecks, avatar, confirmBox } from './ui.js';
import { ui, setRenderer, rerender, go, openBid, closeBid, openClient, closeClient, readHash, saveFilters } from './nav.js';
import { api, net, startSync, stopSync, pull, pushSoon, flush, setSignedOutHandler } from './server.js';
import { newBidModal, setStatus, statusMenuItems, quickNoteModal, emdReturned } from './actions.js';
import { renderDashboard, mountDashboard } from './views/dashboard.js';
import { renderBids, filterBids, sortBids } from './views/bids.js';
import { renderBoard, mountBoard } from './views/board.js';
import { renderCalendar } from './views/calendar.js';
import { renderClients, renderClientPanel, saveClientField, contactModal, newClientModal, clientMenu } from './views/clients.js';
import { renderReports, mountReports } from './views/reports.js';
import { renderSettings, settingsAction, settingsChange, settingsSubmit } from './views/settings.js';
import { renderActivity, activityAction, activityChange, activityInput, mountActivity } from './views/activity.js';
import { renderHelp } from './views/help.js';
import { renderBidPanel, mountBidPanel, saveField, bidPanelAction } from './views/bidpanel.js';
import { renderAuth, submitAuth, authState, prepareReset } from './views/auth.js';
import { exportExcel } from './excel.js';
import { BRAND } from './brand.gen.js';

const TITLES = { dashboard: 'Dashboard', bids: 'Bids', board: 'Board', calendar: 'Calendar', clients: 'Clients', reports: 'Reports', activity: 'Activity', settings: 'Settings', help: 'Guide' };
const NAV = [
  ['dashboard', 'Dashboard', 'dashboard'], ['bids', 'Bids', 'bids'], ['board', 'Board', 'board'], ['calendar', 'Calendar', 'calendar'],
  ['clients', 'Clients', 'clients'], ['reports', 'Reports', 'reports'], ['activity', 'Activity', 'history'],
];
let signedIn = false;
let drawerPending = false;

function shell() {
  document.body.innerHTML = `
  <div class="app" id="app" hidden>
    <aside class="side" id="side" aria-label="Main">
      <div class="brand"><div class="brand-mark">${BRAND.mark}</div><div class="brand-text"><div class="brand-word">${BRAND.word}</div><div class="brand-app">Bid Tracker</div></div></div>
      <nav class="nav" id="nav"></nav>
      <div class="side-foot" id="side-foot"></div>
    </aside>
    <div class="main">
      <header class="top">
        <button class="icon-btn menu-btn" data-act="toggle-side" aria-label="Menu">${icon('menu')}</button>
        <h1 id="title">Dashboard</h1><span class="sub" id="subtitle"></span>
        <span class="grow"></span>
        <div class="search" id="search">${icon('search')}<input id="q" type="search" placeholder="Search bids and clients" autocomplete="off" aria-label="Search bids and clients"><kbd>/</kbd><div class="search-results hidden" id="q-res" role="listbox"></div></div>
        <button class="btn btn-primary" data-act="new-bid">${icon('plus')}<span class="btn-new-label">New bid</span></button>
      </header>
      <div id="banner"></div>
      <main class="content" id="content" tabindex="-1"></main>
    </div>
  </div>
  <div id="drawer-root"></div>
  <div id="auth-root"></div>`;
}

// ---------------- rendering ----------------
function renderChrome() {
  if (!signedIn) return;
  const d = derived();
  const openN = d.bids.filter((b) => OPEN_KEYS.includes(b.status)).length;
  const high = d.attention.filter((a) => a.sev === 'high').length;
  const counts = { dashboard: high ? `<span class="count alert" title="${plural(high, 'urgent item')}">${high}</span>` : '', bids: openN ? `<span class="count">${openN}</span>` : '', clients: d.clients.length ? `<span class="count">${d.clients.length}</span>` : '' };
  document.getElementById('nav').innerHTML = NAV.map(([k, l, ic]) => `<a href="#/${k}" class="${ui.view === k ? 'on' : ''}" data-act="go" data-view="${k}" ${ui.view === k ? 'aria-current="page"' : ''}>${icon(ic)}${l}${counts[k] || ''}</a>`).join('')
    + `<div class="nav-sep"></div>`
    + [['settings', 'Settings', 'settings'], ['help', 'Guide', 'help']].map(([k, l, ic]) => `<a href="#/${k}" class="${ui.view === k ? 'on' : ''}" data-act="go" data-view="${k}">${icon(ic)}${l}</a>`).join('');
  const u = store.user || {};
  document.getElementById('side-foot').innerHTML = `${statusBox()}<button class="me-btn" data-act="me-menu" aria-haspopup="menu" title="Your account">${avatar(u.name)}<span style="flex:1;min-width:0"><b style="display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(u.name || '')}</b><span class="small muted" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(u.position || u.email || '')}${u.role === 'admin' ? ' · Admin' : ''}</span></span>${icon('down', 'me-caret')}</button>`;
  document.getElementById('title').textContent = TITLES[ui.view];
  document.getElementById('subtitle').textContent = ui.view === 'dashboard' && d.bids.length ? `${plural(openN, 'open bid')}` : '';
  document.getElementById('side').classList.toggle('open', ui.sideOpen);
  document.getElementById('banner').innerHTML = banner();
  document.title = `${TITLES[ui.view]} · Tejas Bid Tracker`;
}

function statusBox() {
  const n = store.pendingCount();
  if (net.status === 'offline') return `<div class="sync-box"><div class="row"><span class="dot err"></span>Offline</div><p>${n ? `${plural(n, 'change')} will be saved when the connection is back.` : 'Showing the last copy downloaded.'}</p><button class="btn btn-sm" data-act="retry-sync">${icon('refresh')} Try again</button></div>`;
  if (net.status === 'saving' || n) return `<div class="sync-box"><div class="row"><span class="dot warn"></span>Saving…</div></div>`;
  if (net.status === 'connecting') return `<div class="sync-box"><div class="row"><span class="dot warn"></span>Connecting…</div></div>`;
  return `<div class="sync-box"><div class="row"><span class="dot ok"></span>All changes saved</div><p>Updated ${esc(timeAgo(net.lastSync))}</p></div>`;
}

function banner() {
  if (store.isAdmin && ui.pendingUsers) return `<div class="banner info">${icon('users')}<span class="grow"><b>${plural(ui.pendingUsers, 'account')} waiting for your approval.</b></span><button class="btn btn-sm btn-primary" data-act="go" data-view="settings" data-tab="team">Review</button></div>`;
  if (net.status === 'offline' && store.pendingCount()) return `<div class="banner">${icon('alert')}<span class="grow">No connection to the server. Your last ${plural(store.pendingCount(), 'change')} will be saved as soon as it is back. Keep this tab open.</span><button class="btn btn-sm" data-act="retry-sync">Try again</button></div>`;
  return '';
}

function focusKey(el) {
  if (!el || el === document.body) return null;
  for (const a of ['data-filter', 'data-client-q', 'data-li-new', 'data-setting', 'data-prob', 'data-act-q', 'data-co', 'data-af']) if (el.hasAttribute(a)) return `[${a}="${el.getAttribute(a)}"]`;
  if (el.hasAttribute('data-li')) { const l = el.closest('[data-list]'); return l ? `[data-list="${l.dataset.list}"] [data-li="${el.dataset.li}"]` : null; }
  if (el.id) return '#' + CSS.escape(el.id);
  return null;
}

function renderAuthScreen() {
  const root = document.getElementById('auth-root');
  const fk = focusKey(document.activeElement);
  const values = {};
  root.querySelectorAll('input[name]').forEach((i) => { if (i.type !== 'password' && i.type !== 'checkbox') values[i.name] = i.value; });
  root.innerHTML = renderAuth();
  for (const [k, v] of Object.entries(values)) { const i = root.querySelector(`input[name="${k}"]`); if (i && !i.value) i.value = v; }
  const target = (fk && root.querySelector(fk)) || root.querySelector('.auth-msg.err') && root.querySelector('input[name="password"]') || root.querySelector('input:not([type=checkbox])');
  // move the cursor only if the person is not already typing in a field
  if (target) setTimeout(() => { const a = document.activeElement; if (!a || a === document.body || !root.contains(a) || a.tagName === 'BUTTON') target.focus(); }, 20);
}

function renderAll(part) {
  const tip = document.querySelector('.tip'); if (tip) tip.style.display = 'none';
  if (!signedIn) { renderAuthScreen(); return; }
  if (part === 'panel') { renderDrawer(true); return; }
  renderChrome();
  const content = document.getElementById('content');
  const active = document.activeElement;
  const inContent = content.contains(active);
  const fk = inContent ? focusKey(active) : null;
  const sel = inContent && active && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  const html = ({ dashboard: renderDashboard, bids: renderBids, board: renderBoard, calendar: renderCalendar, clients: renderClients, reports: renderReports, activity: renderActivity, settings: renderSettings, help: renderHelp })[ui.view](ui);
  content.innerHTML = html;
  if (ui.view === 'dashboard') mountDashboard(content);
  if (ui.view === 'board') mountBoard(content);
  if (ui.view === 'reports') mountReports(content);
  if (ui.view === 'activity') mountActivity(content);
  if (fk) { const el = content.querySelector(fk); if (el) { el.focus(); if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch { /* */ } } }
  renderDrawer();
}

function renderDrawer(force) {
  const root = document.getElementById('drawer-root');
  const a = document.activeElement;
  const want = ui.bid ? 'b:' + ui.bid : ui.client ? 'c:' + ui.client : '';
  // Don't redraw the open panel under someone's cursor; redraw when they leave the field
  if (!force && want && want === (root.dataset.open || '') && root.contains(a) && a.matches('input, textarea, select')) { drawerPending = true; return; }
  drawerPending = false;
  if (ui.bid && !store.get('bids', ui.bid)) ui.bid = null;
  if (ui.client && !store.get('clients', ui.client)) ui.client = null;
  const body = root.querySelector('.d-body');
  const scroll = body ? body.scrollTop : 0;
  const wasOpen = root.dataset.open || '';
  const nowOpen = ui.bid ? 'b:' + ui.bid : ui.client ? 'c:' + ui.client : '';
  root.innerHTML = ui.bid ? renderBidPanel() : ui.client ? renderClientPanel() : '';
  root.dataset.open = nowOpen;
  const tabChanged = root.dataset.tab !== ui.tab;
  root.dataset.tab = ui.tab;
  if (wasOpen === nowOpen && nowOpen) {
    root.querySelector('.scrim')?.style.setProperty('animation', 'none');
    root.querySelector('.drawer')?.style.setProperty('animation', 'none');
    const nb = root.querySelector('.d-body'); if (nb) nb.scrollTop = tabChanged ? 0 : scroll;
  } else if (nowOpen) {
    setTimeout(() => root.querySelector('.drawer [data-act="close-bid"], .drawer [data-act="close-client"]')?.focus({ preventScroll: true }), 30);
  }
  if (ui.bid) mountBidPanel(root);
  document.body.style.overflow = nowOpen ? 'hidden' : '';
}

// ---------------- signing in and out ----------------
async function enterApp(user) {
  store.user = user;
  await store.load(user.id);
  signedIn = true;
  document.getElementById('auth-root').innerHTML = '';
  document.getElementById('app').hidden = false;
  if (!location.hash.startsWith('#/') || location.hash.startsWith('#/reset')) history.replaceState(null, '', '#/dashboard');
  readHash();
  renderAll();
  await startSync();
  refreshPendingUsers();
  rerender();
}

function leaveApp(message) {
  stopSync();
  signedIn = false;
  ui.bid = null; ui.client = null;
  document.getElementById('app').hidden = true;
  document.getElementById('drawer-root').innerHTML = '';
  document.querySelectorAll('.modal-wrap, .menu').forEach((m) => m.remove());
  document.body.style.overflow = '';
  authState.screen = 'signin'; authState.error = ''; authState.info = message || '';
  renderAuthScreen();
}

async function signOut() {
  const ok = await flush();
  if (!ok && !(await confirmBox(`${plural(store.pendingCount(), 'change')} could not be saved because the server cannot be reached. Sign out anyway and lose ${store.pendingCount() === 1 ? 'it' : 'them'}?`, { title: 'Changes not saved', ok: 'Sign out anyway', danger: true }))) return;
  try { await api('auth', { method: 'POST', body: { action: 'logout' } }); } catch { /* signed out locally anyway */ }
  await store.wipeLocal();
  store.user = null;
  leaveApp('You have signed out.');
}

async function refreshPendingUsers() {
  if (!store.isAdmin) { ui.pendingUsers = 0; return; }
  try { const r = await api('users'); ui.pendingUsers = r.users.filter((u) => u.status === 'pending').length; ui.allUsers = r.users; renderChrome(); } catch { /* */ }
}

// ---------------- events ----------------
async function onClick(e) {
  if (!signedIn) {
    const g = e.target.closest('[data-auth-go]');
    if (g && g.dataset.authGo === 'reload') { location.reload(); return; }
    if (g) { e.preventDefault(); authState.screen = g.dataset.authGo; authState.error = ''; if (g.dataset.authGo !== 'signin') authState.info = ''; renderAuthScreen(); }
    return;
  }
  if (e.target.closest('.search') && !e.target.closest('#q-res button')) return;
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (el.tagName === 'A') e.preventDefault();
  if (el.tagName === 'INPUT' && el.type === 'checkbox') { /* let the box tick */ } else if (el.tagName !== 'INPUT') e.preventDefault();
  if (bidPanelAction(act, el)) return;
  if (await settingsAction(act, el)) return;
  if (await activityAction(act, el)) return;
  const id = el.dataset.id;
  switch (act) {
    case 'go': {
      const opts = {};
      if (el.dataset.filterStatus || el.dataset.filterDue || el.dataset.filterFy) opts.filters = { status: el.dataset.filterStatus || 'open', due: el.dataset.filterDue || '', fy: el.dataset.filterFy || '', owner: '', sector: '', q: '' };
      if (el.dataset.view === 'settings' && el.dataset.tab) ui.settingsTab = el.dataset.tab;
      if (el.dataset.view === 'reports' && el.dataset.tab) ui.reportTab = el.dataset.tab;
      go(el.dataset.view, opts);
      if (el.dataset.view === 'settings') refreshPendingUsers();
      return;
    }
    case 'go-status': go('bids', { filters: { status: id, due: '', fy: '', owner: '', sector: '', q: '' } }); return;
    case 'go-owner': go('bids', { filters: { status: 'open', due: '', fy: '', owner: id, sector: '', q: '' } }); return;
    case 'new-bid': newBidModal(); return;
    case 'new-bid-for-client': { const c = store.get('clients', id); newBidModal({ client: c?.name || '', sector: c?.sector || '' }); return; }
    case 'open-bid': openBid(id, el.dataset.tab); return;
    case 'set-status': setStatus(id, el.dataset.status); return;
    case 'status-menu': popMenu(el, statusMenuItems(id)); return;
    case 'quick-note': quickNoteModal(id); return;
    case 'emd-returned': emdReturned(id); return;
    case 'toggle-attn': ui.attnAll = !ui.attnAll; rerender(); return;
    case 'filter': ui.filters[el.dataset.k] = el.dataset.v; saveFilters(); rerender(); return;
    case 'clear-filters': Object.assign(ui.filters, { owner: '', sector: '', fy: '', q: '', due: '' }); view.company = ''; prefs.set('company', ''); saveFilters(); rerender(); return;
    case 'company-all': view.company = ''; prefs.set('company', ''); rerender(); return;
    case 'sort': { const k = el.dataset.k; if (ui.filters.sort === k) ui.filters.dir = -ui.filters.dir; else { ui.filters.sort = k; ui.filters.dir = 1; } saveFilters(); rerender(); return; }
    case 'export-view': { const list = sortBids(filterBids(ui.filters), ui.filters.sort, ui.filters.dir); exportExcel(list, 'selected bids'); return; }
    case 'board-owner': ui.boardOwner = el.dataset.v; rerender(); return;
    case 'cal-move': { const v = +el.dataset.v; if (v === 0) { const n = new Date(); ui.cal = { y: n.getFullYear(), m: n.getMonth() }; } else { const dt = new Date(ui.cal.y, ui.cal.m + v, 1); ui.cal = { y: dt.getFullYear(), m: dt.getMonth() }; } rerender(); return; }
    case 'open-client': openClient(id); return;
    case 'close-client': closeClient(); return;
    case 'client-sort': ui.clientSort = el.dataset.k; rerender(); return;
    case 'new-client': newClientModal(); return;
    case 'edit-contact': contactModal(+el.dataset.k); return;
    case 'client-menu': clientMenu(el); return;
    case 'report-tab': ui.reportTab = el.dataset.tab; if (ui.view !== 'reports') go('reports'); else rerender(); return;
    case 'settings-tab': ui.settingsTab = el.dataset.tab; rerender(); if (el.dataset.tab === 'team') refreshPendingUsers(); return;
    case 'print': window.print(); return;
    case 'toggle-side': ui.sideOpen = !ui.sideOpen; renderChrome(); return;
    case 'retry-sync': pull(); pushSoon(); return;
    case 'me-menu': popMenu(el, [
      { html: `${icon('user')} My account`, onClick: () => { ui.settingsTab = 'account'; go('settings'); } },
      { html: `${icon('help')} Guide`, onClick: () => go('help') },
      '-',
      { html: `${icon('open')} Sign out`, onClick: () => signOut() },
    ]); return;
    case 'sign-out': signOut(); return;
    default: break;
  }
}

function onChange(e) {
  if (!signedIn) return;
  const el = e.target;
  if (el.closest('#drawer-root')) {
    if (el.dataset.f) { saveField(el); return; }
    if (el.dataset.cf) { saveClientField(el); return; }
  }
  if (el.dataset.co !== undefined) { view.company = el.value; prefs.set('company', el.value); rerender(); return; }
  if (el.dataset.filter) { ui.filters[el.dataset.filter] = el.value; saveFilters(); rerender(); return; }
  const ac = el.dataset.actChange;
  if (ac === 'dash-fy') { ui.dashFY = Number(el.value); rerender(); return; }
  if (ac === 'report-since') { ui.reportSince = el.value; rerender(); return; }
  if (ac === 'report-fy') { ui.reportFY = el.value === 'all' ? 'all' : Number(el.value); rerender(); return; }
  if (el.closest('#content') && activityChange(el)) return;
  if (el.closest('#content') && settingsChange(el)) return;
}

async function onSubmit(e) {
  const sf = e.target.closest('form[data-set-form]');
  if (sf) { e.preventDefault(); if (signedIn) settingsSubmit(sf); return; }
  const form = e.target.closest('form[data-auth]');
  if (!form) return;
  e.preventDefault();
  authState.busy = true; renderAuthScreenKeepValues(form);
  const user = await submitAuth(form);
  authState.busy = false;
  if (user) { await enterApp(user); return; }
  renderAuthScreen();
}
function renderAuthScreenKeepValues(form) { const b = form.querySelector('button[type=submit]'); if (b) { b.disabled = true; b.textContent = 'Please wait…'; } }

const filterInput = debounce((v) => { ui.filters.q = v; saveFilters(); rerender(); }, 160);
const clientInput = debounce((v) => { ui.clientQ = v; rerender(); }, 160);
function onInput(e) {
  if (!signedIn) return;
  const el = e.target;
  if (el.dataset.filter === 'q') { filterInput(el.value); return; }
  if (el.hasAttribute('data-client-q')) { clientInput(el.value); return; }
  if (activityInput(el)) return;
  if (el.id === 'q') { searchResults(el.value); }
}

// ---------------- global search ----------------
let resIdx = 0;
function searchResults(q) {
  const box = document.getElementById('q-res');
  q = q.trim().toLowerCase();
  if (!q) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  const d = derived();
  const words = q.split(/\s+/);
  const hit = (s) => words.every((w) => s.includes(w));
  const bids = d.allBids.filter((b) => hit([b.no, b.name, b.client, b.location, b.consultant, b.enquiryRef, b.poNo, b.contactName].join(' ').toLowerCase()))
    .sort((a, b) => (OPEN_KEYS.includes(b.status) - OPEN_KEYS.includes(a.status)) || String(b.receivedDate || '').localeCompare(String(a.receivedDate || ''))).slice(0, 7);
  const clients = d.clients.filter((c) => hit([c.name, c.city, ...(c.contacts || []).map((x) => x.name)].join(' ').toLowerCase())).slice(0, 4);
  resIdx = 0;
  if (!bids.length && !clients.length) { box.innerHTML = `<div style="padding:12px;color:var(--ink-3)">Nothing matches "${esc(q)}".</div>`; box.classList.remove('hidden'); return; }
  box.innerHTML = bids.map((b) => `<button data-sr="bid" data-id="${esc(b.id)}"><span style="flex:1;min-width:0"><span class="t">${esc(b.name)}</span><br><span class="s">${esc(b.no || '')} · ${esc(b.client || '')}</span></span><span class="chip st-${b.status}">${esc(STATUS[b.status].short)}</span></button>`).join('')
    + clients.map((c) => `<button data-sr="client" data-id="${esc(c.id)}">${icon('clients')}<span style="flex:1"><span class="t">${esc(c.name)}</span><br><span class="s">Client${c.city ? ' · ' + esc(c.city) : ''}</span></span></button>`).join('');
  box.classList.remove('hidden');
  hilite();
}
function hilite() { const bs = [...document.querySelectorAll('#q-res button')]; bs.forEach((b, i) => b.classList.toggle('on', i === resIdx)); }
function pickResult(btn) {
  if (!btn) return;
  const q = document.getElementById('q');
  q.value = ''; searchResults('');
  q.blur();
  if (btn.dataset.sr === 'bid') openBid(btn.dataset.id); else openClient(btn.dataset.id);
}

// ---------------- keyboard ----------------
let gPressed = 0;
function onKey(e) {
  if (!signedIn) return;
  const t = e.target;
  const typing = t.matches && t.matches('input, textarea, select, [contenteditable]');
  if (t.id === 'q') {
    const bs = [...document.querySelectorAll('#q-res button')];
    if (e.key === 'ArrowDown') { e.preventDefault(); resIdx = Math.min(bs.length - 1, resIdx + 1); hilite(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); resIdx = Math.max(0, resIdx - 1); hilite(); }
    else if (e.key === 'Enter') { e.preventDefault(); pickResult(bs[resIdx]); }
    else if (e.key === 'Escape') { t.value = ''; searchResults(''); t.blur(); }
    return;
  }
  if (document.querySelector('.modal-wrap, .menu')) return;
  if (e.key === 'Escape') {
    if (typing) { t.blur(); return; }
    if (ui.bid) { closeBid(); return; }
    if (ui.client) { closeClient(); return; }
  }
  if ((e.key === 'Enter' || e.key === ' ') && !typing && t.matches('[role=button][data-act]')) { e.preventDefault(); t.click(); return; }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); document.getElementById('q').focus(); return; }
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); newBidModal(); return; }
  if (e.key === 'g') { gPressed = Date.now(); return; }
  if (Date.now() - gPressed < 1200) {
    const map = { d: 'dashboard', b: 'bids', k: 'board', c: 'calendar', l: 'clients', r: 'reports', a: 'activity', s: 'settings' };
    if (map[e.key]) { gPressed = 0; go(map[e.key]); }
  }
}

// ---------------- start ----------------
async function start() {
  shell();
  initTips();
  initFormChecks();
  view.company = prefs.get('company', '');
  setRenderer(renderAll);
  setSignedOutHandler((err) => { if (signedIn) leaveApp(err.message || 'Your session has ended. Sign in again.'); });
  store.on((info) => { if (info.local) pushSoon(); if (signedIn) rerender(); });
  net.on(() => { if (signedIn) renderChrome(); });
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', onKey);
  document.getElementById('q-res').addEventListener('mousedown', (e) => { const b = e.target.closest('button[data-sr]'); if (b) { e.preventDefault(); pickResult(b); } });
  document.getElementById('q').addEventListener('blur', () => setTimeout(() => { document.getElementById('q-res').classList.add('hidden'); }, 150));
  document.getElementById('q').addEventListener('focus', (e) => { if (e.target.value) searchResults(e.target.value); });
  document.getElementById('drawer-root').addEventListener('focusout', () => setTimeout(() => { if (drawerPending) renderDrawer(); }, 0));
  window.addEventListener('hashchange', () => { if (!signedIn) return; readHash(); rerender(); });
  window.addEventListener('resize', debounce(() => { if (signedIn) rerender(); }, 250));
  let day = today();
  setInterval(() => { if (today() !== day) { day = today(); if (signedIn) rerender(); } }, 60000);

  const reset = location.hash.match(/^#\/reset\/([A-Za-z0-9_-]+)/);
  let status;
  try { status = await api('auth', { query: { action: 'status' } }); }
  catch (e) {
    document.getElementById('auth-root').innerHTML = `<div class="welcome auth"><div class="steps"><div class="auth-box"><h2>The bid tracker cannot reach its server</h2><p class="lead">${esc(e.message)}</p><div class="acts"><button class="btn btn-primary" data-auth-go="reload">Try again</button></div></div></div></div>`;
    return;
  }
  if (reset) { await prepareReset(reset[1]); renderAuthScreen(); return; }
  if (status.needsSetup) { authState.screen = 'setup'; renderAuthScreen(); return; }
  if (status.user) { await enterApp(status.user); return; }
  renderAuthScreen();
}

start().catch((e) => {
  console.error(e);
  document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif"><h2>The Bid Tracker could not start</h2><p>${esc(e.message || e)}</p><p>Reload the page. If it keeps happening, tell your admin.</p></div>`;
});

export { initials };
