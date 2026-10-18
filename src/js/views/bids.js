// The bid list: filter, sort, open.
import { store } from '../store.js';
import { derived, fyOptions, view, companyOf, companyInfo } from '../derive.js';
import { companySelect } from './common.js';
import { STATUS, STATUSES, OPEN_KEYS, AWAITING, CLOSED_KEYS, PRE_SUBMIT } from '../config.js';
import { esc, fmtDate, timeAgo, inrShort, signedPct, fyLabel, fyOf, today, plural, fmtTime } from '../util.js';
import { icon, chip, duePill, avatar, money, meter, emptyState } from '../ui.js';
import { teamOptions } from '../actions.js';

export function filterBids(f, d = derived()) {
  const q = (f.q || '').trim().toLowerCase();
  return d.bids.filter((b) => {
    const i = d.info.get(b.id);
    if (f.status === 'open' && !OPEN_KEYS.includes(b.status)) return false;
    if (f.status === 'awaiting' && !AWAITING.includes(b.status)) return false;
    if (f.status === 'closed' && !CLOSED_KEYS.includes(b.status)) return false;
    if (STATUS[f.status] && b.status !== f.status) return false;
    if (f.owner === '__none' && b.owner) return false;
    if (f.owner && f.owner !== '__none' && b.owner !== f.owner) return false;
    if (f.sector && b.sector !== f.sector) return false;
    if (f.fy !== '' && f.fy !== undefined && f.fy !== null && String(i.fy) !== String(f.fy) && !(f.status === 'won' && String(i.decidedFy) === String(f.fy))) return false;
    if (f.due) {
      const n = i.daysToDue;
      const pre = PRE_SUBMIT.includes(b.status);
      if (f.due === 'late' && !(pre && n !== null && n < 0)) return false;
      if (f.due === 'week' && !(pre && n !== null && n >= 0 && n <= 7)) return false;
      if (f.due === 'month' && !(pre && n !== null && n >= 0 && n <= 31)) return false;
      if (f.due === 'none' && b.dueDate) return false;
    }
    if (q) {
      const hay = [b.no, b.name, b.client, b.location, b.consultant, b.enquiryRef, b.sector, b.owner, ...(b.scopes || [])].join(' ').toLowerCase();
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

export function sortBids(list, sort, dir, d = derived()) {
  const I = (b) => d.info.get(b.id);
  const key = {
    no: (b) => b.no || '',
    name: (b) => (b.name || '').toLowerCase(),
    client: (b) => (b.client || '').toLowerCase(),
    owner: (b) => (b.owner || '~').toLowerCase(),
    due: (b) => b.dueDate || '9999',
    value: (b) => I(b).value || 0,
    status: (b) => STATUS[b.status]?.i ?? 9,
    updated: (b) => -(Math.max(b._ts || 0, I(b).lastActivity || 0)),
    received: (b) => b.receivedDate || '',
  }[sort] || ((b) => b.dueDate || '9999');
  return list.slice().sort((a, b) => {
    const x = key(a), y = key(b);
    const c = x < y ? -1 : x > y ? 1 : 0;
    return c * dir || String(b.no || '').localeCompare(String(a.no || ''));
  });
}

export function renderBids(ui) {
  const d = derived();
  const f = ui.filters;
  if (!d.allBids.length) {
    return emptyState({ title: 'No bids yet', text: 'Every enquiry and tender you work on goes here, from the day it arrives until the order is won or lost.', acts: `<button class="btn btn-primary" data-act="new-bid">${icon('plus')} New bid</button><button class="btn" data-act="import-excel">${icon('upload')} Import from Excel</button>` });
  }
  const counts = {};
  const base = filterBids({ ...f, status: 'all' }, d);
  for (const b of base) counts[b.status] = (counts[b.status] || 0) + 1;
  const openN = base.filter((b) => OPEN_KEYS.includes(b.status)).length;
  const list = sortBids(filterBids(f, d), f.sort, f.dir, d);
  const total = list.reduce((s, b) => s + (d.info.get(b.id).value || 0), 0);
  const team = teamOptions();
  const fys = fyOptions();
  const statusBtns = [
    `<button class="${f.status === 'open' ? 'on' : ''}" data-act="filter" data-k="status" data-v="open">All open <span class="n">${openN}</span></button>`,
    ...STATUSES.map((s) => `<button class="${f.status === s.key ? 'on' : ''}" data-act="filter" data-k="status" data-v="${s.key}" style="--c:var(--s-${s.key})"><i></i>${esc(s.short)} <span class="n">${counts[s.key] || 0}</span></button>`),
    `<button class="${f.status === 'all' ? 'on' : ''}" data-act="filter" data-k="status" data-v="all">Everything <span class="n">${base.length}</span></button>`,
  ].join('');
  const th = (k, label, cls = '') => `<th class="sortable ${cls}" data-act="sort" data-k="${k}" aria-sort="${f.sort === k ? (f.dir > 0 ? 'ascending' : 'descending') : 'none'}">${label}${f.sort === k ? `<span class="arr">${f.dir > 0 ? '↑' : '↓'}</span>` : ''}</th>`;
  const anyFilter = f.owner || f.sector || f.fy !== '' || f.q || f.due || view.company;
  const rows = list.map((b) => {
    const i = d.info.get(b.id);
    return `<tr class="click" data-act="open-bid" data-id="${esc(b.id)}">
      <td class="no hide-sm">${esc(b.no || '')}</td>
      <td style="min-width:240px"><div class="bid-name">${esc(b.name)}</div><div class="bid-sub">${!view.company ? `<span class="tag co-tag">${esc(companyInfo(companyOf(b), d.settings).short)}</span> ` : ''}${esc(b.client || '')}${b.location ? ' · ' + esc(b.location) : ''}</div></td>
      <td class="hide-sm">${avatar(b.owner, 'sm')}</td>
      <td class="nowrap">${b.dueDate ? `<div class="small">${esc(fmtDate(b.dueDate))}${b.dueTime && PRE_SUBMIT.includes(b.status) ? ', ' + esc(fmtTime(b.dueTime)) : ''}</div>` : ''}${PRE_SUBMIT.includes(b.status) ? duePill(b, i) : b.submittedDate ? `<div class="val-sub">Submitted ${esc(fmtDate(b.submittedDate, { short: true }))}</div>` : ''}</td>
      <td class="r"><div class="val">${money(i.value, { blank: '<span class="muted">—</span>' })}</div>${i.change ? `<div class="val-sub">${esc(signedPct(i.change))} from R0</div>` : ''}</td>
      <td>${chip(b.status, { act: 'status-menu', id: b.id })}</td>
      <td class="hide-sm" style="width:110px">${PRE_SUBMIT.includes(b.status) && i.applicable ? `<div style="display:flex;align-items:center;gap:6px">${meter(i.readiness)}<span class="small muted tnum">${Math.round((i.readiness || 0) * 100)}%</span></div>` : ''}</td>
      <td class="hide-sm small muted nowrap">${esc(timeAgo(Math.max(b._ts || 0, i.lastActivity || 0)))}</td>
    </tr>`;
  }).join('');
  return `
  <div class="status-filter" role="group" aria-label="Filter by status">${statusBtns}</div>
  <div class="toolbar">
    ${companySelect()}
    <input class="inp" type="search" placeholder="Filter by name, client, place…" value="${esc(f.q || '')}" data-filter="q" aria-label="Filter bids" style="width:240px">
    <select class="inp" data-filter="owner" aria-label="Owner"><option value="">Anyone</option>${team.map((t) => `<option ${f.owner === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}<option value="__none" ${f.owner === '__none' ? 'selected' : ''}>Not assigned</option></select>
    <select class="inp" data-filter="sector" aria-label="Sector"><option value="">All sectors</option>${d.settings.sectors.map((t) => `<option ${f.sector === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
    <select class="inp" data-filter="fy" aria-label="Financial year"><option value="">All years</option>${fys.map((y) => `<option value="${y}" ${String(f.fy) === String(y) ? 'selected' : ''}>${fyLabel(y)}</option>`).join('')}</select>
    <select class="inp" data-filter="due" aria-label="Deadline"><option value="">Any deadline</option><option value="late" ${f.due === 'late' ? 'selected' : ''}>Past deadline</option><option value="week" ${f.due === 'week' ? 'selected' : ''}>Due in 7 days</option><option value="month" ${f.due === 'month' ? 'selected' : ''}>Due in 31 days</option><option value="none" ${f.due === 'none' ? 'selected' : ''}>No deadline set</option></select>
    ${anyFilter ? '<button class="btn btn-ghost btn-sm" data-act="clear-filters">Clear filters</button>' : ''}
    <span class="grow"></span>
    <span class="count">${plural(list.length, 'bid')} · ${esc(inrShort(total, { blank: '₹0' }))}</span>
    <button class="btn btn-sm" data-act="export-view">${icon('download')} Excel</button>
  </div>
  ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>
    ${th('no', 'No.', 'hide-sm')}${th('name', 'Bid and client')}${th('owner', 'Owner', 'hide-sm')}${th('due', 'Deadline')}${th('value', 'Offer value', 'r')}${th('status', 'Status')}<th class="hide-sm">Checklist</th>${th('updated', 'Last update', 'hide-sm')}
  </tr></thead><tbody>${rows}</tbody></table></div>` : emptyState({ title: 'No bids match', text: 'Try another status above, or clear the filters.', acts: '<button class="btn" data-act="clear-filters">Clear filters</button>' })}`;
}
