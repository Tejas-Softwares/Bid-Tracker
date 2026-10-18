// NT (non-tendered) items: extra work the client asks for that was not in the tender.
// Every change to their cost creates a new offer revision, so the offer always includes them.
import { store } from './store.js';
import { derived } from './derive.js';
import { NT_STATUSES, NT_UNITS } from './config.js';
import { esc, today, parseMoney, inr, inrShort, groupIndian, plural } from './util.js';
import { modal, toast, fld, confirmBox, icon } from './ui.js';
import { wireMoney, logEvent } from './actions.js';

const counts = (n) => (n.status === 'Rejected by client' ? 0 : Number(n.amount) || 0);

// Creates offer revision R(n) = current offer + change. With no offer yet, the NT cost becomes R0.
function reviseOffer(bidId, delta, reason, remark, date, opts = {}) {
  const d = derived();
  const i = d.info.get(bidId);
  const b = store.get('bids', bidId);
  const base = i.current || 0;
  const value = Math.max(0, base + delta);
  const rev = store.create('revisions', { bidId, seq: i.revs.length, date: date || today(), value, reason, status: 'Sent to client', remark, fromNt: true });
  const label = 'R' + i.revs.length;
  if (opts.order && b.status === 'won' && b.orderValue) store.update('bids', bidId, { orderValue: Math.max(0, b.orderValue + delta) });
  logEvent(bidId, `Offer ${label} created for NT items: ${inr(base)} ${delta >= 0 ? '+' : '-'} ${inr(Math.abs(delta))} = ${inr(value)}.`);
  return { rev, label, value };
}

function preview(bidId, delta) {
  const i = derived().info.get(bidId);
  const base = i.current || 0;
  const label = 'R' + i.revs.length;
  if (!delta) return 'The offer value does not change, so no revision is created.';
  return `${i.revs.length ? `This creates offer revision <b>${label}</b>: ${esc(inrShort(base))} ${delta >= 0 ? '+' : '−'} ${esc(inrShort(Math.abs(delta)))} = <b>${esc(inrShort(Math.max(0, base + delta)))}</b>.` : `There is no offer yet, so the NT items become the first offer (R0) of <b>${esc(inrShort(delta))}</b>.`}`;
}

const row = (k) => `<tr data-row="${k}">
  <td><input class="inp" name="desc" placeholder="e.g. Extra 4 sq mm cable runs to MCC room" aria-label="Description"></td>
  <td><select class="inp" name="unit" aria-label="Unit">${NT_UNITS.map((u) => `<option>${esc(u)}</option>`).join('')}</select></td>
  <td><input class="inp num" name="qty" inputmode="decimal" placeholder="1" aria-label="Quantity"></td>
  <td><input class="inp num" name="rate" inputmode="decimal" placeholder="Rate" aria-label="Rate in rupees"></td>
  <td><input class="inp num" name="amount" inputmode="decimal" placeholder="Amount" aria-label="Amount in rupees"></td>
  <td><button type="button" class="icon-btn" data-del-row aria-label="Remove this line">${icon('x')}</button></td>
</tr>`;

function readRow(tr) {
  const g = (n) => tr.querySelector(`[name=${n}]`).value.trim();
  const qty = g('qty') === '' ? null : Number(g('qty'));
  const rate = parseMoney(g('rate'));
  let amount = parseMoney(g('amount'));
  if ((amount === null || isNaN(amount)) && qty && rate && !isNaN(rate)) amount = Math.round(qty * rate);
  return { desc: g('desc'), unit: g('unit'), qty: qty === null || isNaN(qty) ? null : qty, rate: rate === null || isNaN(rate) ? null : rate, amount: amount === null || isNaN(amount) ? null : amount };
}

export function ntAddModal(bidId) {
  const b = store.get('bids', bidId); if (!b) return;
  const won = b.status === 'won' && b.orderValue;
  modal({
    title: 'Add NT items', wide: true,
    sub: `${esc(b.no || '')} ${esc(b.name)}. Items the client asked for that were not in the tender. Their cost is added to the offer as a new revision.`,
    body: `<div class="tbl-wrap"><table class="tbl compact nt-entry"><thead><tr><th style="width:38%">Description</th><th>Unit</th><th style="width:9%">Qty</th><th style="width:15%">Rate (₹)</th><th style="width:16%">Amount (₹)</th><th></th></tr></thead><tbody>${row(0)}</tbody></table></div>
      <button type="button" class="btn btn-sm" style="margin-top:8px" data-add-row>${icon('plus')} Add another item</button>
      <div class="grid3" style="margin-top:16px">
        ${fld({ label: 'Date', name: 'date', type: 'date', value: today() })}
        ${fld({ label: 'Client reference', name: 'ref', placeholder: 'MOM, email or drawing ref.' })}
        ${fld({ label: 'Status', name: 'status', type: 'select', options: NT_STATUSES, value: 'Quoted', blank: false })}
      </div>
      ${won ? `<label class="check" style="margin-top:12px"><input type="checkbox" name="order" checked> Also add to the order value (${esc(inrShort(b.orderValue))} now)</label>` : ''}
      <div class="nt-summary" data-summary></div>`,
    onMount: (root) => {
      let k = 1;
      const tbody = root.querySelector('tbody');
      const upd = () => {
        let total = 0;
        tbody.querySelectorAll('tr').forEach((tr) => {
          const r = readRow(tr);
          const amt = tr.querySelector('[name=amount]');
          if (document.activeElement !== amt && r.qty && r.rate && !amt.value.trim()) amt.placeholder = groupIndian(Math.round(r.qty * r.rate));
          total += r.amount || 0;
        });
        const st = root.querySelector('[name=status]').value;
        const delta = st === 'Rejected by client' ? 0 : total;
        root.querySelector('[data-summary]').innerHTML = total ? `Total NT cost: <b>${esc(inr(total))}</b> (${esc(inrShort(total))}). ${preview(bidId, delta)}` : 'Enter a description and either an amount, or a quantity and rate.';
      };
      root.addEventListener('input', upd);
      root.addEventListener('change', upd);
      root.querySelector('[data-add-row]').addEventListener('click', () => { tbody.insertAdjacentHTML('beforeend', row(k++)); tbody.querySelector('tr:last-child [name=desc]').focus(); });
      tbody.addEventListener('click', (e) => { const x = e.target.closest('[data-del-row]'); if (x && tbody.children.length > 1) { x.closest('tr').remove(); upd(); } });
      upd();
    },
    actions: [{ label: 'Cancel' }, { label: 'Add NT items', cls: 'btn-primary', onClick: (root) => {
      const rows = [...root.querySelectorAll('tbody tr')].map(readRow).filter((r) => r.desc || r.amount);
      if (!rows.length) { root.querySelector('[name=desc]').focus(); return false; }
      const bad = rows.find((r) => !r.desc || !r.amount);
      if (bad) { toast(bad.desc ? `Add an amount (or quantity and rate) for "${bad.desc}"` : 'Every line needs a description'); return false; }
      const g = (n) => root.querySelector(`[name=${n}]`)?.value.trim() || '';
      const date = g('date') || today();
      const status = g('status') || 'Quoted';
      const total = rows.reduce((s, r) => s + r.amount, 0);
      let revId = null, label = '';
      if (status !== 'Rejected by client') {
        const remark = 'NT: ' + rows.map((r) => `${r.desc} (${inr(r.amount)})`).join('; ');
        const out = reviseOffer(bidId, total, rows.length === 1 ? 'NT item added' : 'NT items added', remark.slice(0, 400), date, { order: root.querySelector('[name=order]')?.checked });
        revId = out.rev.id; label = out.label;
      }
      for (const r of rows) store.create('nt', { bidId, ...r, date, ref: g('ref'), status, revId });
      toast(`${plural(rows.length, 'NT item')} added${label ? `, offer revision ${label} created` : ''}`);
    } }],
  });
}

export function ntEditModal(bidId, ntId) {
  const n = store.get('nt', ntId); const b = store.get('bids', bidId);
  if (!n || !b) return;
  const won = b.status === 'won' && b.orderValue;
  modal({
    title: 'Edit NT item', sub: `${esc(b.no || '')} ${esc(b.name)}`,
    body: `<div class="grid3">
      ${fld({ label: 'Description', name: 'desc', value: n.desc, cls: 'span-all', req: true })}
      ${fld({ label: 'Unit', name: 'unit', type: 'select', options: NT_UNITS, value: n.unit || 'Nos', blank: false })}
      ${fld({ label: 'Quantity', name: 'qty', value: n.qty ?? '' })}
      ${fld({ label: 'Rate', name: 'rate', type: 'money', value: n.rate ?? '' })}
      ${fld({ label: 'Amount', name: 'amount', type: 'money', value: n.amount ?? '', req: true })}
      ${fld({ label: 'Status', name: 'status', type: 'select', options: NT_STATUSES, value: n.status || 'Quoted', blank: false })}
      ${fld({ label: 'Date', name: 'date', type: 'date', value: n.date || '' })}
      ${fld({ label: 'Client reference', name: 'ref', value: n.ref || '', cls: 'span2' })}
      ${fld({ label: 'Remark', name: 'remark', value: n.remark || '' })}
    </div>
    ${won ? `<label class="check" style="margin-top:12px"><input type="checkbox" name="order" checked> Also change the order value by the same amount</label>` : ''}
    <div class="nt-summary" data-summary></div>`,
    onMount: (root) => {
      wireMoney(root);
      const upd = () => {
        const amount = parseMoney(root.querySelector('[name=amount]').value);
        const st = root.querySelector('[name=status]').value;
        const after = st === 'Rejected by client' ? 0 : (amount && !isNaN(amount) ? amount : 0);
        root.querySelector('[data-summary]').innerHTML = preview(bidId, after - counts(n));
      };
      root.addEventListener('input', upd); root.addEventListener('change', upd); upd();
    },
    actions: [
      { label: 'Delete', cls: 'btn-danger', onClick: async () => { await ntDelete(bidId, ntId); } }, { spacer: true },
      { label: 'Cancel' },
      { label: 'Save', cls: 'btn-primary', onClick: (root) => {
        const g = (k) => root.querySelector(`[name=${k}]`).value.trim();
        const amount = parseMoney(g('amount'));
        if (!g('desc')) { root.querySelector('[name=desc]').focus(); return false; }
        if (!amount || isNaN(amount)) { toast('Enter the amount'); return false; }
        const qty = g('qty') === '' ? null : Number(g('qty'));
        const rate = parseMoney(g('rate'));
        const next = { desc: g('desc'), unit: g('unit'), qty: isNaN(qty) ? null : qty, rate: rate === null || isNaN(rate) ? null : rate, amount, status: g('status'), date: g('date'), ref: g('ref'), remark: g('remark') };
        const delta = counts(next) - counts(n);
        let revId = n.revId;
        if (delta) {
          const reason = next.status === 'Rejected by client' && n.status !== 'Rejected by client' ? 'NT item rejected by client' : 'NT item revised';
          const out = reviseOffer(bidId, delta, reason, `NT: ${next.desc} (${inr(counts(n))} to ${inr(counts(next))})`.slice(0, 400), today(), { order: root.querySelector('[name=order]')?.checked });
          revId = out.rev.id;
          toast(`NT item saved, offer revision ${out.label} created`);
        } else toast('NT item saved');
        store.update('nt', ntId, { ...next, revId });
      } },
    ],
  });
}

export async function ntDelete(bidId, ntId) {
  const n = store.get('nt', ntId); if (!n) return;
  const c = counts(n);
  if (!(await confirmBox(`Delete the NT item "${esc(n.desc)}" (${esc(inr(n.amount))})?${c ? ` Its cost comes off the offer as a new revision.` : ''}`, { title: 'Delete NT item?', ok: 'Delete', danger: true }))) return;
  if (c) { const out = reviseOffer(bidId, -c, 'NT item removed', `NT removed: ${n.desc} (${inr(c)})`.slice(0, 400), today(), { order: true }); toast(`NT item deleted, offer revision ${out.label} created`); }
  else toast('NT item deleted');
  store.remove('nt', ntId);
}
