// Things people do: create bids, change status, add offers and notes. Each step that changes a bid
// also leaves a line in the bid's history so the team can see who did what.
import { store } from './store.js';
import { derived, nextBidNo, sortRevisions, companyOf, companyInfo } from './derive.js';
import { STATUS, REVISION_STATUSES, RANKS, AUTO_TICK_ON_SUBMIT, OPEN_KEYS } from './config.js';
import { esc, today, fyOf, parseMoney, inrShort, inr, normName, similarity, fmtDate, signedPct, addDays, groupIndian } from './util.js';
import { modal, toast, fld, datalist, confirmBox, typedConfirm, icon, unsavedBox, checkForm, setFieldErr } from './ui.js';
import { openBid, ui, rerender } from './nav.js';
import { view } from './derive.js';

export function logEvent(bidId, text) {
  store.create('notes', { bidId, kind: 'event', text, at: Date.now(), by: store.me });
}
export function addNote(bidId, text) {
  text = String(text || '').trim();
  if (!text) return null;
  return store.create('notes', { bidId, kind: 'note', text, at: Date.now(), by: store.me });
}

export function ensureClient(name) {
  name = String(name || '').trim();
  if (!name) return null;
  const n = normName(name);
  const found = store.all('clients').find((c) => normName(c.name) === n);
  if (found) return found;
  return store.create('clients', { name, contacts: [] });
}

// Bid owners are the people with an active account
// Everyone with an account, plus owner names already on bids (for example from an imported Excel file)
export function teamOptions() {
  const names = (store.users || []).map((u) => u.name);
  if (store.me && !names.includes(store.me)) names.push(store.me);
  for (const b of store.all('bids')) if (b.owner && !names.includes(b.owner)) names.push(b.owner);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}
export function ownerUid(name) { const u = (store.users || []).find((x) => x.name === name); return u ? u.id : ''; }

// Live wiring for money inputs: show "₹45 L" under the box as you type
export function wireMoney(root) {
  root.querySelectorAll('input[data-type="money"]').forEach((inp) => {
    const prev = inp.closest('.field')?.querySelector('.money-preview');
    const upd = () => {
      const v = parseMoney(inp.value);
      if (!prev) return;
      if (inp.value.trim() === '') { prev.textContent = 'Type 4.5 cr, 85 L or 8500000'; prev.style.color = ''; }
      else if (isNaN(v) || v === null) { prev.textContent = 'Not a valid amount'; prev.style.color = 'var(--red)'; }
      else { prev.textContent = `${inrShort(v)}  (${inr(v)})`; prev.style.color = ''; }
    };
    inp.addEventListener('input', upd);
    inp.addEventListener('blur', () => { const v = parseMoney(inp.value); if (v !== null && !isNaN(v)) inp.value = groupIndian(v); });
  });
}

function val(root, name) { const el = root.querySelector(`[name="${name}"]`); return el ? el.value.trim() : ''; }
function money(root, name) { const v = parseMoney(val(root, name)); return v === null || isNaN(v) ? null : v; }
function markErr(root, name, msg) {
  const f = root.querySelector(`[name="${name}"]`)?.closest('.field');
  if (!f) return;
  f.classList.add('err');
  if (!f.querySelector('.err-msg')) f.insertAdjacentHTML('beforeend', `<div class="err-msg">${esc(msg)}</div>`);
  f.querySelector('input,select,textarea')?.focus();
}

// ---------------- new bid ----------------
export function newBidModal(prefill = {}) {
  const d = derived();
  const s = d.settings;
  const team = teamOptions();
  const owner = prefill.owner ?? (team.includes(store.me) ? store.me : '');
  const clients = d.clients.map((c) => c.name).sort();
  const consultants = [...new Set(d.bids.map((b) => b.consultant).filter(Boolean))].sort();
  const locations = [...new Set(d.bids.map((b) => b.location).filter(Boolean))].sort();
  const scopes = new Set(prefill.scopes || []);
  const company = prefill.company || (view.company || 'pvt');
  const body = `
    <div class="field" style="margin-bottom:14px"><span class="lbl">Project of <span class="req">*</span></span>
      <div class="seg company-seg" role="radiogroup" aria-label="Project of" data-companies>${s.companies.map((c) => `<button type="button" role="radio" aria-checked="${c.key === company}" class="${c.key === company ? 'on' : ''}" data-company="${esc(c.key)}">${esc(c.name)}</button>`).join('')}</div>
    </div>
    <div class="grid2">
      ${fld({ label: 'Bid or tender name', name: 'name', value: prefill.name || '', req: true, cls: 'span-all', placeholder: 'e.g. LT electrical works, Building B, Chakan' })}
      ${fld({ label: 'Client', name: 'client', value: prefill.client || '', req: true, list: 'dl-clients', placeholder: 'Start typing; a new name adds a new client' })}
      ${fld({ label: 'Site or location', name: 'location', value: prefill.location || '', list: 'dl-locs', placeholder: 'e.g. Chakan, Pune' })}
    </div>
    <fieldset class="sub-sec"><legend>Client contact</legend>
      <div class="contact-pick" data-contact-pick></div>
      <div class="grid4">
        ${fld({ label: 'Name', name: 'contactName', value: prefill.contactName || '', placeholder: 'Contact person' })}
        ${fld({ label: 'Designation', name: 'contactRole', value: prefill.contactRole || '', placeholder: 'e.g. Purchase manager' })}
        ${fld({ label: 'Phone', name: 'contactPhone', value: prefill.contactPhone || '' })}
        ${fld({ label: 'Email', name: 'contactEmail', value: prefill.contactEmail || '' })}
      </div>
    </fieldset>
    <div class="grid2">
      ${fld({ label: 'Submission deadline', name: 'dueDate', type: 'date', value: prefill.dueDate || '' })}
      ${fld({ label: 'Time', name: 'dueTime', type: 'time', value: prefill.dueTime || '', hint: 'Optional' })}
      ${fld({ label: 'Enquiry received on', name: 'receivedDate', type: 'date', value: prefill.receivedDate || today(), req: true })}
      ${fld({ label: 'Bid owner', name: 'owner', type: 'select', options: team, value: owner, blankLabel: 'Not assigned yet' })}
      ${fld({ label: 'Sector', name: 'sector', type: 'select', options: s.sectors, value: prefill.sector || '' })}
      ${fld({ label: 'Tender type', name: 'tenderType', type: 'select', options: s.tenderTypes, value: prefill.tenderType || '' })}
      ${fld({ label: 'Consultant or PMC', name: 'consultant', value: prefill.consultant || '', list: 'dl-cons', placeholder: 'If any' })}
      ${fld({ label: 'First offer value', name: 'value', type: 'money', value: prefill.value ?? '', hint: '' })}
      <div class="field span-all"><span class="lbl">Scope of work</span><div class="chips-input" data-scopes>${s.scopes.map((x) => `<button type="button" class="tog ${scopes.has(x) ? 'on' : ''}" data-scope="${esc(x)}" aria-pressed="${scopes.has(x)}">${esc(x)}</button>`).join('')}</div></div>
    </div>
    <div class="dup-slot"></div>
    ${datalist('dl-clients', clients)}${datalist('dl-cons', consultants)}${datalist('dl-locs', locations)}`;
  let snap = '';
  const formSnap = (root) => [...root.querySelectorAll('input, select, textarea')].map((el) => `${el.name}=${el.value}`).join('\n')
    + '|' + [...root.querySelectorAll('[data-scope].on')].map((b) => b.dataset.scope).sort().join(',')
    + '|' + (root.querySelector('[data-company].on')?.dataset.company || '');
  const m = modal({
    title: 'New bid', sub: 'Only the name, client and enquiry date are needed now. Everything else can be added later.', wide: true, body,
    actions: [{ label: 'Cancel' }, { label: 'Create bid', cls: 'btn-primary', onClick: (root) => createFromModal(root) }],
    beforeClose: async (root) => {
      if (formSnap(root) === snap) return true;
      const choice = await unsavedBox({ title: 'Save this bid?', text: 'This bid has not been created yet. Save it before closing?', save: 'Save bid' });
      if (choice === 'discard') return true;
      if (choice === 'save') return createFromModal(root);
      return false;
    },
    onMount: (root) => {
      wireMoney(root);
      root.querySelector('[data-scopes]').addEventListener('click', (e) => {
        const b = e.target.closest('[data-scope]'); if (!b) return;
        b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on'));
      });
      root.querySelector('[data-companies]').addEventListener('click', (e) => {
        const b = e.target.closest('[data-company]'); if (!b) return;
        root.querySelectorAll('[data-company]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
      });
      // Offer the client's saved contacts to fill in
      const contactPick = () => {
        const c = store.all('clients').find((x) => normName(x.name) === normName(val(root, 'client')));
        const list = (c && c.contacts || []).filter((x) => x.name);
        const slot = root.querySelector('[data-contact-pick]');
        slot.innerHTML = list.length ? `<div class="field" style="margin-bottom:10px"><label for="f_pick">Saved contacts at ${esc(c.name)}</label><select id="f_pick" data-pick>${'<option value="">Choose a saved contact or type a new one below</option>'}${list.map((x, i) => `<option value="${i}">${esc(x.name)}${x.role ? ' · ' + esc(x.role) : ''}</option>`).join('')}</select></div>` : '';
        const sel = slot.querySelector('[data-pick]');
        if (sel) sel.addEventListener('change', () => { const x = list[+sel.value]; if (!x) return; for (const [f, k] of [['contactName', 'name'], ['contactRole', 'role'], ['contactPhone', 'phone'], ['contactEmail', 'email']]) { const inp = root.querySelector(`[name=${f}]`); if (inp) { inp.value = x[k] || ''; setFieldErr(inp, ''); } } });
      };
      root.querySelector('[name=client]').addEventListener('change', contactPick);
      root.querySelector('[name=client]').addEventListener('input', () => { if (store.all('clients').some((x) => normName(x.name) === normName(val(root, 'client')))) contactPick(); });
      contactPick();
      const dupCheck = () => {
        const name = val(root, 'name'), client = val(root, 'client');
        const slot = root.querySelector('.dup-slot');
        if (name.length < 4) { slot.innerHTML = ''; return; }
        const hits = store.all('bids').filter((b) => (similarity(b.name, name) > 0.62 && (!client || normName(b.client) === normName(client) || similarity(b.client, client) > 0.7)))
          .sort((a, b) => similarity(b.name, name) - similarity(a.name, name)).slice(0, 2);
        slot.innerHTML = hits.length ? `<div class="dup-warn"><b>This may already be in the tracker:</b> ${hits.map((b) => `<a href="#" data-dup="${b.id}">${esc(b.no || '')} ${esc(b.name)}</a> (${esc(b.client || '')}, ${esc(STATUS[b.status]?.label || '')})`).join('; ')}</div>` : '';
      };
      root.querySelector('[name=name]').addEventListener('input', dupCheck);
      root.querySelector('[name=client]').addEventListener('change', dupCheck);
      root.querySelector('.dup-slot').addEventListener('click', (e) => { const a = e.target.closest('[data-dup]'); if (a) { e.preventDefault(); m.close(); openBid(a.dataset.dup); } });
      snap = formSnap(root);
    },
  });
  return m;
}

function createFromModal(root) {
  root.querySelectorAll('.field.err').forEach((f) => { f.classList.remove('err'); f.querySelector('.err-msg')?.remove(); });
  const name = val(root, 'name'), clientName = val(root, 'client'), received = val(root, 'receivedDate');
  if (!name) { markErr(root, 'name', 'Give the bid a name.'); return false; }
  if (!clientName) { markErr(root, 'client', 'Which client is this for?'); return false; }
  if (!received) { markErr(root, 'receivedDate', 'When did the enquiry come in?'); return false; }
  const rawV = val(root, 'value');
  const v = parseMoney(rawV);
  if (rawV && (v === null || isNaN(v))) { markErr(root, 'value', 'Type an amount like 4.5 cr, 85 L or 8500000.'); return false; }
  if (!checkForm(root)) return false;
  const client = ensureClient(clientName);
  const scopes = Array.from(root.querySelectorAll('[data-scope].on')).map((b) => b.dataset.scope);
  const company = root.querySelector('[data-company].on')?.dataset.company || 'pvt';
  const fy = fyOf(received);
  const contact = { name: val(root, 'contactName'), role: val(root, 'contactRole'), phone: val(root, 'contactPhone'), email: val(root, 'contactEmail') };
  const owner = val(root, 'owner');
  const bid = store.create('bids', {
    no: nextBidNo(fy, company), company, name, client: client.name, clientId: client.id,
    contactName: contact.name, contactRole: contact.role, contactPhone: contact.phone, contactEmail: contact.email,
    location: val(root, 'location'), dueDate: val(root, 'dueDate'), dueTime: val(root, 'dueTime'), receivedDate: received,
    owner, ownerUid: ownerUid(owner), sector: val(root, 'sector') || client.sector || '', tenderType: val(root, 'tenderType'), consultant: val(root, 'consultant'),
    scopes, status: 'inquiry', checklist: {}, statusChangedAt: Date.now(),
  });
  // a new contact person is also saved on the client
  if (contact.name && !(client.contacts || []).some((x) => normName(x.name) === normName(contact.name))) store.update('clients', client.id, { contacts: [...(client.contacts || []), contact] });
  if (!client.sector && bid.sector) store.update('clients', client.id, { sector: bid.sector });
  if (v) store.create('revisions', { bidId: bid.id, date: received, value: v, reason: 'First offer', status: 'Under discussion', remark: '', seq: 0 });
  logEvent(bid.id, `Bid created${bid.owner ? ` and assigned to ${bid.owner}` : ''}.`);
  toast(`${bid.no} created`);
  setTimeout(() => openBid(bid.id, 'details'), 0);
  return true;
}

// ---------------- status changes ----------------
export function setStatus(bidId, to) {
  const b = store.get('bids', bidId);
  if (!b || b.status === to) return;
  const d = derived();
  const info = d.info.get(bidId);
  const s = d.settings;
  const from = STATUS[b.status]?.label || b.status;
  const label = STATUS[to].label;
  const apply = (patch = {}, extra) => {
    store.update('bids', bidId, { status: to, statusChangedAt: Date.now(), ...patch });
    logEvent(bidId, `Status changed from ${from} to ${label}.${extra ? ' ' + extra : ''}`);
    toast(`${b.no || 'Bid'} moved to ${label}`);
  };
  if (to === 'submitted') {
    const noOffer = !info.revs.length;
    return modal({
      title: 'Mark as submitted', sub: esc(b.name),
      body: `<div class="grid2">
        ${fld({ label: 'Submitted on', name: 'submittedDate', type: 'date', value: b.submittedDate || today(), req: true })}
        ${fld({ label: 'Offer valid for (days)', name: 'validityDays', type: 'int', value: b.validityDays || s.validityDays, hint: 'From the date of submission' })}
        ${noOffer ? fld({ label: 'Offer value submitted', name: 'value', type: 'money', value: '', cls: 'span-all' }) : `<div class="field span-all"><span class="lbl">Offer value</span><div>${esc(inr(info.current))} <span class="muted">(${esc(inrShort(info.current))}, from the Offers tab)</span></div></div>`}
        ${fld({ label: 'Client expected to decide by', name: 'expectedDecision', type: 'date', value: b.expectedDecision || '', hint: 'Optional. You get a reminder after this date.' })}
      </div>`,
      onMount: wireMoney,
      actions: [{ label: 'Cancel' }, { label: 'Mark as submitted', cls: 'btn-primary', onClick: (root) => {
        const sd = val(root, 'submittedDate') || today();
        const patch = { submittedDate: sd, validityDays: Number(val(root, 'validityDays')) || s.validityDays, expectedDecision: val(root, 'expectedDecision') };
        const cl = { ...(b.checklist || {}) };
        if ((s.checklist || []).includes(AUTO_TICK_ON_SUBMIT)) cl[AUTO_TICK_ON_SUBMIT] = { s: 'done', by: store.me, ts: Date.now() };
        patch.checklist = cl;
        if (noOffer) {
          const raw = val(root, 'value'); const v = parseMoney(raw);
          if (raw && (v === null || isNaN(v))) { markErr(root, 'value', 'Type an amount like 4.5 cr, 85 L or 8500000.'); return false; }
          if (v) store.create('revisions', { bidId, date: sd, value: v, reason: 'First offer', status: 'Sent to client', remark: '', seq: 0 });
        } else if (info.latest && info.latest.status === 'Under discussion') {
          store.update('revisions', info.latest.id, { status: 'Sent to client' });
        }
        apply(patch, `Offer valid till ${fmtDate(addDays(sd, patch.validityDays))}.`);
      } }],
    });
  }
  if (to === 'won') {
    return modal({
      title: 'Mark as won', sub: esc(b.name),
      body: `<div class="grid2">
        ${fld({ label: 'LOI, work order or PO number', name: 'poNo', value: b.poNo || '' })}
        ${fld({ label: 'Dated', name: 'poDate', type: 'date', value: b.poDate || today() })}
        ${fld({ label: 'Order value', name: 'orderValue', type: 'money', value: b.orderValue || info.current || '', hint: info.current ? `Last offer: ${esc(inrShort(info.current))}` : '' })}
        ${fld({ label: 'Decision date', name: 'decisionDate', type: 'date', value: b.decisionDate || today() })}
      </div>${b.emdRequired === 'Yes' && b.emdStatus === 'Submitted' ? '<p class="small muted" style="margin:12px 0 0">The EMD will now show as "to be returned or adjusted" until you update it.</p>' : ''}`,
      onMount: wireMoney,
      actions: [{ label: 'Cancel' }, { label: 'Skip details', onClick: () => apply({ decisionDate: b.decisionDate || today() }) }, { label: 'Mark as won', cls: 'btn-primary', onClick: (root) => {
        const raw = val(root, 'orderValue'); const ov = parseMoney(raw);
        if (raw && (ov === null || isNaN(ov))) { markErr(root, 'orderValue', 'Type an amount like 4.5 cr, 85 L or 8500000.'); return false; }
        apply({ poNo: val(root, 'poNo'), poDate: val(root, 'poDate'), orderValue: ov, decisionDate: val(root, 'decisionDate') || today() }, val(root, 'poNo') ? `Order ${val(root, 'poNo')}.` : '');
      } }],
    });
  }
  if (to === 'lost') {
    return modal({
      title: 'Mark as lost', sub: 'Recording why helps the team price the next bid better.',
      body: `<div class="grid2">
        ${fld({ label: 'Main reason', name: 'lossReason', type: 'select', options: s.lossReasons, value: b.lossReason || '' })}
        ${fld({ label: 'Our position', name: 'rank', type: 'select', options: RANKS, value: b.rank || '' })}
        ${fld({ label: 'Order went to', name: 'winner', value: b.winner || '', placeholder: 'Competitor name' })}
        ${fld({ label: 'Their price', name: 'winnerPrice', type: 'money', value: b.winnerPrice || '' })}
        ${fld({ label: 'Decision date', name: 'decisionDate', type: 'date', value: b.decisionDate || today() })}
        ${fld({ label: 'What we learned', name: 'lessons', type: 'textarea', value: b.lessons || '', cls: 'span-all', rows: 2 })}
      </div>`,
      onMount: wireMoney,
      actions: [{ label: 'Cancel' }, { label: 'Skip details', onClick: () => apply({ decisionDate: b.decisionDate || today() }) }, { label: 'Mark as lost', cls: 'btn-primary', onClick: (root) => {
        const raw = val(root, 'winnerPrice'); const wp = parseMoney(raw);
        if (raw && (wp === null || isNaN(wp))) { markErr(root, 'winnerPrice', 'Type an amount like 4.5 cr, 85 L or 8500000.'); return false; }
        apply({ lossReason: val(root, 'lossReason'), rank: val(root, 'rank'), winner: val(root, 'winner'), winnerPrice: wp, decisionDate: val(root, 'decisionDate') || today(), lessons: val(root, 'lessons') }, val(root, 'lossReason') ? `Reason: ${val(root, 'lossReason')}.` : '');
      } }],
    });
  }
  if (to === 'regret') {
    return modal({
      title: 'Not bidding', sub: esc(b.name),
      body: `<div class="grid2">${fld({ label: 'Why not', name: 'regretReason', type: 'select', options: s.regretReasons, value: b.regretReason || '', cls: 'span-all' })}</div>`,
      actions: [{ label: 'Cancel' }, { label: 'Mark as not bidding', cls: 'btn-primary', onClick: (root) => apply({ regretReason: val(root, 'regretReason'), decisionDate: today() }, val(root, 'regretReason') ? `Reason: ${val(root, 'regretReason')}.` : '') }],
    });
  }
  if (to === 'dropped') {
    return modal({
      title: 'Dropped by client', sub: 'The client cancelled the tender or put it on hold.',
      body: fld({ label: 'Note', name: 'note', type: 'textarea', rows: 2, placeholder: 'Optional' }),
      actions: [{ label: 'Cancel' }, { label: 'Mark as dropped', cls: 'btn-primary', onClick: (root) => { apply({ decisionDate: today() }); if (val(root, 'note')) addNote(bidId, val(root, 'note')); } }],
    });
  }
  apply();
}

export function statusMenuItems(bidId) {
  const b = store.get('bids', bidId);
  return Object.values(STATUS).map((s) => ({ html: `<span class="chip st-${s.key}">${esc(s.label)}</span>`, on: b && b.status === s.key, onClick: () => setStatus(bidId, s.key) }));
}

// ---------------- offers / revisions ----------------
export function revisionModal(bidId, revId) {
  const d = derived();
  const info = d.info.get(bidId);
  const rev = revId ? store.get('revisions', revId) : null;
  const isFirst = rev ? info.revs[0]?.id === rev.id : !info.revs.length;
  const s = d.settings;
  const reasons = isFirst ? ['First offer', ...s.revisionReasons] : s.revisionReasons;
  const title = rev ? `Edit ${revLabel(info.revs, rev)}` : isFirst ? 'Add first offer' : `Add revised offer R${info.revs.length}`;
  modal({
    title, sub: isFirst ? 'The first offer (R0) is the value you started with.' : `First offer: ${esc(inr(info.first))}. Latest: ${esc(inr(info.current))}.`,
    body: `<div class="grid2">
      ${fld({ label: 'Offer value', name: 'value', type: 'money', value: rev ? rev.value : '', req: true })}
      ${fld({ label: 'Date', name: 'date', type: 'date', value: rev ? rev.date : today(), req: true })}
      ${fld({ label: 'Reason', name: 'reason', type: 'select', options: reasons, value: rev ? rev.reason : (isFirst ? 'First offer' : ''), blank: !isFirst })}
      ${fld({ label: 'Status', name: 'status', type: 'select', options: REVISION_STATUSES, value: rev ? rev.status : 'Sent to client', blank: false })}
      ${fld({ label: 'Remark', name: 'remark', value: rev ? rev.remark : '', cls: 'span-all', placeholder: 'e.g. Reduced cable tray scope after site visit' })}
      <div class="span-all small muted" data-change></div>
    </div>`,
    onMount: (root) => {
      wireMoney(root);
      const inp = root.querySelector('[name=value]');
      const upd = () => {
        const v = parseMoney(inp.value);
        const el = root.querySelector('[data-change]');
        if (!isFirst && info.first && v && !isNaN(v)) el.textContent = `${signedPct((v - info.first) / info.first)} compared with the first offer (${inrShort(v - info.first)})`;
        else el.textContent = '';
      };
      inp.addEventListener('input', upd); upd();
    },
    actions: [
      ...(rev ? [{ label: 'Delete', cls: 'btn-danger', onClick: async () => { if (await confirmBox(`Delete ${revLabel(info.revs, rev)} (${inr(rev.value)})?`, { ok: 'Delete', danger: true })) { store.remove('revisions', rev.id); logEvent(bidId, `Offer ${revLabel(info.revs, rev)} of ${inr(rev.value)} deleted.`); } } }, { spacer: true }] : []),
      { label: 'Cancel' },
      { label: rev ? 'Save' : 'Add offer', cls: 'btn-primary', onClick: (root) => {
        const v = money(root, 'value');
        if (!v) { markErr(root, 'value', 'Enter the offer value, e.g. 4.5 cr or 85 L.'); return false; }
        const date = val(root, 'date') || today();
        const fields = { value: v, date, reason: val(root, 'reason'), status: val(root, 'status'), remark: val(root, 'remark') };
        if (rev) { store.update('revisions', rev.id, fields); logEvent(bidId, `Offer ${revLabel(info.revs, rev)} updated to ${inr(v)}.`); }
        else {
          // older revisions that were still "under discussion" are now superseded
          store.create('revisions', { bidId, seq: info.revs.length, ...fields });
          logEvent(bidId, isFirst ? `First offer ${inr(v)} entered.` : `Revised offer R${info.revs.length}: ${inr(v)} (${signedPct((v - info.first) / info.first)} from first offer)${fields.reason ? ', ' + fields.reason.toLowerCase() : ''}.`);
        }
      } },
    ],
  });
}
export function revLabel(revs, rev) { const i = revs.findIndex((r) => r.id === rev.id); return 'R' + (i < 0 ? revs.length : i); }

// ---------------- checklist ----------------
export function setChecklist(bidId, label, state) {
  const b = store.get('bids', bidId); if (!b) return;
  const cl = { ...(b.checklist || {}) };
  if (!state) delete cl[label]; else cl[label] = { s: state, by: store.me, ts: Date.now() };
  store.update('bids', bidId, { checklist: cl });
}

// ---------------- delete / duplicate ----------------
export async function deleteBid(bidId) {
  const b = store.get('bids', bidId); if (!b) return;
  const ok = await typedConfirm({
    title: 'Delete this bid?',
    text: `<b>${esc(b.no || '')} ${esc(b.name)}</b> will be deleted with its offers, NT items and notes. The deletion is recorded in Activity with your name, and an admin can bring the bid back from there.`,
    phrase: 'DELETE BID', ok: 'Delete bid',
  });
  if (!ok) return;
  const revs = store.all('revisions').filter((r) => r.bidId === bidId);
  const notes = store.all('notes').filter((n) => n.bidId === bidId);
  const nts = store.all('nt').filter((n) => n.bidId === bidId);
  const pairs = [['bids', bidId], ...revs.map((r) => ['revisions', r.id]), ...nts.map((n) => ['nt', n.id]), ...notes.map((n) => ['notes', n.id])];
  store.removeMany(pairs);
  if (ui.bid === bidId) { ui.bid = null; rerender(); }
  toast(`${b.no || 'Bid'} deleted`, { undo: () => { for (const [c, id] of pairs) store.restore(c, id); toast('Bid restored'); } });
}

export function duplicateBid(bidId) {
  const b = store.get('bids', bidId); if (!b) return;
  const keep = ['company', 'name', 'client', 'clientId', 'contactName', 'contactRole', 'contactPhone', 'contactEmail', 'location', 'sector', 'scopes', 'tenderType', 'consultant', 'owner', 'ownerUid', 'enquiryRef', 'docLink', 'payTerms', 'advancePct', 'retentionPct', 'pbgPct', 'completionMonths', 'dlpMonths', 'emdRequired', 'emdAmount', 'emdForm'];
  const copy = Object.fromEntries(keep.filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));
  copy.name = `${b.name} (copy)`;
  copy.receivedDate = today();
  copy.no = nextBidNo(fyOf(today()), companyOf(b));
  copy.status = 'inquiry'; copy.checklist = {}; copy.statusChangedAt = Date.now();
  const nb = store.create('bids', copy);
  logEvent(nb.id, `Created as a copy of ${b.no || b.name}.`);
  toast(`${nb.no} created as a copy`);
  openBid(nb.id, 'details');
}

export function emdReturned(bidId) {
  const b = store.get('bids', bidId); if (!b) return;
  store.update('bids', bidId, { emdStatus: 'Returned', emdReturnedOn: today() });
  logEvent(bidId, `EMD${b.emdAmount ? ' of ' + inr(b.emdAmount) : ''} marked as returned.`);
  toast('EMD marked as returned');
}

export function quickNoteModal(bidId) {
  const b = store.get('bids', bidId); if (!b) return;
  modal({
    title: 'Add a note', sub: `${esc(b.no || '')} ${esc(b.name)}`,
    body: `<div class="field"><label for="qn">What happened?</label><textarea id="qn" name="note" rows="4" placeholder="e.g. Called Mr. Patil, technical evaluation done, commercial meeting on Monday"></textarea></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Add note', cls: 'btn-primary', onClick: (root) => { const t = val(root, 'note'); if (!t) return false; addNote(bidId, t); toast('Note added'); } }],
  });
}

export { icon, OPEN_KEYS, sortRevisions };
