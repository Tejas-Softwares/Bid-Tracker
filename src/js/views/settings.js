// Settings: your account, the team and who can sign in, companies and lists, reminders, and data (import,
// export, backups). Everyone can read the lists; only admins change them, approve people or restore data.
import { store, prefs } from '../store.js';
import { derived } from '../derive.js';
import { STATUSES, DEFAULT_SETTINGS } from '../config.js';
import { esc, timeAgo, download, today, pickFile, plural, fmtDateTime } from '../util.js';
import { icon, modal, toast, confirmBox, typedConfirm, fld, avatar, popMenu } from '../ui.js';
import { ui, rerender } from '../nav.js';
import { api, pull, flush } from '../server.js';
import { importExcelFlow, exportExcel } from '../excel.js';
import { loadSample, clearSample, hasSample } from '../sample.js';

const TABS = [['account', 'My account'], ['team', 'Team and access'], ['lists', 'Companies and lists'], ['rules', 'Reminders'], ['data', 'Import, export and backups']];
const LISTS = [
  ['sectors', 'Sectors', 'Used to group bids and to compare win rates by sector.'],
  ['scopes', 'Scope of work', 'The packages a bid can include. A bid can have several.'],
  ['tenderTypes', 'Tender types', ''],
  ['lossReasons', 'Reasons for losing', 'Asked for when a bid is marked lost.'],
  ['regretReasons', 'Reasons for not bidding', 'Asked for when the team decides not to bid.'],
  ['revisionReasons', 'Reasons for revising an offer', ''],
];
const adminNote = () => (store.isAdmin ? '' : `<div class="banner info" style="margin:0 0 16px">${icon('shield')}<span class="grow">Only an admin can change these. Ask an admin if something needs adding.</span></div>`);

export function renderSettings() {
  const tab = TABS.some(([k]) => k === ui.settingsTab) ? ui.settingsTab : 'account';
  const pending = store.isAdmin && ui.pendingUsers ? `<span class="count alert">${ui.pendingUsers}</span>` : '';
  return `<div class="set-grid">
    <nav class="set-nav" aria-label="Settings sections">${TABS.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="settings-tab" data-tab="${k}">${l}${k === 'team' ? pending : ''}</button>`).join('')}</nav>
    <div>${({ account, team, lists, rules, data })[tab]()}</div>
  </div>`;
}

// ---------- my account ----------
function account() {
  const u = store.user || {};
  return `
  <div class="set-block"><h3>Your details</h3><p>Your name and email go on everything you add or change, and appear in the Activity log.</p>
    <form data-set-form="profile" class="grid3" autocomplete="off">
      ${fld({ label: 'Name', name: 'name', value: u.name || '', req: true })}
      ${fld({ label: 'Position', name: 'position', value: u.position || '', placeholder: 'e.g. Estimation engineer' })}
      ${fld({ label: 'Email (your username)', name: 'email', value: u.email || '', attrs: 'readonly', hint: 'To change it, ask an admin to make a new account.' })}
      <div class="span-all" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" type="submit">Save details</button><span class="small muted">${u.role === 'admin' ? `${icon('shield')} You are an admin.` : 'You are a team member.'}</span></div>
    </form></div>
  <div class="set-block"><h3>Password</h3><p>At least 8 characters. Nobody else, admins included, can see it.</p>
    <form data-set-form="password" class="grid3">
      <div class="field"><label for="pw_cur">Current password</label><input id="pw_cur" name="current" type="password" autocomplete="current-password"></div>
      <div class="field"><label for="pw_new">New password</label><input id="pw_new" name="next" type="password" autocomplete="new-password" minlength="8"></div>
      <div class="field"><label for="pw_new2">New password again</label><input id="pw_new2" name="next2" type="password" autocomplete="new-password"></div>
      <div class="span-all"><button class="btn" type="submit">Change password</button></div>
    </form></div>
  <div class="set-block"><h3>Sign out</h3><p>Signs you out of this browser and clears the copy of the bids kept here. Do this on a shared or borrowed computer.</p>
    <button class="btn" data-act="sign-out">${icon('open')} Sign out</button></div>`;
}

// ---------- team ----------
function team() {
  const url = location.origin + location.pathname;
  const invite = `<div class="set-block"><h3>Adding someone</h3><p>Send them the tracker's address. They choose <b>Create an account</b>, enter their name, position, work email and a password of their own${store.isAdmin ? ', and then appear here for you to approve' : ', and an admin approves them'}.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><code class="url-box">${esc(url)}</code><button class="btn btn-sm" data-act="copy-text" data-text="${esc(url)}">${icon('link')} Copy address</button></div></div>`;
  if (!store.isAdmin) {
    const people = store.users || [];
    return `${invite}<div class="set-block"><h3>The team</h3><p>Everyone who can sign in. Admins approve new accounts and can turn accounts off.</p>
      <div class="people">${people.map((p) => personRow(p, '')).join('') || '<p class="muted">Nobody yet.</p>'}</div></div>`;
  }
  const all = ui.allUsers;
  if (!all) return `${invite}<p class="muted">Loading the team…</p>`;
  const pending = all.filter((u) => u.status === 'pending');
  const active = all.filter((u) => u.status === 'active');
  const off = all.filter((u) => u.status === 'disabled');
  return `
  ${pending.length ? `<div class="set-block attn-block"><h3>Waiting for approval</h3><p>Approve only people you know. Check the email address is theirs.</p>
    <div class="people">${pending.map((u) => personRow(u, `<span class="small muted">Asked ${esc(timeAgo(u.createdAt))}</span>
      <button class="btn btn-sm btn-primary" data-act="user-do" data-do="approve" data-id="${esc(u.id)}">${icon('check')} Approve</button>
      <button class="btn btn-sm btn-ghost btn-danger" data-act="user-do" data-do="decline" data-id="${esc(u.id)}">Decline</button>`)).join('')}</div></div>` : ''}
  <div class="set-block"><h3>People who can sign in</h3><p>Admins can approve accounts, change lists and settings, restore deleted bids and backups. Members do everything else.</p>
    <div class="people">${active.map((u) => personRow(u, `
      <span class="small muted hide-sm">${u.lastLogin ? `Signed in ${esc(timeAgo(u.lastLogin))}` : 'Not signed in yet'}</span>
      <select class="inp inp-sm" data-user-role="${esc(u.id)}" aria-label="Role of ${esc(u.name)}"><option value="member" ${u.role !== 'admin' ? 'selected' : ''}>Member</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option></select>
      <button class="icon-btn" data-act="user-menu" data-id="${esc(u.id)}" aria-label="More for ${esc(u.name)}">${icon('more')}</button>`)).join('')}</div></div>
  ${off.length ? `<div class="set-block"><h3>Turned off</h3><p>These people cannot sign in. Their name stays on everything they did.</p>
    <div class="people">${off.map((u) => personRow(u, `<button class="btn btn-sm" data-act="user-do" data-do="enable" data-id="${esc(u.id)}">Turn on again</button>`)).join('')}</div></div>` : ''}
  ${invite}
  <div class="set-block"><h3>Forgotten passwords</h3><p>Open the <b>⋯</b> menu next to the person and choose <b>Make a password reset link</b>. Send them the link; it works once, for 24 hours, and lets them set a new password.</p></div>`;
}

function personRow(u, right) {
  return `<div class="peer">${avatar(u.name)}<div style="flex:1;min-width:0"><b>${esc(u.name)}</b>${u.id === store.user?.id ? ' <span class="tag">You</span>' : ''}${u.role === 'admin' ? ' <span class="tag">Admin</span>' : ''}
    <div class="small muted" style="overflow:hidden;text-overflow:ellipsis">${esc(u.position || 'No position')} · ${esc(u.email)}</div></div>${right}</div>`;
}

// ---------- lists ----------
function lists() {
  const s = store.settings();
  const ro = !store.isAdmin;
  return `${adminNote()}
  <div class="set-block"><h3>Companies</h3><p>Every bid belongs to one of these. The short name shows on bid lists; the prefix starts the bid number (for example <b>${esc(s.companies[0].prefix)}/26-27/014</b>). Changing a prefix affects new bids only.</p>
    ${s.companies.map((c, i) => `<div class="grid3 co-row">
      ${fld({ label: i === 0 ? 'Full name' : 'Full name', name: 'co_name_' + c.key, value: c.name, data: `data-co-f="${c.key}:name"`, attrs: ro ? 'disabled' : '' })}
      ${fld({ label: 'Short name', name: 'co_short_' + c.key, value: c.short, data: `data-co-f="${c.key}:short"`, attrs: ro ? 'disabled' : '' })}
      ${fld({ label: 'Bid number prefix', name: 'co_prefix_' + c.key, value: c.prefix, data: `data-co-f="${c.key}:prefix"`, attrs: ro ? 'disabled' : '' })}
    </div>`).join('')}</div>
  <div class="set-block"><h3>Bid checklist</h3><p>The steps for every tender. They appear on each bid's Checklist tab and drive the progress bars on the dashboard. Renaming a step starts it unticked on every bid.</p>
    ${listEditor('checklist', s.checklist, 'Add a step', ro)}</div>
  ${LISTS.map(([k, l, p]) => `<div class="set-block"><h3>${esc(l)}</h3>${p ? `<p>${esc(p)}</p>` : ''}${listEditor(k, s[k], 'Add', ro)}</div>`).join('')}`;
}

function rules() {
  const s = store.settings();
  const ro = store.isAdmin ? '' : 'disabled';
  return `${adminNote()}
  <div class="set-block"><h3>Reminders</h3><p>When "Needs attention" on the dashboard should speak up.</p>
    <div class="grid3">
      ${fld({ label: 'Default offer validity (days)', name: 'validityDays', type: 'int', value: s.validityDays, data: 'data-setting="validityDays" data-t="int"', attrs: ro, hint: 'Filled in when a bid is marked submitted' })}
      ${fld({ label: 'Follow up after (days without an update)', name: 'followUpDays', type: 'int', value: s.followUpDays, data: 'data-setting="followUpDays" data-t="int"', attrs: ro, hint: 'For submitted bids and bids in negotiation' })}
    </div></div>
  <div class="set-block"><h3>Chance of winning by stage</h3><p>Used for the "likely" value on the dashboard (each open bid's offer times its chance). A bid can override this on its Details tab.</p>
    <div class="grid4">${STATUSES.filter((x) => x.open).map((x) => fld({ label: x.label + ' (%)', name: 'p_' + x.key, type: 'int', value: s.probabilities[x.key], data: `data-prob="${x.key}"`, attrs: ro })).join('')}</div></div>`;
}

// ---------- data ----------
const bk = { list: null, loading: false, error: '' };
async function loadBackups() {
  if (bk.loading) return;
  bk.loading = true;
  try { bk.list = (await api('backups')).backups; bk.error = ''; } catch (e) { bk.error = e.message; bk.list = bk.list || []; }
  bk.loading = false;
  if (ui.view === 'settings') rerender();
}
const KIND = { daily: 'Daily (automatic)', manual: 'Saved by hand', 'before-restore': 'Before a restore', 'before-erase': 'Before deleting everything' };

function data() {
  const d = derived();
  const admin = store.isAdmin;
  if (admin && !bk.list && !bk.loading) loadBackups();
  const backups = !admin ? '' : `
  <div class="set-block"><h3>Backups</h3><p>The server keeps a copy of everything once a day (the last 90 days), and also just before anyone restores a backup or deletes everything. You can save one by hand before a big change.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><button class="btn btn-primary" data-act="backup-now">${icon('shield')} Save a backup now</button><button class="btn" data-act="backup-file">${icon('download')} Download a backup file</button><button class="btn" data-act="restore-file">${icon('upload')} Restore from a backup file</button></div>
    ${bk.error ? `<p style="color:var(--red)">${esc(bk.error)}</p>` : ''}
    ${!bk.list ? '<p class="muted">Loading backups…</p>' : !bk.list.length ? '<p class="muted">No backups yet. The first daily backup is made today.</p>' : `<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Saved</th><th>Kind</th><th>By</th><th class="r">Records</th><th></th></tr></thead><tbody>
      ${bk.list.slice(0, ui.allBackups ? 200 : 10).map((b) => `<tr><td class="nowrap">${esc(fmtDateTime(b.at))}</td><td>${esc(KIND[b.kind] || b.kind)}</td><td>${esc(b.by || '')}</td><td class="r tnum">${b.count}</td>
        <td class="r nowrap"><button class="btn btn-ghost btn-sm" data-act="backup-download" data-id="${b.id}">${icon('download')} Download</button><button class="btn btn-sm" data-act="backup-restore" data-id="${b.id}">Restore</button></td></tr>`).join('')}
    </tbody></table></div>${bk.list.length > 10 && !ui.allBackups ? `<button class="btn btn-ghost btn-sm" style="margin-top:8px" data-act="backups-all">Show all ${bk.list.length}</button>` : ''}`}
  </div>`;
  return `
  <div class="set-block"><h3>Import from Excel</h3><p>Bring in bids from your existing tracker workbook (the "Bid Tracker", "Offer Revisions" and "CRM" sheets) or from a workbook exported here. You pick which company the bids belong to. Bids already in the tracker are skipped, so importing the same file twice does not create duplicates.</p>
    <button class="btn ${admin ? '' : 'btn-primary'}" data-act="import-excel">${icon('upload')} Choose Excel file</button></div>
  <div class="set-block"><h3>Export to Excel</h3><p>All bids${d.allBids.length !== d.bids.length ? ' of the company picked in the company filter' : ''}, with offers, NT items, clients, EMDs and notes, as one formatted workbook.</p>
    <button class="btn" data-act="export-all">${icon('download')} Download Excel workbook</button></div>
  ${backups}
  ${admin ? `<div class="set-block"><h3>Sample bids</h3><p>Made-up bids to practise with, including the "Example" rows if they were imported from the Excel template. Everyone on the team sees them. They are marked as samples and can be removed in one click without touching real bids.</p>
    ${hasSample() ? `<button class="btn" data-act="clear-sample">Remove sample bids</button>` : `<button class="btn" data-act="load-sample">Load sample bids</button>`}</div>
  <div class="set-block"><h3>Start over</h3><p>Deletes every bid, client, offer, NT item and note for the whole team. A backup is saved on the server first, so this can be undone from Backups above.</p>
    <button class="btn btn-danger" data-act="erase-all">${icon('trash')} Delete everything</button>
    <span class="small muted" style="margin-left:8px">${plural(d.allBids.length, 'bid')}, ${plural(d.clients.length, 'client')}</span></div>` : `<div class="set-block"><h3>Backups and restoring</h3><p>The server backs everything up once a day. Admins can restore a backup or bring back a deleted bid from the Activity screen.</p></div>`}
  <div class="set-block"><h3>About</h3><p>Tejas Bid Tracker 2.0, made for Tejas Group. The bids are kept in the team's own database and reach everyone within a few seconds. Signed in as ${esc(store.user?.email || '')}.</p></div>`;
}

function listEditor(key, values, addLabel, ro) {
  if (ro) return `<div class="list-edit ro">${(values || []).map((v) => `<div class="li"><span>${esc(v)}</span></div>`).join('')}</div>`;
  return `<div class="list-edit" data-list="${key}">
    ${(values || []).map((v, i) => `<div class="li"><input class="inp" value="${esc(v)}" data-li="${i}" aria-label="${esc(v)}"><button class="icon-btn" data-act="li-up" data-list="${key}" data-i="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button><button class="icon-btn" data-act="li-del" data-list="${key}" data-i="${i}" aria-label="Remove ${esc(v)}">${icon('x')}</button></div>`).join('')}
    <div class="li"><input class="inp" placeholder="${esc(addLabel)}…" data-li-new="${key}" aria-label="${esc(addLabel)}"><button class="btn btn-sm" data-act="li-add" data-list="${key}">Add</button></div>
    ${DEFAULT_SETTINGS[key] && JSON.stringify(DEFAULT_SETTINGS[key]) !== JSON.stringify(values) ? `<div><button class="btn btn-ghost btn-sm" data-act="li-reset" data-list="${key}">Reset to the original list</button></div>` : ''}
  </div>`;
}

// ---------- events ----------
export function settingsChange(el) {
  if (!store.isAdmin && (el.dataset.li !== undefined || el.dataset.setting || el.dataset.prob || el.dataset.coF)) { toast('Only an admin can change settings'); return true; }
  const s = store.settings();
  if (el.dataset.li !== undefined) {
    const key = el.closest('[data-list]').dataset.list;
    const arr = [...(s[key] || [])];
    const i = +el.dataset.li;
    const v = el.value.trim();
    if (!v) { el.value = arr[i]; return true; }
    if (arr[i] === v) return true;
    arr[i] = v;
    store.saveSettings({ [key]: arr });
    toast('Saved');
    return true;
  }
  if (el.dataset.coF) {
    const [key, f] = el.dataset.coF.split(':');
    let v = el.value.trim();
    if (f === 'prefix') { v = v.replace(/[^A-Za-z0-9-]/g, '').toUpperCase(); el.value = v; }
    if (!v) { el.value = s.companies.find((c) => c.key === key)?.[f] || ''; toast('This cannot be empty'); return true; }
    if (f === 'prefix' && s.companies.some((c) => c.key !== key && c.prefix === v)) { toast('The two companies need different prefixes'); el.value = s.companies.find((c) => c.key === key).prefix; return true; }
    store.saveSettings({ companies: s.companies.map((c) => (c.key === key ? { ...c, [f]: v } : c)) });
    toast('Saved');
    return true;
  }
  if (el.dataset.setting) {
    let v = el.value.trim();
    if (el.dataset.t === 'int') v = Math.max(0, parseInt(v, 10) || 0);
    store.saveSettings({ [el.dataset.setting]: v });
    toast('Saved');
    return true;
  }
  if (el.dataset.prob) {
    const probs = { ...s.probabilities, [el.dataset.prob]: Math.min(100, Math.max(0, parseInt(el.value, 10) || 0)) };
    store.saveSettings({ probabilities: probs });
    toast('Saved');
    return true;
  }
  if (el.dataset.userRole) { userDo('role', el.dataset.userRole, { role: el.value }); return true; }
  return false;
}

// Forms on the account tab
export async function settingsSubmit(form) {
  const kind = form.dataset.setForm;
  const v = (n) => form.querySelector(`[name="${n}"]`)?.value || '';
  if (kind === 'profile') {
    if (!v('name').trim()) { toast('Enter your name'); return; }
    try {
      const r = await api('auth', { method: 'POST', body: { action: 'profile', name: v('name').trim(), position: v('position').trim() } });
      store.user = { ...store.user, ...r.user };
      await pull();
      toast('Details saved'); rerender();
    } catch (e) { toast(e.message); }
  }
  if (kind === 'password') {
    if (!v('current') || !v('next')) { toast('Enter your current and new password'); return; }
    if (v('next') !== v('next2')) { toast('The two new passwords are not the same'); return; }
    try {
      await api('auth', { method: 'POST', body: { action: 'password', current: v('current'), next: v('next') } });
      form.reset();
      toast('Password changed');
    } catch (e) { toast(e.message); }
  }
}

async function userDo(action, id, extra = {}) {
  try {
    const r = await api('users', { method: 'POST', body: { action, id, ...extra } });
    if (r.users) { ui.allUsers = r.users; ui.pendingUsers = r.users.filter((u) => u.status === 'pending').length; }
    pull();
    rerender();
    return r;
  } catch (e) { toast(e.message); rerender(); return null; }
}

function userMenu(el) {
  const u = (ui.allUsers || []).find((x) => x.id === el.dataset.id);
  if (!u) return;
  popMenu(el, [
    { html: `${icon('edit')} Edit name and position`, onClick: () => editUser(u) },
    { html: `${icon('link')} Make a password reset link`, onClick: () => resetLink(u) },
    ...(u.id !== store.user?.id ? ['-', { html: `${icon('x')} Turn off this account`, onClick: async () => {
      if (await confirmBox(`${esc(u.name)} will be signed out everywhere and cannot sign in until an admin turns the account on again. Everything they did stays as it is.`, { title: `Turn off ${esc(u.name)}'s account?`, ok: 'Turn off', danger: true })) { await userDo('disable', u.id); toast('Account turned off'); }
    } }] : []),
  ]);
}

function editUser(u) {
  modal({
    title: 'Edit ' + u.name, sub: esc(u.email),
    body: `<div class="grid2">${fld({ label: 'Name', name: 'name', value: u.name, req: true })}${fld({ label: 'Position', name: 'position', value: u.position || '' })}</div><p class="small muted" style="margin:10px 0 0">Bids owned by ${esc(u.name)} follow a change of name.</p>`,
    actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async (root) => {
      const name = root.querySelector('[name=name]').value.trim();
      if (!name) { root.querySelector('[name=name]').focus(); return false; }
      const r = await userDo('edit', u.id, { name, position: root.querySelector('[name=position]').value.trim() });
      if (r) toast('Saved');
    } }],
  });
}

async function resetLink(u) {
  const r = await userDo('reset', u.id);
  if (!r || !r.link) return;
  modal({
    title: 'Password reset link', sub: `For ${esc(u.name)} (${esc(u.email)})`,
    body: `<p style="margin-top:0">Send this link to ${esc(u.name)} by email or WhatsApp. It works once, for the next 24 hours. Making a new link cancels this one.</p>
      <div class="field"><label for="rl">Link</label><input id="rl" readonly value="${esc(r.link)}"></div>`,
    actions: [{ label: 'Close' }, { label: 'Copy link', cls: 'btn-primary', onClick: async (root) => { await copy(r.link, root.querySelector('#rl')); return false; } }],
    onMount: (root) => { const i = root.querySelector('#rl'); setTimeout(() => i.select(), 60); },
  });
}

async function copy(text, input) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch { if (input) { input.select(); document.execCommand('copy'); toast('Copied'); } else toast(text); }
}

const backupName = (ms) => `Tejas Bid Tracker backup ${new Date(ms).toISOString().slice(0, 10)}.json`;

export async function settingsAction(act, el) {
  const s = store.settings();
  const key = el.dataset.list;
  const adminOnly = ['li-add', 'li-del', 'li-up', 'li-reset', 'backup-now', 'backup-file', 'restore-file', 'backup-download', 'backup-restore', 'load-sample', 'clear-sample', 'erase-all', 'user-do', 'user-menu'];
  if (adminOnly.includes(act) && !store.isAdmin) { toast('Only an admin can do this'); return true; }
  switch (act) {
    case 'li-add': {
      const inp = document.querySelector(`[data-li-new="${key}"]`);
      const v = inp?.value.trim();
      if (!v) { inp?.focus(); return true; }
      if ((s[key] || []).includes(v)) { toast(`${v} is already in the list`); return true; }
      store.saveSettings({ [key]: [...(s[key] || []), v] });
      setTimeout(() => document.querySelector(`[data-li-new="${key}"]`)?.focus(), 50);
      return true;
    }
    case 'li-del': {
      const arr = [...(s[key] || [])]; const [gone] = arr.splice(+el.dataset.i, 1);
      store.saveSettings({ [key]: arr });
      toast(`Removed ${gone}`, { undo: () => { const a = [...(store.settings()[key] || [])]; a.splice(+el.dataset.i, 0, gone); store.saveSettings({ [key]: a }); } });
      return true;
    }
    case 'li-up': {
      const arr = [...(s[key] || [])]; const i = +el.dataset.i; if (i < 1) return true;
      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      store.saveSettings({ [key]: arr }); return true;
    }
    case 'li-reset': store.saveSettings({ [key]: [...DEFAULT_SETTINGS[key]] }); toast('List reset'); return true;
    case 'copy-text': copy(el.dataset.text); return true;
    case 'user-do': {
      const u = (ui.allUsers || []).find((x) => x.id === el.dataset.id);
      if (el.dataset.do === 'decline' && !(await confirmBox(`Decline the account request from ${esc(u?.name || '')} (${esc(u?.email || '')})? They can ask again later.`, { title: 'Decline this account?', ok: 'Decline', danger: true }))) return true;
      const r = await userDo(el.dataset.do, el.dataset.id);
      if (r) toast({ approve: `${u?.name || 'Account'} can now sign in`, decline: 'Request declined', enable: 'Account turned on' }[el.dataset.do] || 'Done');
      return true;
    }
    case 'user-menu': userMenu(el); return true;
    case 'import-excel': importExcelFlow(); return true;
    case 'export-all': exportExcel(); return true;
    case 'load-sample': loadSample(); toast('Sample bids loaded for the whole team'); return true;
    case 'clear-sample': clearSample(); toast('Sample bids removed'); return true;
    case 'backups-all': ui.allBackups = true; rerender(); return true;
    case 'backup-now':
      try { await api('backups', { method: 'POST', body: { action: 'create' } }); toast('Backup saved'); bk.list = null; loadBackups(); } catch (e) { toast(e.message); }
      return true;
    case 'backup-file': {
      await flush();
      const doc = { app: 'tejas-bid-tracker', format: 1, savedAt: Date.now(), user: store.me, records: store.records() };
      download(backupName(doc.savedAt), JSON.stringify(doc), 'application/json');
      api('activity', { method: 'POST', body: { action: 'log', event: 'data.backup', summary: `Downloaded a backup file (${plural(store.all('bids').length, 'bid')})` } }).catch(() => {});
      toast('Backup downloaded');
      return true;
    }
    case 'backup-download':
      try { const doc = await api('backups', { query: { id: el.dataset.id } }); download(backupName(doc.savedAt), JSON.stringify(doc), 'application/json'); toast('Backup downloaded'); } catch (e) { toast(e.message); }
      return true;
    case 'backup-restore': {
      const b = (bk.list || []).find((x) => String(x.id) === el.dataset.id);
      if (!b) return true;
      if (!(await typedConfirm({ title: 'Restore this backup?', text: `Everything goes back to how it was on ${esc(fmtDateTime(b.at))} (${b.count} records), for the whole team. Anything added or changed after that is undone. A backup of how things are now is saved first, so this can be reversed.`, phrase: 'RESTORE', ok: 'Restore backup' }))) return true;
      try {
        await flush();
        await api('backups', { method: 'POST', body: { action: 'restore', id: b.id } });
        await pull();
        toast('Backup restored'); bk.list = null; loadBackups();
      } catch (e) { toast(e.message); }
      return true;
    }
    case 'restore-file': {
      const f = await pickFile('.json,application/json');
      if (!f) return true;
      let doc; try { doc = JSON.parse(await f.text()); } catch { doc = null; }
      if (!doc || doc.app !== 'tejas-bid-tracker' || !Array.isArray(doc.records)) { toast('That file is not a Bid Tracker backup'); return true; }
      restoreFileFlow(doc, f.name);
      return true;
    }
    case 'erase-all': {
      const d = derived();
      if (!(await typedConfirm({ title: 'Delete everything?', text: `This deletes all ${plural(d.allBids.length, 'bid')}, ${plural(d.clients.length, 'client')}, their offers, NT items and notes, for everyone. A backup is saved on the server first.`, phrase: 'DELETE EVERYTHING', ok: 'Delete everything' }))) return true;
      const pairs = [];
      for (const c of ['bids', 'revisions', 'notes', 'clients', 'nt']) for (const r of store.all(c)) pairs.push([c, r.id]);
      store.removeMany(pairs, 'erase');
      await flush();
      toast('Everything deleted');
      bk.list = null;
      return true;
    }
    default: return false;
  }
}

// A backup file, for example from the earlier shared-folder version of the tracker
function restoreFileFlow(doc, name) {
  const live = doc.records.filter((r) => !r._del);
  const n = (c) => live.filter((r) => r._c === c).length;
  const here = store.all('bids').length;
  const newBids = live.filter((r) => r._c === 'bids' && !store.raw('bids', r.id)).length;
  modal({
    title: 'Restore from a backup file', sub: esc(name),
    body: `<p style="margin-top:0">Saved ${esc(fmtDateTime(doc.savedAt))}${doc.user ? ` by ${esc(doc.user)}` : ''}. It has ${plural(n('bids'), 'bid')}, ${plural(n('clients'), 'client')}, ${plural(n('revisions'), 'offer')} and ${plural(n('notes'), 'note')}.</p>
      <div class="radio-cards">
        <label class="radio-card"><input type="radio" name="mode" value="add" checked><span><b>Add what is missing</b><br><span class="small muted">Brings in the ${plural(newBids, 'bid')} not already here. Nothing here is changed or deleted. Use this to move bids from the old shared-folder tracker.</span></span></label>
        <label class="radio-card"><input type="radio" name="mode" value="replace"><span><b>Replace everything</b><br><span class="small muted">The tracker becomes exactly this file for the whole team${here ? `; the ${plural(here, 'bid')} here now that are not in the file are deleted` : ''}. A backup is saved on the server first.</span></span></label>
      </div>`,
    actions: [{ label: 'Cancel' }, { label: 'Restore', cls: 'btn-primary', onClick: async (root) => {
      const mode = root.querySelector('[name=mode]:checked').value;
      if (mode === 'replace') {
        setTimeout(async () => {
          if (!(await typedConfirm({ title: 'Replace everything?', text: 'Everything in the tracker is replaced by the backup file, for the whole team.', phrase: 'REPLACE', ok: 'Replace everything' }))) return;
          store.restoreSnapshot(doc.records);
          await flush();
          toast('Backup restored'); bk.list = null;
        }, 50);
        return;
      }
      const added = store.mergeSnapshot(doc.records);
      await flush();
      toast(added ? `Added ${plural(added, 'record')} from the backup` : 'Everything in that file is already here');
    } }],
  });
}

export { prefs };
