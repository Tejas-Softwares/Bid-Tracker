// Calendar: deadlines, meetings, site visits, validity and EMD dates by month.
import { derived } from '../derive.js';
import { PRE_SUBMIT, OPEN_KEYS, AWAITING } from '../config.js';
import { esc, isoDate, today, MONTHS_LONG, fmtTime } from '../util.js';
import { icon } from '../ui.js';

const KINDS = {
  due: { label: 'Submission deadline', ic: 'flag' },
  prebid: { label: 'Pre-bid meeting', ic: 'meeting' },
  site: { label: 'Site visit', ic: 'site' },
  valid: { label: 'Offer validity ends', ic: 'hourglass' },
  decision: { label: 'Decision expected', ic: 'clock' },
  emd: { label: 'EMD guarantee expires', ic: 'bank' },
};

export function calendarEvents(d) {
  const ev = [];
  for (const b of d.bids) {
    const i = d.info.get(b.id);
    if (b.dueDate && (PRE_SUBMIT.includes(b.status) || b.status === 'submitted' || b.status === 'negotiation')) ev.push({ date: b.dueDate, kind: 'due', b, done: !PRE_SUBMIT.includes(b.status) });
    if (OPEN_KEYS.includes(b.status)) {
      if (b.preBidDate) ev.push({ date: b.preBidDate, kind: 'prebid', b });
      if (b.siteVisitDate) ev.push({ date: b.siteVisitDate, kind: 'site', b });
    }
    if (AWAITING.includes(b.status)) {
      if (i.validTill) ev.push({ date: i.validTill, kind: 'valid', b });
      if (b.expectedDecision) ev.push({ date: b.expectedDecision, kind: 'decision', b });
    }
    if (b.emdRequired === 'Yes' && b.emdExpiry && b.emdStatus === 'Submitted') ev.push({ date: b.emdExpiry, kind: 'emd', b });
  }
  return ev;
}

export function renderCalendar(ui) {
  const d = derived();
  const { y, m } = ui.cal;
  const first = new Date(y, m, 1);
  const startDow = (first.getDay() + 6) % 7; // Monday first
  const start = new Date(y, m, 1 - startDow);
  const t = today();
  const byDay = new Map();
  for (const e of calendarEvents(d)) { if (!byDay.has(e.date)) byDay.set(e.date, []); byDay.get(e.date).push(e); }
  const order = Object.keys(KINDS);
  const cells = [];
  const weeks = Math.ceil((startDow + new Date(y, m + 1, 0).getDate()) / 7);
  for (let k = 0; k < weeks * 7; k++) {
    const dt = new Date(start); dt.setDate(start.getDate() + k);
    const iso = isoDate(dt);
    const list = (byDay.get(iso) || []).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    const shown = list.slice(0, 4);
    cells.push(`<div class="cell ${dt.getMonth() !== m ? 'out' : ''} ${iso === t ? 'today' : ''}"><span class="d">${dt.getDate()}</span>
      ${shown.map((e) => `<button class="ev k-${e.kind}" data-act="open-bid" data-id="${esc(e.b.id)}" data-tip="${esc(`<b>${esc(KINDS[e.kind].label)}${e.done ? ' (submitted)' : ''}</b><br>${esc(e.b.name)}<br>${esc(e.b.client || '')}${e.kind === 'due' && e.b.dueTime ? '<br>By ' + esc(fmtTime(e.b.dueTime)) : ''}`)}" ${e.done ? 'style="opacity:.6"' : ''}>${icon(KINDS[e.kind].ic)}<span>${esc(e.b.name)}</span></button>`).join('')}
      ${list.length > 4 ? `<span class="small muted" style="padding-left:4px">${list.length - 4} more</span>` : ''}</div>`);
  }
  return `
  <div class="cal-head">
    <h2>${MONTHS_LONG[m]} ${y}</h2>
    <button class="icon-btn" data-act="cal-move" data-v="-1" aria-label="Previous month">${icon('left')}</button>
    <button class="icon-btn" data-act="cal-move" data-v="1" aria-label="Next month">${icon('right')}</button>
    <button class="btn btn-sm" data-act="cal-move" data-v="0">Today</button>
  </div>
  <div class="cal" role="grid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((x) => `<div class="dow">${x}</div>`).join('')}${cells.join('')}</div>
  <div class="cal-legend">${Object.entries(KINDS).map(([k, v]) => `<span class="ev k-${k}">${icon(v.ic)}<span>${esc(v.label)}</span></span>`).join('')}</div>`;
}
