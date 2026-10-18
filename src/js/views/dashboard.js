// Dashboard: the fortnight of deadlines, what needs attention, and where the pipeline stands.
import { store } from '../store.js';
import { derived, stats, fyOptions } from '../derive.js';
import { companySelect, companyEmpty } from './common.js';
import { STATUS, PIPELINE_KEYS, PRE_SUBMIT, OPEN_KEYS } from '../config.js';
import { esc, today, addDays, parseISO, DAYS, DAYS_LONG, MONTHS, fyLabel, fyShort, fyOf, inrShort, pct, plural, daysBetween, timeAgo, fyRange, MONTHS_LONG, fmtDate, fmtTime } from '../util.js';
import { icon, avatar, emptyState, meter } from '../ui.js';
import { hbars, columns } from '../charts.js';

let chartData = null;

export function renderDashboard(ui) {
  const d = derived();
  const t = d.t;
  if (companyEmpty(d)) { chartData = null; return `${hello(ui, d)}${companyEmpty(d, false)}`; }
  if (!d.bids.length) {
    chartData = null;
    return `${hello(ui, d)}${emptyState({
      title: 'No bids yet',
      text: 'Add your first bid, bring in the bids from your Excel tracker, or load a few sample bids to see how everything works.',
      acts: `<button class="btn btn-primary" data-act="new-bid">${icon('plus')} New bid</button><button class="btn" data-act="import-excel">${icon('upload')} Import from Excel</button><button class="btn" data-act="load-sample">Try with sample bids</button>`,
    })}`;
  }
  const fy = ui.dashFY;
  const info = d.info;
  const fyBids = d.bids.filter((b) => info.get(b.id).fy === fy);
  const decidedFy = d.bids.filter((b) => info.get(b.id).decidedFy === fy);
  const all = stats(d.bids, info);
  const fyStats = stats(decidedFy, info);
  const due7 = d.bids.filter((b) => PRE_SUBMIT.includes(b.status) && b.dueDate && info.get(b.id).daysToDue >= 0 && info.get(b.id).daysToDue <= 7);
  const dueToday = due7.filter((b) => info.get(b.id).daysToDue === 0).length;
  const overdue = d.bids.filter((b) => PRE_SUBMIT.includes(b.status) && b.dueDate && info.get(b.id).daysToDue < 0);
  const wonFy = fyStats.won;

  const figs = `
  <div class="figs" role="list">
    <button class="fig" role="listitem" data-act="go" data-view="bids" data-filter-status="open">
      <div class="lbl">Open bids</div><div class="val">${all.open.length}</div>
      <div class="note"><b>${esc(inrShort(all.openValue))}</b> quoted · ${esc(inrShort(all.weighted))} likely</div></button>
    <button class="fig" role="listitem" data-act="go" data-view="bids" data-filter-status="open" data-filter-due="week">
      <div class="lbl">Due in the next 7 days</div><div class="val">${due7.length}</div>
      <div class="note ${overdue.length ? 'red' : ''}">${overdue.length ? `<b>${plural(overdue.length, 'bid')} past deadline</b>` : dueToday ? `<b>${dueToday}</b> due today` : 'Nothing overdue'}</div></button>
    <button class="fig" role="listitem" data-act="go" data-view="bids" data-filter-status="awaiting">
      <div class="lbl">Waiting for client</div><div class="val">${all.awaiting.length}</div>
      <div class="note"><b>${esc(inrShort(all.awaitingValue))}</b> submitted or in negotiation</div></button>
    <button class="fig" role="listitem" data-act="go" data-view="bids" data-filter-status="won" data-filter-fy="${fy}">
      <div class="lbl">Won in ${fyLabel(fy)}</div><div class="val">${esc(inrShort(fyStats.wonValue, { blank: '₹0' }))}</div>
      <div class="note"><b>${plural(wonFy.length, 'order')}</b>${fyStats.lost.length ? ` · ${fyStats.lost.length} lost` : ''}</div></button>
    <button class="fig" role="listitem" data-act="go" data-view="reports" data-tab="analysis">
      <div class="lbl">Win rate, ${fyLabel(fy)}</div><div class="val">${fyStats.winRate === null ? '—' : pct(fyStats.winRate)}</div>
      <div class="note">${fyStats.winRate === null ? 'No decisions yet this year' : `${wonFy.length} won of ${wonFy.length + fyStats.lost.length} decided · ${pct(fyStats.winRateValue)} by value`}</div></button>
  </div>`;

  // Attention
  const att = d.attention;
  const showAll = ui.attnAll;
  const attList = (showAll ? att : att.slice(0, 7)).map((a) => {
    const b = store.get('bids', a.bidId);
    const ic = a.sev === 'high' ? 'alert' : a.kind === 'emd' ? 'bank' : a.kind === 'meeting' ? 'meeting' : a.kind === 'followup' ? 'note' : a.kind === 'validity' ? 'hourglass' : 'clock';
    const actAttrs = a.action.act === 'set-status' ? `data-act="set-status" data-id="${esc(b.id)}" data-status="${a.action.status}"` : a.action.act === 'open-bid' ? `data-act="open-bid" data-id="${esc(b.id)}" data-tab="${a.action.tab}"` : `data-act="${a.action.act}" data-id="${esc(b.id)}"`;
    return `<div class="attn-item ${a.sev}">${icon(ic, 'ic')}<div class="what"><a data-act="open-bid" data-id="${esc(b.id)}">${esc(b.name)}</a> <span class="c">${esc(b.client || '')}${b.owner ? ' · ' + esc(b.owner) : ''}</span><p>${esc(a.text)}</p></div><button class="btn btn-sm" ${actAttrs}>${esc(a.action.label)}</button></div>`;
  }).join('');
  const attBlock = att.length
    ? `<div class="attn">${attList}</div>${att.length > 7 ? `<div class="attn-more"><button class="btn btn-ghost btn-sm" data-act="toggle-attn">${showAll ? 'Show fewer' : `Show all ${att.length}`}</button></div>` : ''}`
    : `<div class="allclear">${icon('checkCircle')} Nothing needs attention right now.</div>`;

  // Chart data
  const pipeRows = PIPELINE_KEYS.map((k) => {
    const list = d.bids.filter((b) => b.status === k);
    const v = list.reduce((s, b) => s + (info.get(b.id).value || 0), 0);
    return { label: `${STATUS[k].short} (${list.length})`, value: v, display: v ? inrShort(v) : list.length ? 'No value yet' : '—', color: 'var(--navy)', tip: `<b>${esc(STATUS[k].label)}</b><br>${plural(list.length, 'bid')}<br>${esc(inrShort(v))} quoted`, act: 'go-status', id: k };
  });
  const [fyStart] = fyRange(fy);
  const months = Array.from({ length: 12 }, (_, i) => { const dt = parseISO(fyStart); dt.setMonth(dt.getMonth() + i); return { y: dt.getFullYear(), m: dt.getMonth() }; });
  const inMonth = (s, mm) => { const x = parseISO(s); return x && x.getFullYear() === mm.y && x.getMonth() === mm.m; };
  const received = months.map((mm) => d.bids.filter((b) => inMonth(b.receivedDate, mm)).length);
  const won = months.map((mm) => d.bids.filter((b) => b.status === 'won' && inMonth(b.decisionDate || b.poDate || b.dueDate, mm)).length);
  const nowM = parseISO(t);
  const hiCat = months.findIndex((mm) => mm.y === nowM.getFullYear() && mm.m === nowM.getMonth());
  // Owners
  const owners = new Map();
  for (const b of all.open) { const k = b.owner || 'Not assigned'; owners.set(k, (owners.get(k) || 0) + 1); }
  const ownerRows = [...owners.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ label: k, value: n, display: plural(n, 'bid'), color: k === 'Not assigned' ? 'var(--ink-4)' : 'var(--blue)', act: 'go-owner', id: k === 'Not assigned' ? '__none' : k }));
  chartData = { pipeRows, months: months.map((mm) => MONTHS[mm.m]), monthsLong: months.map((mm) => `${MONTHS_LONG[mm.m]} ${mm.y}`), received, won, hiCat, ownerRows };

  return `
  ${hello(ui, d)}
  ${figs}
  <section class="sec">
    <div class="sec-head"><h2>Submission deadlines, next 14 days</h2><span class="grow"></span><button class="btn btn-ghost btn-sm" data-act="go" data-view="calendar">${icon('calendar')} Calendar</button></div>
    ${rail(d, overdue)}
  </section>
  <div class="cols sec">
    <section>
      <div class="sec-head"><h2>Needs attention</h2>${att.length ? `<span class="muted">${att.length}</span>` : ''}</div>
      ${attBlock}
    </section>
    <section>
      <div class="sec-head"><h2>Open pipeline</h2><span class="muted">Current offer value by stage</span></div>
      <div data-chart="pipe"></div>
      <div class="sec-head" style="margin-top:22px"><h2>Bids by month</h2><span class="muted">${fyLabel(fy)}</span></div>
      <div class="legend"><span><i style="background:#b9c6e4"></i>Enquiries received</span><span><i style="background:var(--navy)"></i>Orders won</span></div>
      <div data-chart="months"></div>
    </section>
  </div>
  <div class="cols sec">
    <section>
      <div class="sec-head"><h2>Recent activity</h2></div>
      ${feed()}
    </section>
    <section>
      <div class="sec-head"><h2>Open bids by owner</h2></div>
      ${ownerRows.length ? '<div data-chart="owners"></div>' : '<p class="muted">No open bids.</p>'}
    </section>
  </div>`;
}

function hello(ui, d) {
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const dt = parseISO(today());
  const fyOpts = fyOptions();
  return `<div class="hello"><div class="grow"><h2>${g}${store.me ? ', ' + esc(store.me) : ''}</h2><p>${DAYS_LONG[dt.getDay()]} ${dt.getDate()} ${MONTHS_LONG[dt.getMonth()]} ${dt.getFullYear()}</p></div>
    ${d.allBids.length ? `${companySelect()}<label class="sr" for="dash-fy">Financial year</label><select id="dash-fy" class="inp" data-act-change="dash-fy" style="width:auto">${fyOpts.map((y) => `<option value="${y}" ${y === ui.dashFY ? 'selected' : ''}>${fyLabel(y)}</option>`).join('')}</select>` : ''}
  </div>`;
}

function rail(d, overdue) {
  const t = d.t;
  const days = Array.from({ length: 14 }, (_, i) => addDays(t, i));
  const due = new Map(days.map((x) => [x, []]));
  for (const b of d.bids) {
    if (PRE_SUBMIT.includes(b.status) && due.has(b.dueDate)) due.get(b.dueDate).push({ b, kind: 'due' });
    if (OPEN_KEYS.includes(b.status)) {
      if (due.has(b.preBidDate)) due.get(b.preBidDate).push({ b, kind: 'prebid' });
      if (due.has(b.siteVisitDate)) due.get(b.siteVisitDate).push({ b, kind: 'site' });
    }
  }
  const ticket = ({ b, kind }) => {
    const i = d.info.get(b.id);
    const c = `var(--s-${b.status})`;
    if (kind !== 'due') return `<button class="ticket evt" style="--c:${c}" data-act="open-bid" data-id="${esc(b.id)}" data-tip="${esc(`<b>${kind === 'prebid' ? 'Pre-bid meeting' : 'Site visit'}</b><br>${esc(b.name)}<br>${esc(b.client || '')}`)}"><div class="k">${icon(kind === 'prebid' ? 'meeting' : 'site')}${kind === 'prebid' ? 'Pre-bid meeting' : 'Site visit'}</div><div class="c">${esc(b.name)}</div></button>`;
    return `<button class="ticket" style="--c:${c}" data-act="open-bid" data-id="${esc(b.id)}" data-tab="checklist" data-tip="${esc(`<b>${esc(b.name)}</b><br>${esc(b.client || '')}<br>${esc(STATUS[b.status].label)}${b.owner ? ' · ' + esc(b.owner) : ''}${b.dueTime ? '<br>Due by ' + esc(fmtTime(b.dueTime)) : ''}${b.dueDate && i.daysToDue < 0 ? '<br>Deadline was ' + esc(fmtDate(b.dueDate)) : ''}`)}">
      <div class="n">${esc(b.name)}</div><div class="c">${esc(b.client || '')}</div>
      <div class="m">${avatar(b.owner, 'sm')}${i.applicable ? `${meter(i.readiness)}<span>${Math.round((i.readiness || 0) * 100)}%</span>` : ''}</div></button>`;
  };
  const cell = (day) => {
    const dt = parseISO(day);
    const wk = dt.getDay() === 0 || dt.getDay() === 6;
    const items = due.get(day).sort((a, b) => (a.kind === 'due' ? 0 : 1) - (b.kind === 'due' ? 0 : 1));
    return `<div class="rail-day ${wk ? 'wkend' : ''} ${day === t ? 'today' : ''}"><header><b>${dt.getDate()}</b><span>${day === t ? 'Today' : day === addDays(t, 1) ? 'Tomorrow' : DAYS[dt.getDay()]}${dt.getDate() === 1 || day === t ? ' · ' + MONTHS[dt.getMonth()] : ''}</span></header><div class="items">${items.map(ticket).join('')}</div></div>`;
  };
  const any = overdue.length || [...due.values()].some((l) => l.length);
  const late = overdue.length ? `<div class="rail-late"><div class="lbl">${icon('alert')} Past deadline, not marked submitted</div><div class="items">${overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((b) => ticket({ b, kind: 'due' })).join('')}</div></div>` : '';
  return `<div class="rail-wrap">${late}
    <div class="rail">${days.slice(0, 7).map(cell).join('')}</div>
    <div class="rail rail-2">${days.slice(7).map(cell).join('')}</div>
    <div class="rail-legend"><span><i></i>Submission due (bar shows checklist progress)</span><span><i class="evt"></i>Pre-bid meeting or site visit</span>${any ? '' : '<span>No deadlines in the next 14 days.</span>'}</div></div>`;
}

function feed() {
  const notes = store.all('notes').filter((n) => n.bidId && store.get('bids', n.bidId)).sort((a, b) => (b.at || b._ts) - (a.at || a._ts)).slice(0, 8);
  if (!notes.length) return '<p class="muted">Nothing yet.</p>';
  return `<div class="feed">${notes.map((n) => {
    const b = store.get('bids', n.bidId);
    return `<div class="feed-item">${avatar(n.by || n._by, 'sm')}<div><a data-act="open-bid" data-id="${esc(b.id)}" data-tab="notes">${esc(b.name)}</a> <span class="muted small">${esc(b.client || '')}</span><div>${esc(n.text.length > 160 ? n.text.slice(0, 157) + '…' : n.text)}</div><div class="t">${esc(n.by || n._by || 'Someone')} · ${esc(timeAgo(n.at || n._ts))}</div></div></div>`;
  }).join('')}</div>`;
}

export function mountDashboard(root) {
  if (!chartData) return;
  const w = (el) => Math.max(260, el.clientWidth);
  const pipe = root.querySelector('[data-chart="pipe"]');
  if (pipe) pipe.innerHTML = hbars(w(pipe), chartData.pipeRows, { label: 'Open pipeline by stage', valW: 90 });
  const mon = root.querySelector('[data-chart="months"]');
  if (mon) mon.innerHTML = columns(w(mon), chartData.months, [{ name: 'Enquiries received', color: '#b9c6e4', values: chartData.received }, { name: 'Orders won', color: 'var(--navy)', values: chartData.won }], { height: 200, padL: 30, hiCat: chartData.hiCat, label: 'Enquiries received and orders won by month', fmt: (v) => String(Math.round(v)), tipTitle: (i) => chartData.monthsLong[i] });
  const own = root.querySelector('[data-chart="owners"]');
  if (own) own.innerHTML = hbars(w(own), chartData.ownerRows, { label: 'Open bids by owner', valW: 70 });
}
