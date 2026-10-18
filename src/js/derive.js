// Everything the app works out from the raw records: current offer value, readiness, what needs attention.
// Recomputed once per change to the store (memoised on store.version).

import { store } from './store.js';
import { STATUS, OPEN_KEYS, PRE_SUBMIT, AWAITING, CLOSED_KEYS, FIRST_FY } from './config.js';
import { today, daysBetween, addDays, fyOf, inrShort, fmtDate, normName, plural, groupBy, parseISO } from './util.js';

let memo = { v: -1, day: '', company: '', out: null };
// Which company's bids are on screen: '' for both, or a company key ('pvt', 'prop')
export const view = { company: '' };

export function derived() {
  const d = today();
  if (memo.v === store.version && memo.day === d && memo.company === view.company && memo.out) return memo.out;
  memo = { v: store.version, day: d, company: view.company, out: compute(d) };
  return memo.out;
}

export const companyOf = (b) => (b && b.company) || 'pvt';
export function companyInfo(key, settings = store.settings()) {
  return settings.companies.find((c) => c.key === key) || settings.companies[0];
}

function compute(t) {
  const settings = store.settings();
  const allBids = store.all('bids');
  const bids = view.company ? allBids.filter((b) => companyOf(b) === view.company) : allBids;
  const revsByBid = groupBy(store.all('revisions'), (r) => r.bidId);
  const notesByBid = groupBy(store.all('notes').filter((n) => n.bidId), (n) => n.bidId);
  const ntByBid = groupBy(store.all('nt'), (n) => n.bidId);
  const info = new Map();
  for (const b of allBids) info.set(b.id, bidInfo(b, revsByBid.get(b.id) || [], notesByBid.get(b.id) || [], settings, t, ntByBid.get(b.id) || []));
  const clients = store.all('clients');
  const clientByNorm = new Map(clients.map((c) => [normName(c.name), c]));
  return { t, settings, bids, allBids, info, clients, clientByNorm, attention: attention(bids, info, settings, t) };
}

// Every financial year from the first one the tracker was used in, up to this year (newest first)
export function fyOptions(extra = []) {
  const now = fyOf(today());
  let first = FIRST_FY;
  for (const b of store.all('bids')) { const y = fyOf(b.receivedDate || ''); if (y !== null && y < first) first = y; }
  for (const y of extra) if (y !== null && y !== undefined && y < first) first = y;
  const out = [];
  for (let y = Math.max(now, first); y >= first; y--) out.push(y);
  return out;
}

export function sortRevisions(revs) {
  return revs.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.seq ?? 0) - (b.seq ?? 0) || (a._created || a._ts || 0) - (b._created || b._ts || 0));
}

function bidInfo(b, revs, notes, settings, t, nts = []) {
  const sorted = sortRevisions(revs);
  const first = sorted.length ? sorted[0].value : null;
  const latest = sorted.length ? sorted[sorted.length - 1] : null;
  const current = latest ? latest.value : null;
  const st = STATUS[b.status] || STATUS.inquiry;
  // Readiness from the checklist
  const items = settings.checklist || [];
  const cl = b.checklist || {};
  let done = 0, na = 0;
  for (const it of items) { const s = cl[it]?.s; if (s === 'done') done++; else if (s === 'na') na++; }
  const applicable = items.length - na;
  const readiness = applicable > 0 ? done / applicable : (items.length ? 1 : null);
  const daysToDue = b.dueDate ? daysBetween(t, b.dueDate) : null;
  const validTill = b.submittedDate && b.validityDays ? addDays(b.submittedDate, Number(b.validityDays)) : (b.validTill || '');
  const activityTimes = [b.createdAt || 0, ...notes.map((n) => n.at || n._ts || 0), ...sorted.map((r) => (r.date ? parseISO(r.date).getTime() + 43200000 : (r._ts || 0)))];
  if (b.statusChangedAt) activityTimes.push(b.statusChangedAt);
  const lastActivity = Math.max(...activityTimes);
  const lastNote = notes.filter((n) => n.kind !== 'event').sort((a, b2) => (b2.at || 0) - (a.at || 0))[0] || null;
  const prob = st.open ? (b.prob !== null && b.prob !== undefined && b.prob !== '' ? Number(b.prob) : settings.probabilities[b.status] ?? st.prob) : (b.status === 'won' ? 100 : 0);
  const value = b.status === 'won' && b.orderValue ? b.orderValue : current;
  const margin = b.estCost && current ? (current - b.estCost) / current : null;
  const ntLive = nts.filter((n) => n.status !== 'Rejected by client');
  // Change from R0 measures negotiation, so revisions made for NT items are left out of it
  let ntAdj = 0;
  for (let k = 1; k < sorted.length; k++) if (sorted[k].fromNt) ntAdj += (sorted[k].value || 0) - (sorted[k - 1].value || 0);
  const firstIsNt = !!(sorted.length && sorted[0].fromNt);
  return {
    nts, ntCount: nts.length, ntTotal: ntLive.reduce((s, n) => s + (Number(n.amount) || 0), 0),
    ntApproved: nts.filter((n) => n.status === 'Approved by client').reduce((s, n) => s + (Number(n.amount) || 0), 0),
    revs: sorted, first, current, value, latest,
    change: first && current && !firstIsNt ? (current - ntAdj - first) / first : null, ntAdj,
    readiness, done, applicable, items: items.length,
    daysToDue, validTill, lastActivity, lastNote,
    daysSinceActivity: lastActivity ? Math.floor((Date.now() - lastActivity) / 86400000) : null,
    prob, weighted: st.open && value ? value * prob / 100 : 0,
    margin, open: st.open, fy: fyOf(b.receivedDate || b.dueDate || ''),
    decidedFy: fyOf(b.decisionDate || b.poDate || b.dueDate || b.receivedDate || ''),
  };
}

// The "Needs attention" list. Each item: { sev: 'high'|'mid'|'low', bidId, kind, text, action }
function attention(bids, info, settings, t) {
  const out = [];
  const follow = Number(settings.followUpDays) || 14;
  for (const b of bids) {
    const i = info.get(b.id);
    const name = b.name || 'Untitled bid';
    if (PRE_SUBMIT.includes(b.status)) {
      if (b.dueDate && i.daysToDue < 0) out.push({ sev: 'high', bidId: b.id, kind: 'overdue', order: i.daysToDue, text: `Deadline passed ${plural(-i.daysToDue, 'day')} ago and the offer is not marked submitted.`, action: { act: 'set-status', status: 'submitted', label: 'Mark submitted' } });
      else if (b.dueDate && i.daysToDue <= 2) out.push({ sev: 'high', bidId: b.id, kind: 'due', order: i.daysToDue, text: `Due ${i.daysToDue === 0 ? 'today' : i.daysToDue === 1 ? 'tomorrow' : 'in 2 days'}${b.dueTime ? ' by ' + b.dueTime : ''}. Checklist ${Math.round((i.readiness || 0) * 100)}% done.`, action: { act: 'open-bid', tab: 'checklist', label: 'Open checklist' } });
      else if (b.dueDate && i.daysToDue <= 7) out.push({ sev: 'mid', bidId: b.id, kind: 'due', order: i.daysToDue, text: `Due ${fmtDate(b.dueDate, { day: true })}. Checklist ${Math.round((i.readiness || 0) * 100)}% done.`, action: { act: 'open-bid', tab: 'checklist', label: 'Open checklist' } });
      if (!b.dueDate) out.push({ sev: 'low', bidId: b.id, kind: 'nodate', order: 50, text: 'No submission deadline entered.', action: { act: 'open-bid', tab: 'details', label: 'Add deadline' } });
      for (const [k, label] of [['preBidDate', 'Pre-bid meeting'], ['siteVisitDate', 'Site visit']]) {
        const n = b[k] ? daysBetween(t, b[k]) : null;
        if (n !== null && n >= 0 && n <= 2) out.push({ sev: 'mid', bidId: b.id, kind: 'meeting', order: n, text: `${label} ${n === 0 ? 'today' : n === 1 ? 'tomorrow' : 'in 2 days'} (${fmtDate(b[k], { day: true })}).`, action: { act: 'open-bid', tab: 'details', label: 'View' } });
      }
    }
    if (OPEN_KEYS.includes(b.status) && !b.owner) out.push({ sev: 'low', bidId: b.id, kind: 'noowner', order: 60, text: 'Nobody is assigned to this bid.', action: { act: 'open-bid', tab: 'details', label: 'Assign' } });
    if (AWAITING.includes(b.status)) {
      if (i.validTill) {
        const n = daysBetween(t, i.validTill);
        if (n < 0) out.push({ sev: 'mid', bidId: b.id, kind: 'validity', order: 10 + n, text: `Offer validity ended on ${fmtDate(i.validTill)}. Extend it or send a revised offer.`, action: { act: 'open-bid', tab: 'offers', label: 'Revise offer' } });
        else if (n <= 14) out.push({ sev: 'mid', bidId: b.id, kind: 'validity', order: 10 + n, text: `Offer is valid only till ${fmtDate(i.validTill)} (${plural(n, 'day')} left).`, action: { act: 'open-bid', tab: 'offers', label: 'View offers' } });
      }
      if (i.daysSinceActivity !== null && i.daysSinceActivity >= follow) out.push({ sev: 'mid', bidId: b.id, kind: 'followup', order: 30 - Math.min(i.daysSinceActivity, 29), text: `No update for ${plural(i.daysSinceActivity, 'day')}. Follow up with the client and add a note.`, action: { act: 'quick-note', label: 'Add note' } });
      if (b.expectedDecision && daysBetween(t, b.expectedDecision) < 0) out.push({ sev: 'low', bidId: b.id, kind: 'decision', order: 40, text: `Client's decision was expected by ${fmtDate(b.expectedDecision)}.`, action: { act: 'quick-note', label: 'Add note' } });
    }
    // EMD / bid security
    if (b.emdRequired === 'Yes') {
      const amt = b.emdAmount ? inrShort(b.emdAmount) + ' ' : '';
      if (['lost', 'regret', 'dropped'].includes(b.status) && b.emdStatus === 'Submitted') out.push({ sev: 'mid', bidId: b.id, kind: 'emd', order: 20, text: `EMD ${amt}is still with the client. Ask for it back.`, action: { act: 'emd-returned', label: 'Mark returned' } });
      if (b.status === 'won' && b.emdStatus === 'Submitted') out.push({ sev: 'low', bidId: b.id, kind: 'emd', order: 45, text: `EMD ${amt}to be returned or adjusted against the performance guarantee.`, action: { act: 'open-bid', tab: 'emd', label: 'Update EMD' } });
      if (OPEN_KEYS.includes(b.status) && (!b.emdStatus || b.emdStatus === 'To arrange') && b.dueDate && i.daysToDue !== null && i.daysToDue <= 5 && PRE_SUBMIT.includes(b.status)) out.push({ sev: 'high', bidId: b.id, kind: 'emd', order: i.daysToDue, text: `EMD ${amt}not arranged yet and the bid is due ${i.daysToDue <= 0 ? 'now' : 'in ' + plural(i.daysToDue, 'day')}.`, action: { act: 'open-bid', tab: 'emd', label: 'Update EMD' } });
      if (b.emdExpiry && b.emdStatus === 'Submitted') {
        const n = daysBetween(t, b.emdExpiry);
        if (n <= 15 && OPEN_KEYS.includes(b.status)) out.push({ sev: n < 0 ? 'high' : 'mid', bidId: b.id, kind: 'emd', order: n, text: n < 0 ? `Bank guarantee for EMD expired on ${fmtDate(b.emdExpiry)}.` : `Bank guarantee for EMD expires on ${fmtDate(b.emdExpiry)}. Extend it if the bid is still open.`, action: { act: 'open-bid', tab: 'emd', label: 'Update EMD' } });
      }
    }
    if (b.status === 'won' && !b.poNo && !b.poDate) out.push({ sev: 'low', bidId: b.id, kind: 'po', order: 70, text: 'Won, but the LOI or PO details are not entered.', action: { act: 'open-bid', tab: 'result', label: 'Add PO' } });
  }
  const sevRank = { high: 0, mid: 1, low: 2 };
  out.sort((a, b) => sevRank[a.sev] - sevRank[b.sev] || (a.order ?? 0) - (b.order ?? 0));
  return out;
}

// Totals for a set of bids
export function stats(bids, info) {
  const by = (keys) => bids.filter((b) => keys.includes(b.status));
  const val = (list) => list.reduce((s, b) => s + (info.get(b.id).value || 0), 0);
  const won = by(['won']), lost = by(['lost']);
  return {
    count: bids.length,
    open: by(OPEN_KEYS), openValue: val(by(OPEN_KEYS)),
    awaiting: by(AWAITING), awaitingValue: val(by(AWAITING)),
    won, wonValue: val(won), lost, lostValue: val(lost),
    winRate: won.length + lost.length ? won.length / (won.length + lost.length) : null,
    winRateValue: val(won) + val(lost) ? val(won) / (val(won) + val(lost)) : null,
    weighted: bids.reduce((s, b) => s + (info.get(b.id).weighted || 0), 0),
    closed: by(CLOSED_KEYS),
  };
}

// Bid numbers run per company and financial year: TEJ/26-27/014 for one company, TEP/26-27/003 for the other
export function nextBidNo(fy, company = 'pvt') {
  const prefix = (companyInfo(company).prefix || 'TEJ').trim();
  const tag = `${String(fy).slice(2)}-${String(fy + 1).slice(2)}`;
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${esc}/${tag}/(\\d+)$`);
  let max = 0;
  for (const b of store.all('bids')) {
    const m = String(b.no || '').match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}/${tag}/${String(max + 1).padStart(3, '0')}`;
}

// After merging a teammate's changes two bids can end up with the same number.
// Only the computer that created the later bid renumbers it, so every copy agrees.
export function fixDuplicateNumbers() {
  const groups = groupBy(store.all('bids').filter((b) => b.no), (b) => b.no);
  const fixes = [];
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id)));
    for (const b of list.slice(1)) if (b.createdDev === store.device) fixes.push(b);
  }
  for (const b of fixes) {
    const fy = fyOf(b.receivedDate || '') ?? fyOf(today());
    const no = nextBidNo(fy, companyOf(b));
    store.update('bids', b.id, { no });
    store.create('notes', { bidId: b.id, kind: 'event', at: Date.now(), text: `Bid number changed to ${no} because a teammate created ${b.no} at the same time.` });
  }
  return fixes.length;
}
