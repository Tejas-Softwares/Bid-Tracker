// The side panel that opens when you click a bid. Every field saves as soon as you leave it.
import { store } from '../store.js';
import { derived, companyOf, companyInfo } from '../derive.js';
import { STATUS, STATUSES, PIPELINE_KEYS, EMD_FORMS, EMD_STATUSES, RANKS } from '../config.js';
import { esc, fmtDate, fmtDateTime, timeAgo, inr, inrShort, signedPct, pct, dueWords, fyLabel, isURL, parseMoney, fmtTime, addDays } from '../util.js';
import { fld, datalist, chip, avatar, meter, money, icon, popMenu, toast } from '../ui.js';
import { ui, closeBid, openBid, openClient, rerender } from '../nav.js';
import { setStatus, revisionModal, revLabel, setChecklist, deleteBid, duplicateBid, addNote, ensureClient, teamOptions, ownerUid, wireMoney, logEvent, quickNoteModal } from '../actions.js';
import { ntAddModal, ntEditModal } from '../nt.js';
import { NT_STATUSES } from '../config.js';
import { revLine } from '../charts.js';

const TABS = [
  ['details', 'Details'], ['offers', 'Offers'], ['nt', 'NT items'], ['emd', 'Commercial Terms'], ['checklist', 'Checklist'], ['notes', 'Notes and history'], ['result', 'Result'],
];

export function renderBidPanel() {
  const b = store.get('bids', ui.bid);
  if (!b) return '';
  const d = derived();
  const i = d.info.get(b.id);
  const notes = store.all('notes').filter((n) => n.bidId === b.id);
  const counts = { offers: i.revs.length, nt: i.ntCount, checklist: `${i.done}/${i.applicable}`, notes: notes.filter((n) => n.kind !== 'event').length };
  const st = STATUS[b.status] || STATUS.inquiry;
  const fy = i.fy;
  return `
  <div class="scrim" data-act="close-bid"></div>
  <aside class="drawer" role="dialog" aria-label="${esc(b.name)}" data-bid="${esc(b.id)}">
    <div class="d-head">
      <div class="d-top">
        <span class="tnum">${esc(b.no || 'No number')}</span>${fy !== null ? `<span>·</span><span>${fyLabel(fy)}</span>` : ''}<span class="tag co-tag" title="${esc(companyInfo(companyOf(b), d.settings).name)}">${esc(companyInfo(companyOf(b), d.settings).short)}</span>
        <span class="hide-sm">· Added by ${esc(b.createdBy || 'someone')} ${b.createdAt ? timeAgo(b.createdAt) : ''}</span>
        <span class="grow"></span>
        <span class="saved-flag" aria-live="polite">Saved</span>
        <button class="btn btn-sm" data-act="quick-note" data-id="${esc(b.id)}" aria-label="Add note">${icon('note')}<span class="lbl-sm">Add note</span></button>
        <button class="icon-btn" data-act="bid-menu" data-id="${esc(b.id)}" aria-label="More actions">${icon('more')}</button>
        <button class="icon-btn" data-act="close-bid" aria-label="Close">${icon('x')}</button>
      </div>
      <div class="d-title"><h2><input data-f="name" value="${esc(b.name)}" aria-label="Bid name"></h2></div>
      <div class="d-client"><a href="#" data-act="open-client-by-name" data-name="${esc(b.client || '')}">${esc(b.client || 'No client')}</a>${b.location ? ` · ${esc(b.location)}` : ''}${b.sector ? ` · ${esc(b.sector)}` : ''}</div>
      ${stepper(b)}
      <div class="d-facts">
        <div><div class="k">Submission deadline</div><div class="v">${b.dueDate ? `${esc(fmtDate(b.dueDate))}${['inquiry', 'working'].includes(b.status) ? `<small>${esc(dueWords(b.dueDate))}</small>` : ''}` : '<span class="muted">Not set</span>'}</div></div>
        <div><div class="k">${b.status === 'won' && b.orderValue ? 'Order value' : 'Current offer'}</div><div class="v">${i.value ? `<span data-tip="${esc(inr(i.value))}">${esc(inrShort(i.value))}</span>${i.change ? `<small>${esc(signedPct(i.change))} vs R0</small>` : ''}` : '<span class="muted">Not entered</span>'}</div></div>
        <div><div class="k">Bid owner</div><div class="v" style="display:flex;align-items:center;gap:6px">${avatar(b.owner, 'sm')} ${b.owner ? esc(b.owner) : '<span class="muted">Not assigned</span>'}</div></div>
        <div><div class="k">${st.open ? 'Chance of winning' : 'Outcome'}</div><div class="v">${st.open ? `${i.prob}%` : esc(st.label)}</div></div>
        <div><div class="k">Checklist</div><div class="v" style="display:flex;align-items:center;gap:8px">${i.applicable ? `${Math.round((i.readiness || 0) * 100)}% ${meter(i.readiness)}` : '<span class="muted">—</span>'}</div></div>
      </div>
      <div class="tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" aria-selected="${ui.tab === k}" class="${ui.tab === k ? 'on' : ''}" data-act="bid-tab" data-tab="${k}">${l}${counts[k] !== undefined && counts[k] !== 0 ? `<span class="n">${counts[k]}</span>` : ''}</button>`).join('')}</div>
    </div>
    <div class="d-body">${tabBody(b, i, d, notes)}</div>
  </aside>`;
}

function stepper(b) {
  const cur = STATUS[b.status] || STATUS.inquiry;
  const steps = PIPELINE_KEYS.map((k) => {
    const s = STATUS[k];
    const state = b.status === k ? 'cur' : (cur.i > s.i && cur.open) || (!cur.open && ['won', 'lost'].includes(b.status) && s.i <= 2) ? 'past' : '';
    return `<button class="step st-${k} ${state}" data-act="set-status" data-id="${esc(b.id)}" data-status="${k}" title="${esc(s.label)}: ${esc(s.help)}"><span class="k">${s.i + 1}</span><span class="t">${esc(s.short)}</span></button>`;
  }).join('');
  const out = ['won', 'lost'].map((k) => `<button class="st-${k} ${b.status === k ? 'cur' : ''}" data-act="set-status" data-id="${esc(b.id)}" data-status="${k}" title="${esc(STATUS[k].help)}">${esc(STATUS[k].short)}</button>`).join('');
  const other = ['regret', 'dropped'].includes(b.status);
  return `<div class="stepper" aria-label="Stage">${steps}<div class="outcome">${out}<button class="${other ? 'cur st-' + b.status : ''}" data-act="status-more" data-id="${esc(b.id)}" title="Not bidding or dropped by client">${other ? esc(STATUS[b.status].short) : 'Other'} ▾</button></div></div>`;
}

function tabBody(b, i, d, notes) {
  switch (ui.tab) {
    case 'offers': return offersTab(b, i);
    case 'nt': return ntTab(b, i);
    case 'emd': return emdTab(b);
    case 'checklist': return checklistTab(b, i, d);
    case 'notes': return notesTab(b, notes);
    case 'result': return resultTab(b, i, d);
    default: return detailsTab(b, i, d);
  }
}

const F = (f, b) => fld({ ...f, value: f.value !== undefined ? f.value : (b[f.name] ?? ''), data: `data-f="${f.name}"${f.type ? ` data-t="${f.type}"` : ''}` });

function detailsTab(b, i, d) {
  const s = d.settings;
  const team = teamOptions();
  const scopes = new Set(b.scopes || []);
  const cons = [...new Set(d.bids.map((x) => x.consultant).filter(Boolean))].sort();
  const locs = [...new Set(d.bids.map((x) => x.location).filter(Boolean))].sort();
  const probOpts = [{ v: '', l: `Automatic (${s.probabilities[b.status] ?? STATUS[b.status]?.prob ?? 0}% for ${STATUS[b.status]?.short || ''})` }, ...[10, 20, 30, 40, 50, 60, 70, 80, 90].map((n) => ({ v: n, l: n + '%' }))];
  return `
  <div class="d-sec"><h3>About the bid</h3>
    <div class="grid3">
      ${F({ label: 'Project of', name: 'company', type: 'select', options: s.companies.map((c) => ({ v: c.key, l: c.name })), blank: false, cls: 'span2', value: companyOf(b) }, b)}
      ${F({ label: 'Bid owner', name: 'owner', type: 'select', options: team, blankLabel: 'Not assigned' }, b)}
      ${F({ label: 'Client', name: 'client', list: 'dl-p-clients', cls: 'span2' }, b)}
      ${F({ label: 'Site or location', name: 'location', list: 'dl-p-locs' }, b)}
      ${F({ label: 'Sector', name: 'sector', type: 'select', options: s.sectors }, b)}
      ${F({ label: 'Tender type', name: 'tenderType', type: 'select', options: s.tenderTypes }, b)}
      ${F({ label: "Client's enquiry or RFQ number", name: 'enquiryRef' }, b)}
      ${F({ label: 'Consultant or PMC', name: 'consultant', list: 'dl-p-cons' }, b)}
      <div class="field span-all"><span class="lbl">Scope of work</span><div class="chips-input">${s.scopes.map((x) => `<button type="button" class="tog ${scopes.has(x) ? 'on' : ''}" data-act="toggle-scope" data-scope="${esc(x)}" aria-pressed="${scopes.has(x)}">${esc(x)}</button>`).join('')}${[...scopes].filter((x) => !s.scopes.includes(x)).map((x) => `<button type="button" class="tog on" data-act="toggle-scope" data-scope="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>
      <div class="field span-all"><label for="f_docLink">Tender documents folder</label><div style="display:flex;gap:8px"><input id="f_docLink" type="url" data-f="docLink" value="${esc(b.docLink || '')}" placeholder="Paste the OneDrive or SharePoint folder link" style="flex:1">${isURL(b.docLink) ? `<a class="btn" href="${esc(b.docLink)}" target="_blank" rel="noopener">${icon('open')} Open</a>` : ''}</div></div>
      ${F({ label: 'Remarks', name: 'remarks', type: 'textarea', rows: 2, cls: 'span-all', placeholder: 'Anything the team should know at a glance' }, b)}
    </div>
  </div>
  <div class="d-sec"><h3>Client contact</h3>
    <div class="grid4">
      ${F({ label: 'Name', name: 'contactName', value: b.contactName ?? b.contact ?? '' }, b)}
      ${F({ label: 'Designation', name: 'contactRole' }, b)}
      ${F({ label: 'Phone', name: 'contactPhone' }, b)}
      ${F({ label: 'Email', name: 'contactEmail' }, b)}
    </div>
    ${b.contactPhone || b.contactEmail ? `<div class="contact-acts">${b.contactPhone ? `<a class="btn btn-sm" href="tel:${esc(String(b.contactPhone).replace(/[^+\d]/g, ''))}">${icon('phone')} Call ${esc(b.contactName || '')}</a>` : ''}${b.contactEmail && /@/.test(b.contactEmail) ? `<a class="btn btn-sm" href="mailto:${esc(b.contactEmail)}?subject=${encodeURIComponent((b.no ? b.no + ' ' : '') + b.name)}">${icon('mail')} Email</a>` : ''}</div>` : ''}
  </div>
  <div class="d-sec"><h3>Key dates</h3>
    <div class="grid3">
      ${F({ label: 'Enquiry received on', name: 'receivedDate', type: 'date' }, b)}
      ${F({ label: 'Pre-bid meeting', name: 'preBidDate', type: 'date' }, b)}
      ${F({ label: 'Site visit', name: 'siteVisitDate', type: 'date' }, b)}
      ${F({ label: 'Submission deadline', name: 'dueDate', type: 'date' }, b)}
      ${F({ label: 'Deadline time', name: 'dueTime', type: 'time' }, b)}
      ${F({ label: 'Submitted on', name: 'submittedDate', type: 'date' }, b)}
      ${F({ label: 'Offer valid for (days)', name: 'validityDays', type: 'int', hint: i.validTill ? `Valid till ${esc(fmtDate(i.validTill))}` : 'Counted from the submission date' }, b)}
      ${F({ label: 'Client expected to decide by', name: 'expectedDecision', type: 'date' }, b)}
    </div>
  </div>
  <div class="d-sec"><h3>Value and chances <span class="muted">Internal only</span></h3>
    <div class="grid3">
      <div class="field"><span class="lbl">Current offer</span><div style="padding-top:6px">${i.current ? `<b>${esc(inr(i.current))}</b> <a href="#" data-act="bid-tab" data-tab="offers">Offers</a>` : `<a href="#" data-act="add-revision" data-id="${esc(b.id)}">Add the first offer value</a>`}</div></div>
      ${F({ label: 'Our estimated cost', name: 'estCost', type: 'money', hint: i.margin !== null ? `Margin at current offer: <b>${esc(pct(i.margin, 1))}</b>` : 'To see the margin on this bid' }, b)}
      ${F({ label: 'Chance of winning', name: 'prob', type: 'select', options: probOpts, blank: false }, b)}
    </div>
  </div>
  ${datalist('dl-p-clients', d.clients.map((c) => c.name).sort())}${datalist('dl-p-cons', cons)}${datalist('dl-p-locs', locs)}`;
}

function offersTab(b, i) {
  if (!i.revs.length) {
    return `<div class="empty"><h3>No offer value yet</h3><p>Add the value of your first offer (R0). Every revision after that is added here too, so you can see how the price moved during negotiation.</p><div class="acts"><button class="btn btn-primary" data-act="add-revision" data-id="${esc(b.id)}">${icon('plus')} Add first offer</button></div></div>`;
  }
  const pts = i.revs.map((r, k) => ({ label: 'R' + k, value: r.value }));
  return `
  <div class="d-sec">
    <div class="stat-line">
      <div><div class="k">First offer (R0)</div><div class="v tnum">${esc(inrShort(i.first))}</div></div>
      <div><div class="k">Current offer (${esc(revLabel(i.revs, i.latest))})</div><div class="v tnum">${esc(inrShort(i.current))}</div></div>
      <div><div class="k">${i.ntAdj ? 'Change in negotiation' : 'Change'}</div><div class="v tnum">${i.change ? esc(signedPct(i.change)) : i.change === null ? '—' : '0%'}</div>${i.ntAdj ? `<div class="small muted">NT items (${esc(inrShort(i.ntAdj))}) not counted</div>` : ''}</div>
      ${b.status === 'won' && b.orderValue ? `<div><div class="k">Order value</div><div class="v tnum">${esc(inrShort(b.orderValue))}</div></div>` : ''}
    </div>
    ${pts.length > 1 ? `<div class="rev-chart" data-chart="rev" data-points="${esc(JSON.stringify(pts))}"></div>` : ''}
    <div class="tbl-wrap"><table class="tbl compact rev-table"><thead><tr><th>Rev.</th><th>Date</th><th class="r">Offer value</th><th class="r">Change vs R0</th><th>Reason</th><th>Status</th><th>Remark</th><th></th></tr></thead><tbody>
    ${i.revs.map((r, k) => `<tr><td><b>R${k}</b></td><td class="nowrap">${esc(fmtDate(r.date))}</td><td class="r"><span class="val">${esc(inr(r.value))}</span></td><td class="r tnum">${k === 0 ? '<span class="muted">—</span>' : esc(signedPct((r.value - i.first) / i.first))}</td><td class="reason">${r.fromNt ? '<span class="tag">NT</span> ' : ''}${esc(r.reason || '')}</td><td>${revStatus(r.status)}</td><td>${esc(r.remark || '')}</td><td><button class="icon-btn" data-act="edit-revision" data-id="${esc(b.id)}" data-rev="${esc(r.id)}" aria-label="Edit R${k}">${icon('edit')}</button></td></tr>`).join('')}
    </tbody></table></div>
    <div style="margin-top:12px"><button class="btn btn-primary" data-act="add-revision" data-id="${esc(b.id)}">${icon('plus')} Add revised offer R${i.revs.length}</button></div>
  </div>`;
}
function ntTab(b, i) {
  if (!i.nts.length) {
    return `<div class="empty"><h3>No NT items yet</h3><p>When the client asks for work that was not in the tender, add it here at any stage. Its cost is added to the offer as a new revision automatically.</p><div class="acts"><button class="btn btn-primary" data-act="nt-add" data-id="${esc(b.id)}">${icon('plus')} Add NT items</button></div></div>`;
  }
  const by = (st) => i.nts.filter((n) => n.status === st).reduce((s, n) => s + (Number(n.amount) || 0), 0);
  const list = i.nts.slice().sort((a, c) => (c.date || '').localeCompare(a.date || '') || (c._ts || 0) - (a._ts || 0));
  const revIdx = new Map(i.revs.map((r, k) => [r.id, 'R' + k]));
  const pillCls = { 'Quoted': 'amber', 'Approved by client': 'green', 'Rejected by client': 'red' };
  return `
  <div class="d-sec">
    <div class="stat-line">
      <div><div class="k">NT items</div><div class="v">${i.ntCount}</div></div>
      <div><div class="k">In the offer now</div><div class="v tnum">${esc(inrShort(i.ntTotal, { blank: '₹0' }))}</div></div>
      <div><div class="k">Approved by client</div><div class="v tnum">${esc(inrShort(by('Approved by client'), { blank: '₹0' }))}</div></div>
      <div><div class="k">Waiting (quoted)</div><div class="v tnum">${esc(inrShort(by('Quoted'), { blank: '₹0' }))}</div></div>
      ${by('Rejected by client') ? `<div><div class="k">Rejected</div><div class="v tnum">${esc(inrShort(by('Rejected by client')))}</div></div>` : ''}
    </div>
    <div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Date</th><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th><th>Status</th><th>Offer</th><th></th></tr></thead><tbody>
    ${list.map((n) => `<tr><td class="nowrap small">${esc(fmtDate(n.date))}</td><td><b>${esc(n.desc || '')}</b>${n.ref ? `<div class="small muted">Ref: ${esc(n.ref)}</div>` : ''}</td><td class="r nowrap tnum">${n.qty !== null && n.qty !== undefined ? esc(String(n.qty)) + ' ' + esc(n.unit || '') : ''}</td><td class="r nowrap tnum">${n.rate ? esc(inr(n.rate)) : ''}</td><td class="r nowrap"><span class="val">${esc(inr(n.amount))}</span></td><td><span class="pill ${pillCls[n.status] || ''}">${esc(n.status || 'Quoted')}</span></td><td class="small">${n.revId && revIdx.get(n.revId) ? `<a href="#" data-act="bid-tab" data-tab="offers">${revIdx.get(n.revId)}</a>` : '—'}</td><td><button class="icon-btn" data-act="nt-edit" data-id="${esc(b.id)}" data-nt="${esc(n.id)}" aria-label="Edit ${esc(n.desc || 'item')}">${icon('edit')}</button></td></tr>`).join('')}
    </tbody></table></div>
    <div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" data-act="nt-add" data-id="${esc(b.id)}">${icon('plus')} Add NT items</button><span class="small muted">Adding, changing, rejecting or deleting an NT item creates a new offer revision with the changed cost.</span></div>
  </div>`;
}

function revStatus(s) {
  const cls = { 'Accepted': 'green', 'Rejected': 'red', 'Sent to client': 'blue', 'Under discussion': 'amber' }[s] || '';
  return s ? `<span class="pill ${cls}">${esc(s)}</span>` : '';
}

function emdTab(b) {
  const req = b.emdRequired || '';
  return `
  <div class="d-sec"><h3>EMD or bid security</h3>
    <div class="field" style="margin-bottom:14px"><span class="lbl">Does this tender need an EMD?</span>
      <div class="seg" role="group">${['Yes', 'No', 'Exempt'].map((x) => `<button type="button" class="${req === x ? 'on' : ''}" data-act="set-field" data-f="emdRequired" data-v="${x}">${x === 'Exempt' ? 'Exempt (MSME)' : x}</button>`).join('')}</div>
    </div>
    ${req === 'Yes' ? `<div class="grid3">
      ${F({ label: 'Amount', name: 'emdAmount', type: 'money' }, b)}
      ${F({ label: 'Form', name: 'emdForm', type: 'select', options: EMD_FORMS }, b)}
      ${F({ label: 'Status', name: 'emdStatus', type: 'select', options: EMD_STATUSES }, b)}
      ${F({ label: 'DD, BG or UTR number', name: 'emdNo' }, b)}
      ${F({ label: 'Bank', name: 'emdBank' }, b)}
      ${F({ label: 'Issued on', name: 'emdIssue', type: 'date' }, b)}
      ${F({ label: 'Valid till', name: 'emdExpiry', type: 'date', hint: 'For a bank guarantee. You get a reminder 15 days before.' }, b)}
      ${F({ label: 'Returned on', name: 'emdReturnedOn', type: 'date' }, b)}
    </div>` : ''}
  </div>
  <div class="d-sec"><h3>Commercial terms</h3>
    <div class="grid3">
      ${F({ label: 'Payment terms', name: 'payTerms', type: 'textarea', rows: 2, cls: 'span-all', placeholder: 'e.g. 10% advance against ABG, 80% against RA bills, 10% retention' }, b)}
      ${F({ label: 'Advance %', name: 'advancePct', type: 'pct' }, b)}
      ${F({ label: 'Retention %', name: 'retentionPct', type: 'pct' }, b)}
      ${F({ label: 'Performance guarantee %', name: 'pbgPct', type: 'pct' }, b)}
      ${F({ label: 'Completion period (months)', name: 'completionMonths', type: 'int' }, b)}
      ${F({ label: 'Defect liability (months)', name: 'dlpMonths', type: 'int' }, b)}
      ${F({ label: 'Penalty or LD clause', name: 'ldTerms', placeholder: 'e.g. 0.5% per week, max 5%' }, b)}
      ${F({ label: 'Other key terms or deviations', name: 'otherTerms', type: 'textarea', rows: 2, cls: 'span-all' }, b)}
    </div>
  </div>`;
}

function checklistTab(b, i, d) {
  const items = d.settings.checklist || [];
  if (!items.length) return `<div class="empty"><h3>No checklist set up</h3><p>Add the steps your team follows for every tender in Settings, and they appear on every bid.</p><div class="acts"><button class="btn" data-act="go" data-view="settings" data-tab="lists">Open settings</button></div></div>`;
  const cl = b.checklist || {};
  return `
  <div class="cl-sum"><b>${i.done} of ${i.applicable} done</b>${meter(i.readiness)}<span class="muted small">${items.length - i.applicable ? `${items.length - i.applicable} not needed` : ''}</span></div>
  <div class="cl">${items.map((it) => {
    const st = cl[it]?.s || '';
    return `<div class="cl-item ${st}"><input type="checkbox" ${st === 'done' ? 'checked' : ''} ${st === 'na' ? 'disabled' : ''} data-act="cl-toggle" data-label="${esc(it)}" aria-label="${esc(it)}">
      <span class="lbl">${esc(it)}</span>
      <span style="display:flex;align-items:center;gap:8px">${st ? `<span class="who">${st === 'na' ? 'Not needed' : 'Done'}${cl[it].by ? ' · ' + esc(cl[it].by) : ''}${cl[it].ts ? ', ' + esc(fmtDate(new Date(cl[it].ts).toISOString().slice(0, 10), { short: true })) : ''}</span>` : ''}
      ${st !== 'done' ? `<button class="na-btn" data-act="cl-na" data-label="${esc(it)}">${st === 'na' ? 'Needed' : 'Not needed'}</button>` : ''}</span></div>`;
  }).join('')}</div>
  <p class="small muted" style="margin-top:10px">The same checklist appears on every bid. Change it in <a href="#" data-act="go" data-view="settings" data-tab="lists">Settings</a>.</p>`;
}

function notesTab(b, notes) {
  const list = notes.slice().sort((a, c) => (c.at || c._ts) - (a.at || a._ts));
  return `
  <div class="note-box"><textarea data-note-input placeholder="Add a note: a call with the client, a clarification sent, a decision taken" aria-label="New note"></textarea><button class="btn btn-primary" data-act="add-note" data-id="${esc(b.id)}">Add</button></div>
  <div class="tl">${list.length ? list.map((n) => `
    <div class="tl-item ${n.kind === 'event' ? 'event' : ''}">
      ${n.kind === 'event' ? `<span class="ev-ic">${icon('history')}</span>` : avatar(n.by || n._by, 'sm')}
      <div class="body"><div class="meta"><b>${esc(n.by || n._by || 'Someone')}</b> · ${esc(fmtDateTime(n.at || n._ts))}${n.kind !== 'event' && ((n.by || n._by) === store.me) ? ` <button class="del" data-act="del-note" data-note="${esc(n.id)}" aria-label="Delete note">Delete</button>` : ''}</div><div class="txt">${esc(n.text)}</div></div>
    </div>`).join('') : '<p class="muted">No notes yet.</p>'}</div>`;
}

function resultTab(b, i, d) {
  const s = d.settings;
  const st = STATUS[b.status];
  let body = '';
  if (st.open) {
    body = `<div class="empty" style="margin-bottom:20px"><h3>Still open</h3><p>When the client decides, mark the bid as won or lost. You will be asked for the order or the reason.</p><div class="acts"><button class="btn" data-act="set-status" data-id="${esc(b.id)}" data-status="won">Mark as won</button><button class="btn" data-act="set-status" data-id="${esc(b.id)}" data-status="lost">Mark as lost</button></div></div>`;
  } else if (b.status === 'won') {
    body = `<div class="d-sec"><h3>${icon('trophy')} Order details</h3><div class="grid3">
      ${F({ label: 'LOI, work order or PO number', name: 'poNo' }, b)}
      ${F({ label: 'Dated', name: 'poDate', type: 'date' }, b)}
      ${F({ label: 'Order value', name: 'orderValue', type: 'money', hint: i.current ? `Last offer ${esc(inrShort(i.current))}` : '' }, b)}
      ${F({ label: 'Decision date', name: 'decisionDate', type: 'date' }, b)}
    </div></div>`;
  } else if (b.status === 'lost') {
    body = `<div class="d-sec"><h3>Why we lost</h3><div class="grid3">
      ${F({ label: 'Main reason', name: 'lossReason', type: 'select', options: s.lossReasons }, b)}
      ${F({ label: 'Our position', name: 'rank', type: 'select', options: RANKS }, b)}
      ${F({ label: 'Decision date', name: 'decisionDate', type: 'date' }, b)}
      ${F({ label: 'Order went to', name: 'winner' }, b)}
      ${F({ label: 'Their price', name: 'winnerPrice', type: 'money', hint: b.winnerPrice && i.current ? `We were ${esc(signedPct((i.current - b.winnerPrice) / b.winnerPrice))} against them` : '' }, b)}
    </div></div>`;
  } else if (b.status === 'regret') {
    body = `<div class="d-sec"><h3>Why we did not bid</h3><div class="grid3">${F({ label: 'Reason', name: 'regretReason', type: 'select', options: s.regretReasons, cls: 'span2' }, b)}${F({ label: 'Decided on', name: 'decisionDate', type: 'date' }, b)}</div></div>`;
  } else {
    body = `<div class="d-sec"><h3>Dropped by the client</h3><div class="grid3">${F({ label: 'Date', name: 'decisionDate', type: 'date' }, b)}</div></div>`;
  }
  return `${body}
  <div class="d-sec"><h3>Competition and lessons</h3><div class="grid2">
    ${F({ label: 'Other bidders', name: 'competitors', type: 'textarea', rows: 3, placeholder: 'One per line, with their price if known' }, b)}
    ${F({ label: 'What we learned', name: 'lessons', type: 'textarea', rows: 3 }, b)}
  </div></div>`;
}

// ---------- after render: charts and live money previews ----------
export function mountBidPanel(root) {
  if (!root) return;
  wireMoney(root);
  const slot = root.querySelector('[data-chart="rev"]');
  if (slot && slot.dataset.points) {
    const pts = JSON.parse(slot.dataset.points);
    slot.innerHTML = revLine(Math.max(300, slot.clientWidth), pts, (v) => inrShort(v));
  }
}

// ---------- saving a field ----------
export function saveField(el) {
  const b = store.get('bids', ui.bid);
  if (!b) return;
  const f = el.dataset.f;
  const t = el.dataset.t || el.dataset.type;
  let v = el.value;
  if (t === 'money') {
    const n = parseMoney(v);
    if (v.trim() && (n === null || isNaN(n))) { toast('Type an amount like 4.5 cr, 85 L or 8500000'); el.focus(); return; }
    v = v.trim() ? n : null;
  } else if (t === 'int') v = v === '' ? '' : parseInt(v, 10);
  else if (t === 'pct' || t === 'num') v = v === '' ? '' : Number(v);
  else if (f === 'prob') v = v === '' ? null : Number(v);
  else v = typeof v === 'string' ? v.trim() : v;
  if (f === 'name' && !v) { el.value = b.name; toast('A bid needs a name'); return; }
  const patch = { [f]: v };
  if (f === 'owner') patch.ownerUid = ownerUid(v);
  if (f === 'client') {
    if (!v) { el.value = b.client || ''; toast('A bid needs a client'); return; }
    const c = ensureClient(v);
    patch.client = c.name; patch.clientId = c.id;
  }
  if (JSON.stringify(b[f] ?? '') === JSON.stringify(v ?? '')) return;
  store.update('bids', b.id, patch);
  if (f === 'owner') logEvent(b.id, v ? `Assigned to ${v}.` : 'Owner removed.');
  if (f === 'dueDate') logEvent(b.id, v ? `Submission deadline set to ${fmtDate(v)}.` : 'Submission deadline removed.');
  flashSaved();
}
function flashSaved() {
  const f = document.querySelector('.drawer .saved-flag');
  if (!f) return;
  f.classList.add('on');
  clearTimeout(flashSaved.t);
  flashSaved.t = setTimeout(() => f.classList.remove('on'), 1400);
}

export function bidPanelAction(act, el) {
  const b = store.get('bids', ui.bid);
  switch (act) {
    case 'close-bid': closeBid(); return true;
    case 'bid-tab': ui.tab = el.dataset.tab; openBid(ui.bid, el.dataset.tab); return true;
    case 'toggle-scope': {
      if (!b) return true;
      const set = new Set(b.scopes || []);
      const x = el.dataset.scope;
      if (set.has(x)) set.delete(x); else set.add(x);
      store.update('bids', b.id, { scopes: [...set] }); flashSaved(); return true;
    }
    case 'set-field': if (b) { store.update('bids', b.id, { [el.dataset.f]: el.dataset.v }); flashSaved(); } return true;
    case 'cl-toggle': if (b) setChecklist(b.id, el.dataset.label, el.checked ? 'done' : null); return true;
    case 'cl-na': if (b) setChecklist(b.id, el.dataset.label, (b.checklist?.[el.dataset.label]?.s === 'na') ? null : 'na'); return true;
    case 'add-note': {
      const ta = document.querySelector('.drawer [data-note-input]');
      if (b && ta && ta.value.trim()) { addNote(b.id, ta.value); ta.value = ''; toast('Note added'); }
      else ta?.focus();
      return true;
    }
    case 'del-note': store.remove('notes', el.dataset.note); toast('Note deleted', { undo: () => store.restore('notes', el.dataset.note) }); return true;
    case 'add-revision': revisionModal(el.dataset.id || ui.bid); return true;
    case 'nt-add': ntAddModal(el.dataset.id || ui.bid); return true;
    case 'nt-edit': ntEditModal(el.dataset.id || ui.bid, el.dataset.nt); return true;
    case 'edit-revision': revisionModal(el.dataset.id || ui.bid, el.dataset.rev); return true;
    case 'status-more': popMenu(el, ['regret', 'dropped', 'inquiry'].map((k) => ({ html: `<span class="chip st-${k}">${esc(STATUS[k].label)}</span>`, on: b?.status === k, onClick: () => setStatus(b.id, k) }))); return true;
    case 'bid-menu': popMenu(el, [
      { html: `${icon('note')} Add a note`, onClick: () => quickNoteModal(b.id) },
      { html: `${icon('file')} Duplicate this bid`, onClick: () => duplicateBid(b.id) },
      { html: `${icon('clients')} Open client`, onClick: () => { const c = store.all('clients').find((x) => x.id === b.clientId) || ensureClient(b.client); openClient(c.id); } },
      '-',
      { html: `<span style="color:var(--red);display:flex;gap:9px;align-items:center">${icon('trash')} Delete bid</span>`, onClick: () => deleteBid(b.id) },
    ]); return true;
    case 'open-client-by-name': { if (!b) return true; const c = store.get('clients', b.clientId) || ensureClient(b.client); if (c) openClient(c.id); return true; }
    default: return false;
  }
}
export { rerender };
