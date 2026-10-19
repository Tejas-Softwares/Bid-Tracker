// Reports: the weekly status report for the MD (prints to PDF), win and loss analysis, the EMD register and Excel export.
import { store, prefs } from '../store.js';
import { derived, stats, fyOptions, view, companyInfo } from '../derive.js';
import { companySelect, companyEmpty } from './common.js';
import { STATUS, PRE_SUBMIT, AWAITING, OPEN_KEYS, COMPANY } from '../config.js';
import { esc, today, addDays, fmtDate, inrShort, inr, pct, signedPct, plural, daysBetween, fyLabel, fyOf, groupBy, parseISO } from '../util.js';
import { icon, chip, avatar, money, meter, emptyState } from '../ui.js';
import { stackedH, hbars, donut } from '../charts.js';
import { BRAND } from '../brand.gen.js';
import { clientRows } from './clients.js';

let charts = null;

export function renderReports(ui) {
  const d = derived();
  const tabs = [['weekly', 'Weekly status report'], ['analysis', 'Win and loss'], ['emd', 'EMD register'], ['export', 'Export']];
  const head = `<div class="toolbar no-print" style="margin-bottom:18px"><div class="seg" role="tablist">${tabs.map(([k, l]) => `<button role="tab" class="${ui.reportTab === k ? 'on' : ''}" data-act="report-tab" data-tab="${k}">${l}</button>`).join('')}</div><span class="grow"></span>${d.allBids.length ? companySelect() : ''}</div>`;
  if (companyEmpty(d)) return head + companyEmpty(d, false);
  if (!d.bids.length) return head + emptyState({ title: 'Nothing to report yet', text: 'Reports fill in as you add bids.', acts: `<button class="btn btn-primary" data-act="new-bid">${icon('plus')} New bid</button>` });
  charts = null;
  if (ui.reportTab === 'analysis') return head + analysis(ui, d);
  if (ui.reportTab === 'emd') return head + emdRegister(d);
  if (ui.reportTab === 'export') return head + exportTab(d);
  return head + weekly(ui, d);
}

function docHead(title, sub) {
  const coName = view.company ? companyInfo(view.company).name : COMPANY.group;
  return `<div class="doc-head"><div class="logo">${BRAND.logo}</div><div class="co"><b>${esc(coName)}</b><span>${esc(COMPANY.address)}</span></div><div class="rt"><h2>${esc(title)}</h2><span>${sub}</span></div></div>`;
}

function weekly(ui, d) {
  const t = d.t;
  const since = ui.reportSince || addDays(t, -7);
  const info = d.info;
  const inPeriod = (s) => s && s >= since && s <= t;
  const all = stats(d.bids, info);
  const due = d.bids.filter((b) => PRE_SUBMIT.includes(b.status) && b.dueDate && info.get(b.id).daysToDue <= 14).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const awaiting = d.bids.filter((b) => AWAITING.includes(b.status)).sort((a, b) => (a.submittedDate || '').localeCompare(b.submittedDate || ''));
  const fresh = d.bids.filter((b) => inPeriod(b.receivedDate)).sort((a, b) => a.receivedDate.localeCompare(b.receivedDate));
  const won = d.bids.filter((b) => b.status === 'won' && inPeriod(b.decisionDate || b.poDate));
  const lostOnly = d.bids.filter((b) => b.status === 'lost' && inPeriod(b.decisionDate));
  const closed = d.bids.filter((b) => ['regret', 'dropped'].includes(b.status) && inPeriod(b.decisionDate));
  const lost = [...lostOnly, ...closed];
  const valOf = (b) => info.get(b.id).value || 0;
  const wonVal = won.reduce((s, b) => s + valOf(b), 0);
  const lostVal = lostOnly.reduce((s, b) => s + valOf(b), 0);
  const closedVal = closed.reduce((s, b) => s + valOf(b), 0);
  charts = {
    weeklyCount: [
      { name: 'Won', value: won.length, color: 'var(--s-won)', display: plural(won.length, 'bid') },
      { name: 'Lost', value: lostOnly.length, color: 'var(--s-lost)', display: plural(lostOnly.length, 'bid') },
      { name: 'Closed', value: closed.length, color: 'var(--s-regret)', display: plural(closed.length, 'bid') },
    ],
    weeklyValue: [
      { label: 'Won', value: wonVal, display: inrShort(wonVal, { blank: '₹0' }), color: 'var(--s-won)' },
      { label: 'Lost', value: lostVal, display: inrShort(lostVal, { blank: '₹0' }), color: 'var(--s-lost)' },
      { label: 'Closed', value: closedVal, display: inrShort(closedVal, { blank: '₹0' }), color: 'var(--s-regret)' },
    ],
  };
  const emd = d.bids.filter((b) => b.emdRequired === 'Yes' && b.emdStatus === 'Submitted');
  const emdOut = emd.reduce((s, b) => s + (b.emdAmount || 0), 0);
  const tbl = (head, rows, empty) => rows.length ? `<div class="tbl-wrap"><table class="tbl compact"><thead><tr>${head.map((h) => `<th class="${/value|offer|amount|price/i.test(h) ? 'r' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : `<p class="none">${empty}</p>`;
  return `
  <div class="report-tools no-print">
    <label class="small muted" for="rep-since">Changes since</label>
    <input id="rep-since" class="inp" type="date" value="${esc(since)}" data-act-change="report-since" style="width:auto">
    <span class="grow"></span>
    <button class="btn btn-primary" data-act="print">${icon('printer')} Print or save as PDF</button>
  </div>
  <div class="doc">
    ${docHead('Bid status report', `As on ${esc(fmtDate(t))} · changes since ${esc(fmtDate(since))}${store.me ? ` · ${esc(store.me)}` : ''}`)}
    <div class="figs">
      <div class="fig"><div class="lbl">Open bids</div><div class="val">${all.open.length}</div><div class="note"><b>${esc(inrShort(all.openValue))}</b> quoted</div></div>
      <div class="fig"><div class="lbl">Due in 14 days</div><div class="val">${due.length}</div><div class="note">${due.filter((b) => info.get(b.id).daysToDue < 0).length ? `<b style="color:var(--red)">${due.filter((b) => info.get(b.id).daysToDue < 0).length} past deadline</b>` : 'None overdue'}</div></div>
      <div class="fig"><div class="lbl">Waiting for client</div><div class="val">${awaiting.length}</div><div class="note"><b>${esc(inrShort(all.awaitingValue))}</b></div></div>
      <div class="fig"><div class="lbl">Won since ${esc(fmtDate(since, { short: true }))}</div><div class="val">${won.length}</div><div class="note"><b>${esc(inrShort(wonVal, { blank: '₹0' }))}</b></div></div>
      <div class="fig"><div class="lbl">EMD with clients</div><div class="val">${esc(inrShort(emdOut, { blank: '₹0' }))}</div><div class="note">${plural(emd.length, 'bid')}</div></div>
    </div>
    <h3>Wins and losses since ${esc(fmtDate(since, { short: true }))}</h3>
    ${won.length || lost.length ? `<div class="rep-grid wl-charts">
      <div><div class="small muted" style="margin-bottom:6px">By number of bids</div><div data-chart="weekly-count"></div></div>
      <div><div class="small muted" style="margin-bottom:6px">By value</div><div data-chart="weekly-value"></div></div>
    </div>` : `<p class="none">No bids won, lost or closed in this period.</p>`}
    <h3>Submissions due in the next 14 days</h3>
    ${tbl(['No.', 'Bid', 'Client', 'Owner', 'Deadline', 'Checklist', 'Offer value'], due.map((b) => { const i = info.get(b.id); return `<tr><td class="no">${esc(b.no || '')}</td><td><b>${esc(b.name)}</b></td><td>${esc(b.client || '')}</td><td>${esc(b.owner || '—')}</td><td class="nowrap">${esc(fmtDate(b.dueDate))}${i.daysToDue < 0 ? ` <span class="pill red">${plural(-i.daysToDue, 'day')} late</span>` : i.daysToDue <= 2 ? ` <span class="pill red">${i.daysToDue === 0 ? 'Today' : i.daysToDue === 1 ? 'Tomorrow' : 'In 2 days'}</span>` : ''}</td><td class="nowrap">${i.applicable ? `${Math.round((i.readiness || 0) * 100)}%` : '—'}</td><td class="r nowrap">${esc(inrShort(i.value))}</td></tr>`; }), 'No submissions due.')}
    <h3>Waiting for the client's decision</h3>
    ${tbl(['No.', 'Bid', 'Client', 'Stage', 'Submitted', 'Current offer', 'Latest note'], awaiting.map((b) => { const i = info.get(b.id); const n = i.lastNote; return `<tr><td class="no">${esc(b.no || '')}</td><td><b>${esc(b.name)}</b></td><td>${esc(b.client || '')}</td><td>${esc(STATUS[b.status].short)}</td><td class="nowrap">${b.submittedDate ? `${esc(fmtDate(b.submittedDate))}<div class="small muted">${plural(daysBetween(b.submittedDate, t), 'day')} ago</div>` : '—'}</td><td class="r nowrap">${esc(inrShort(i.current))}${i.change ? `<div class="small muted">${esc(signedPct(i.change))} from R0</div>` : ''}</td><td class="small" style="max-width:280px">${n ? esc(n.text.length > 140 ? n.text.slice(0, 137) + '…' : n.text) : '<span class="muted">No notes</span>'}</td></tr>`; }), 'Nothing is waiting for a decision.')}
    <div class="rep-grid">
      <div><h3>New enquiries since ${esc(fmtDate(since, { short: true }))}</h3>
      ${tbl(['Bid', 'Client', 'Received', 'Owner'], fresh.map((b) => `<tr><td><b>${esc(b.name)}</b></td><td>${esc(b.client || '')}</td><td class="nowrap">${esc(fmtDate(b.receivedDate, { short: true }))}</td><td>${esc(b.owner || '—')}</td></tr>`), 'No new enquiries.')}</div>
      <div><h3>Won since ${esc(fmtDate(since, { short: true }))}</h3>
      ${tbl(['Bid', 'Client', 'Order', 'Order value'], won.map((b) => `<tr><td><b>${esc(b.name)}</b></td><td>${esc(b.client || '')}</td><td>${esc(b.poNo || '—')}</td><td class="r nowrap">${esc(inrShort(info.get(b.id).value))}</td></tr>`), 'No orders won in this period.')}
      <h3>Lost or closed since ${esc(fmtDate(since, { short: true }))}</h3>
      ${tbl(['Bid', 'Client', 'Outcome', 'Reason'], lost.map((b) => `<tr><td><b>${esc(b.name)}</b></td><td>${esc(b.client || '')}</td><td>${esc(STATUS[b.status].short)}</td><td class="small">${esc(b.lossReason || b.regretReason || '—')}${b.winner ? `, to ${esc(b.winner)}` : ''}</td></tr>`), 'Nothing lost or closed in this period.')}</div>
    </div>
    ${emd.length ? `<h3>EMD still with clients</h3>${tbl(['Bid', 'Client', 'Bid status', 'Form', 'Valid till', 'Amount'], emd.map((b) => `<tr><td><b>${esc(b.name)}</b></td><td>${esc(b.client || '')}</td><td>${esc(STATUS[b.status].short)}</td><td>${esc(b.emdForm || '—')}</td><td class="nowrap">${esc(fmtDate(b.emdExpiry) || '—')}</td><td class="r nowrap">${esc(inr(b.emdAmount || 0))}</td></tr>`), '')}` : ''}
    <div class="doc-foot"><span>${esc(COMPANY.group)} · Bid status report · ${esc(fmtDate(t))}</span><span>Internal and confidential</span></div>
  </div>`;
}

function analysis(ui, d) {
  const fys = [...new Set(d.bids.map((b) => d.info.get(b.id).decidedFy).filter((x) => x !== null))].sort((a, b) => b - a);
  const fy = ui.reportFY === 'all' ? 'all' : (ui.reportFY ?? fyOf(today()));
  const pick = (b) => fy === 'all' || d.info.get(b.id).decidedFy === Number(fy);
  const bids = d.bids.filter(pick);
  const s = stats(bids, d.info);
  const decided = [...s.won, ...s.lost];
  const wonWithRevs = s.won.filter((b) => d.info.get(b.id).revs.length > 1);
  const avgGive = wonWithRevs.length ? wonWithRevs.reduce((t, b) => t + d.info.get(b.id).change, 0) / wonWithRevs.length : null;
  const cycle = decided.filter((b) => b.receivedDate && b.decisionDate).map((b) => daysBetween(b.receivedDate, b.decisionDate)).filter((n) => n >= 0);
  const avgCycle = cycle.length ? Math.round(cycle.reduce((a, b) => a + b, 0) / cycle.length) : null;
  const submittedCount = bids.filter((b) => !['inquiry', 'working', 'regret'].includes(b.status)).length;
  // by sector
  const sectors = groupBy(bids, (b) => b.sector || 'Not set');
  const sectorRows = [...sectors.entries()].map(([k, l]) => ({ label: k, parts: [{ name: 'Won', value: l.filter((b) => b.status === 'won').length, color: 'var(--blue)' }, { name: 'Lost', value: l.filter((b) => b.status === 'lost').length, color: '#e07b39' }, { name: 'Open or other', value: l.filter((b) => !['won', 'lost'].includes(b.status)).length, color: '#cfd5e1' }] }))
    .sort((a, b) => b.parts.reduce((t, p) => t + p.value, 0) - a.parts.reduce((t, p) => t + p.value, 0)).slice(0, 10);
  const reasons = groupBy(s.lost.filter((b) => b.lossReason), (b) => b.lossReason);
  const reasonRows = [...reasons.entries()].map(([k, l]) => ({ label: k, value: l.length, display: plural(l.length, 'bid'), color: '#e07b39' })).sort((a, b) => b.value - a.value);
  const cr = clientRows(d).map((r) => ({ ...r, bids: r.bids.filter(pick) })).filter((r) => r.bids.length).sort((a, b) => b.bids.length - a.bids.length).slice(0, 10);
  const clientBars = cr.map((r) => ({ label: r.c.name.length > 26 ? r.c.name.slice(0, 25) + '…' : r.c.name, parts: [{ name: 'Won', value: r.bids.filter((b) => b.status === 'won').length, color: 'var(--blue)' }, { name: 'Lost', value: r.bids.filter((b) => b.status === 'lost').length, color: '#e07b39' }, { name: 'Open or other', value: r.bids.filter((b) => !['won', 'lost'].includes(b.status)).length, color: '#cfd5e1' }] }));
  const owners = groupBy(bids, (b) => b.owner || 'Not assigned');
  charts = { sectorRows, reasonRows, clientBars };
  return `
  <div class="toolbar">
    <label class="small muted" for="rep-fy">Bids decided in</label>
    <select id="rep-fy" class="inp" data-act-change="report-fy" style="width:auto"><option value="all" ${fy === 'all' ? 'selected' : ''}>All years</option>${fyOptions(fys).map((y) => `<option value="${y}" ${String(fy) === String(y) ? 'selected' : ''}>${fyLabel(y)}</option>`).join('')}</select>
  </div>
  <div class="stat-line">
    <div><div class="k">Bids</div><div class="v">${bids.length}</div></div>
    <div><div class="k">Submitted</div><div class="v">${submittedCount}</div></div>
    <div><div class="k">Won</div><div class="v">${s.won.length} <span class="small muted">${esc(inrShort(s.wonValue, { blank: '₹0' }))}</span></div></div>
    <div><div class="k">Lost</div><div class="v">${s.lost.length} <span class="small muted">${esc(inrShort(s.lostValue, { blank: '₹0' }))}</span></div></div>
    <div><div class="k">Win rate (count)</div><div class="v">${s.winRate === null ? '—' : pct(s.winRate)}</div></div>
    <div><div class="k">Win rate (value)</div><div class="v">${s.winRateValue === null ? '—' : pct(s.winRateValue)}</div></div>
    <div data-tip="On won bids that were revised: how far the final offer was below the first offer (R0), on average"><div class="k">Average negotiation discount</div><div class="v">${avgGive === null ? '—' : pct(-avgGive, 1)}</div></div>
    <div><div class="k">Enquiry to decision</div><div class="v">${avgCycle === null ? '—' : plural(avgCycle, 'day')}</div></div>
  </div>
  <div class="legend"><span><i style="background:var(--blue)"></i>Won</span><span><i style="background:#e07b39"></i>Lost</span><span><i style="background:#cfd5e1"></i>Open, not bidding or dropped</span></div>
  <div class="rep-grid">
    <section><div class="sec-head"><h2>By sector</h2></div><div data-chart="sector"></div></section>
    <section><div class="sec-head"><h2>By client</h2><span class="muted">Top 10 by number of bids</span></div><div data-chart="clients"></div></section>
  </div>
  <div class="rep-grid sec">
    <section><div class="sec-head"><h2>Why we lost</h2></div>${reasonRows.length ? '<div data-chart="reasons"></div>' : '<p class="muted">No loss reasons recorded yet. They are asked for when a bid is marked lost.</p>'}</section>
    <section><div class="sec-head"><h2>By bid owner</h2></div>
      <div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Owner</th><th class="r">Bids</th><th class="r">Open</th><th class="r">Won</th><th class="r">Lost</th><th class="r">Win rate</th><th class="r">Won value</th></tr></thead><tbody>
      ${[...owners.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, l]) => { const x = stats(l, d.info); return `<tr><td>${avatar(k === 'Not assigned' ? '' : k, 'sm')} ${esc(k)}</td><td class="r tnum">${l.length}</td><td class="r tnum">${x.open.length}</td><td class="r tnum">${x.won.length}</td><td class="r tnum">${x.lost.length}</td><td class="r tnum">${x.winRate === null ? '—' : pct(x.winRate)}</td><td class="r">${money(x.wonValue || null)}</td></tr>`; }).join('')}
      </tbody></table></div></section>
  </div>
  <section class="sec"><div class="sec-head"><h2>Lost bids</h2><span class="muted">Where we stood against the winner</span></div>
    ${s.lost.length ? `<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Bid</th><th>Client</th><th>Reason</th><th>Position</th><th>Went to</th><th class="r">Our offer</th><th class="r">Their price</th><th class="r">Gap</th></tr></thead><tbody>
    ${s.lost.map((b) => { const i = d.info.get(b.id); return `<tr class="click" data-act="open-bid" data-id="${esc(b.id)}"><td><b>${esc(b.name)}</b></td><td>${esc(b.client || '')}</td><td class="small">${esc(b.lossReason || '—')}</td><td>${esc(b.rank || '—')}</td><td>${esc(b.winner || '—')}</td><td class="r nowrap">${esc(inrShort(i.current))}</td><td class="r nowrap">${b.winnerPrice ? esc(inrShort(b.winnerPrice)) : '—'}</td><td class="r nowrap">${b.winnerPrice && i.current ? esc(signedPct((i.current - b.winnerPrice) / b.winnerPrice)) : '—'}</td></tr>`; }).join('')}
    </tbody></table></div>` : '<p class="muted">No lost bids in this period.</p>'}
  </section>`;
}

function emdRegister(d) {
  const list = d.bids.filter((b) => b.emdRequired === 'Yes').sort((a, b) => (a.emdStatus === 'Submitted' ? 0 : 1) - (b.emdStatus === 'Submitted' ? 0 : 1) || String(b.no).localeCompare(String(a.no)));
  if (!list.length) return emptyState({ title: 'No EMDs recorded', text: 'When a tender needs an EMD or bid security, set it on the bid\'s "EMD and terms" tab. It then shows here until it is returned.' });
  const out = list.filter((b) => b.emdStatus === 'Submitted');
  const refund = out.filter((b) => ['lost', 'regret', 'dropped'].includes(b.status));
  return `
  <div class="stat-line">
    <div><div class="k">With clients now</div><div class="v">${esc(inr(out.reduce((s, b) => s + (b.emdAmount || 0), 0)))}</div></div>
    <div><div class="k">To ask back (bid lost or closed)</div><div class="v" style="color:${refund.length ? 'var(--red)' : 'inherit'}">${esc(inr(refund.reduce((s, b) => s + (b.emdAmount || 0), 0)))}</div></div>
    <div><div class="k">EMDs recorded</div><div class="v">${list.length}</div></div>
  </div>
  <div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>No.</th><th>Bid</th><th>Bid status</th><th class="r">Amount</th><th>Form</th><th>Number</th><th>Bank</th><th>Valid till</th><th>EMD status</th><th></th></tr></thead><tbody>
  ${list.map((b) => `<tr class="click" data-act="open-bid" data-id="${esc(b.id)}" data-tab="emd"><td class="no">${esc(b.no || '')}</td><td><div class="bid-name">${esc(b.name)}</div><div class="bid-sub">${esc(b.client || '')}</div></td><td>${chip(b.status)}</td><td class="r nowrap">${esc(inr(b.emdAmount || 0))}</td><td class="small">${esc(b.emdForm || '')}</td><td class="small">${esc(b.emdNo || '')}</td><td class="small">${esc(b.emdBank || '')}</td><td class="nowrap small">${esc(fmtDate(b.emdExpiry))}</td><td>${esc(b.emdStatus || 'Not set')}</td><td>${b.emdStatus === 'Submitted' && !OPEN_KEYS.includes(b.status) ? `<button class="btn btn-sm" data-act="emd-returned" data-id="${esc(b.id)}">Mark returned</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function exportTab(d) {
  return `
  <div class="set-block"><h3>Excel workbook</h3><p>Everything in the tracker as a formatted Excel file: a summary, all bids, every offer revision, clients and contacts, the EMD register, and all notes. Use it to share with someone outside the team or to work on the numbers in Excel.</p>
    <button class="btn btn-primary" data-act="export-all">${icon('download')} Download Excel workbook</button>
    <span class="small muted" style="margin-left:10px">${plural(d.bids.length, 'bid')}</span></div>
  <div class="set-block"><h3>Only some bids</h3><p>Filter the list on the Bids page (for example, only won bids this year, or one person's bids), then use the Excel button above the table.</p>
    <button class="btn" data-act="go" data-view="bids">Go to bids</button></div>
  <div class="set-block"><h3>Weekly report as PDF</h3><p>Open the weekly status report and choose "Print or save as PDF". In the print window pick "Save as PDF" as the printer.</p>
    <button class="btn" data-act="report-tab" data-tab="weekly">Open weekly report</button></div>`;
}

export function mountReports(root) {
  if (!charts) return;
  const w = (el) => Math.max(260, el.clientWidth);
  const s = root.querySelector('[data-chart="sector"]'); if (s && charts.sectorRows.length) s.innerHTML = stackedH(w(s), charts.sectorRows, { label: 'Won and lost bids by sector', valW: 40 });
  const c = root.querySelector('[data-chart="clients"]'); if (c && charts.clientBars.length) c.innerHTML = stackedH(w(c), charts.clientBars, { label: 'Won and lost bids by client', valW: 40 });
  const r = root.querySelector('[data-chart="reasons"]'); if (r && charts.reasonRows.length) r.innerHTML = hbars(w(r), charts.reasonRows, { label: 'Loss reasons', valW: 60 });
  const wc = root.querySelector('[data-chart="weekly-count"]');
  if (wc && charts.weeklyCount) {
    const n = charts.weeklyCount.reduce((s, p) => s + p.value, 0);
    wc.innerHTML = donut(w(wc), charts.weeklyCount, { label: 'Wins and losses by count', center: String(n), centerSub: n === 1 ? 'bid' : 'bids' });
  }
  const wv = root.querySelector('[data-chart="weekly-value"]');
  if (wv && charts.weeklyValue) wv.innerHTML = hbars(w(wv), charts.weeklyValue, { label: 'Wins and losses by value', valW: 72 });
}
export { prefs, parseISO, meter };
