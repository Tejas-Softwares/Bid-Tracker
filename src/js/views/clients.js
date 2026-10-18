// Clients: who we bid for, their contacts, and how we do with each of them.
import { store } from '../store.js';
import { derived, stats } from '../derive.js';
import { STATUS, OPEN_KEYS } from '../config.js';
import { esc, inrShort, pct, fmtDate, normName, plural, groupBy, isURL } from '../util.js';
import { icon, chip, avatar, emptyState, fld, modal, toast, confirmBox, popMenu, money, checkForm } from '../ui.js';
import { ui, openBid, closeClient, openClient } from '../nav.js';
import { teamOptions, ensureClient } from '../actions.js';

export function clientRows(d = derived()) {
  const byClient = groupBy(d.bids, (b) => b.clientId || ('n:' + normName(b.client)));
  return d.clients.map((c) => {
    const bids = [...(byClient.get(c.id) || []), ...(byClient.get('n:' + normName(c.name)) || [])];
    const s = stats(bids, d.info);
    const last = bids.map((b) => b.receivedDate).filter(Boolean).sort().pop() || '';
    const quoted = bids.reduce((t, b) => t + (d.info.get(b.id).value || 0), 0);
    return { c, bids, s, last, quoted };
  });
}

export function renderClients(view) {
  const d = derived();
  if (!d.clients.length) return emptyState({ title: 'No clients yet', text: 'Clients are added automatically when you create a bid. You can also add one here with its contacts.', acts: `<button class="btn btn-primary" data-act="new-client">${icon('plus')} Add client</button>` });
  const q = (view.clientQ || '').toLowerCase();
  const sort = view.clientSort || 'quoted';
  let rows = clientRows(d).filter((r) => !q || [r.c.name, r.c.city, r.c.sector, ...(r.c.contacts || []).map((x) => x.name)].join(' ').toLowerCase().includes(q));
  const key = { name: (r) => r.c.name.toLowerCase(), bids: (r) => -r.bids.length, quoted: (r) => -r.quoted, won: (r) => -r.s.wonValue, rate: (r) => -(r.s.winRate ?? -1), last: (r) => r.last ? -Number(r.last.replace(/-/g, '')) : 0 }[sort];
  rows.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) || a.c.name.localeCompare(b.c.name));
  const th = (k, l, cls = '') => `<th class="sortable ${cls}" data-act="client-sort" data-k="${k}">${l}${sort === k ? '<span class="arr">↓</span>' : ''}</th>`;
  return `
  <div class="toolbar">
    <input class="inp" type="search" placeholder="Find a client or contact" value="${esc(view.clientQ || '')}" data-client-q aria-label="Find a client" style="width:260px">
    <span class="grow"></span>
    <span class="count">${plural(rows.length, 'client')}</span>
    <button class="btn btn-primary btn-sm" data-act="new-client">${icon('plus')} Add client</button>
  </div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr>
    ${th('name', 'Client')}<th class="hide-sm">Sector</th><th class="hide-sm">Main contact</th>${th('bids', 'Bids', 'r')}<th class="r">Open</th>${th('won', 'Won', 'r')}${th('rate', 'Win rate', 'r')}${th('quoted', 'Total quoted', 'r')}${th('last', 'Last enquiry', 'hide-sm')}
  </tr></thead><tbody>
  ${rows.map((r) => {
    const ct = (r.c.contacts || [])[0];
    return `<tr class="click" data-act="open-client" data-id="${esc(r.c.id)}">
      <td><div class="bid-name">${esc(r.c.name)}</div><div class="bid-sub">${esc(r.c.city || '')}</div></td>
      <td class="hide-sm small">${esc(r.c.sector || '')}</td>
      <td class="hide-sm small">${ct ? `${esc(ct.name || '')}${ct.phone ? `<div class="muted">${esc(ct.phone)}</div>` : ''}` : '<span class="muted">—</span>'}</td>
      <td class="r tnum">${r.bids.length}</td>
      <td class="r tnum">${r.s.open.length || '<span class="muted">0</span>'}</td>
      <td class="r tnum">${r.s.won.length ? `${r.s.won.length} <span class="muted small">(${esc(inrShort(r.s.wonValue))})</span>` : '<span class="muted">0</span>'}</td>
      <td class="r tnum">${r.s.winRate === null ? '<span class="muted">—</span>' : pct(r.s.winRate)}</td>
      <td class="r"><span class="val">${r.quoted ? esc(inrShort(r.quoted)) : '<span class="muted">—</span>'}</span></td>
      <td class="hide-sm small nowrap">${r.last ? esc(fmtDate(r.last)) : ''}</td>
    </tr>`;
  }).join('')}
  </tbody></table></div>`;
}

export function renderClientPanel() {
  const c = store.get('clients', ui.client);
  if (!c) return '';
  const d = derived();
  const r = clientRows(d).find((x) => x.c.id === c.id) || { bids: [], s: stats([], d.info), quoted: 0 };
  const team = teamOptions();
  const contacts = c.contacts || [];
  const F = (f) => fld({ ...f, value: c[f.name] ?? '', data: `data-cf="${f.name}"` });
  const bids = r.bids.slice().sort((a, b) => (b.receivedDate || '').localeCompare(a.receivedDate || ''));
  return `
  <div class="scrim" data-act="close-client"></div>
  <aside class="drawer" role="dialog" aria-label="${esc(c.name)}">
    <div class="d-head" style="padding-bottom:16px">
      <div class="d-top"><span>Client</span><span class="grow"></span><span class="saved-flag">Saved</span>
        <button class="btn btn-sm" data-act="new-bid-for-client" data-id="${esc(c.id)}">${icon('plus')} New bid</button>
        <button class="icon-btn" data-act="client-menu" data-id="${esc(c.id)}" aria-label="More actions">${icon('more')}</button>
        <button class="icon-btn" data-act="close-client" aria-label="Close">${icon('x')}</button></div>
      <div class="d-title"><h2><input data-cf="name" value="${esc(c.name)}" aria-label="Client name"></h2></div>
      <div class="d-facts">
        <div><div class="k">Bids</div><div class="v">${r.bids.length}<small>${r.s.open.length} open</small></div></div>
        <div><div class="k">Total quoted</div><div class="v">${esc(inrShort(r.quoted, { blank: '—' }))}</div></div>
        <div><div class="k">Won</div><div class="v">${esc(inrShort(r.s.wonValue, { blank: '₹0' }))}<small>${plural(r.s.won.length, 'order')}</small></div></div>
        <div><div class="k">Win rate</div><div class="v">${r.s.winRate === null ? '—' : pct(r.s.winRate)}</div></div>
      </div>
    </div>
    <div class="d-body">
      <div class="d-sec"><h3>Details</h3><div class="grid3">
        ${F({ label: 'Sector', name: 'sector', type: 'select', options: d.settings.sectors })}
        ${F({ label: 'City', name: 'city' })}
        ${F({ label: 'Relationship owner', name: 'owner', type: 'select', options: team, blankLabel: 'Nobody yet' })}
        ${F({ label: 'Address', name: 'address', cls: 'span2' })}
        ${F({ label: 'Vendor code with this client', name: 'vendorCode' })}
        ${F({ label: 'Notes', name: 'notes', type: 'textarea', rows: 2, cls: 'span-all', placeholder: 'Payment record, approved makes, how they like offers sent…' })}
      </div></div>
      <div class="d-sec"><h3>Contacts <span class="muted">${contacts.length || ''}</span></h3>
        ${contacts.length ? `<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th><th></th></tr></thead><tbody>
        ${contacts.map((x, k) => `<tr><td><b>${esc(x.name || '')}</b></td><td>${esc(x.role || '')}</td><td class="nowrap">${x.phone ? `<a href="tel:${esc(x.phone.replace(/\s+/g, ''))}">${esc(x.phone)}</a>` : ''}</td><td>${x.email ? `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : ''}</td><td class="nowrap"><button class="icon-btn" data-act="edit-contact" data-k="${k}" aria-label="Edit contact">${icon('edit')}</button></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted" style="margin-top:0">No contacts yet.</p>'}
        <button class="btn btn-sm" style="margin-top:10px" data-act="edit-contact" data-k="-1">${icon('plus')} Add contact</button>
      </div>
      <div class="d-sec"><h3>Bids <span class="muted">${bids.length || ''}</span></h3>
        ${bids.length ? `<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>No.</th><th>Bid</th><th>Received</th><th class="r">Value</th><th>Status</th></tr></thead><tbody>
        ${bids.map((b) => `<tr class="click" data-act="open-bid" data-id="${esc(b.id)}"><td class="no">${esc(b.no || '')}</td><td><b>${esc(b.name)}</b></td><td class="nowrap small">${esc(fmtDate(b.receivedDate))}</td><td class="r">${money(d.info.get(b.id).value)}</td><td>${chip(b.status)}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">No bids for this client yet.</p>'}
      </div>
    </div>
  </aside>`;
}

export function saveClientField(el) {
  const c = store.get('clients', ui.client); if (!c) return;
  const f = el.dataset.cf;
  const v = el.value.trim();
  if (f === 'name') {
    if (!v) { el.value = c.name; toast('A client needs a name'); return; }
    const other = store.all('clients').find((x) => x.id !== c.id && normName(x.name) === normName(v));
    if (other) { el.value = c.name; toast(`${other.name} already exists. Use "Merge into another client" instead.`); return; }
    store.update('clients', c.id, { name: v });
    for (const b of store.all('bids')) if (b.clientId === c.id || (!b.clientId && normName(b.client) === normName(c.name))) store.update('bids', b.id, { client: v, clientId: c.id });
  } else {
    if ((c[f] ?? '') === v) return;
    store.update('clients', c.id, { [f]: v });
  }
  const flag = document.querySelector('.drawer .saved-flag');
  if (flag) { flag.classList.add('on'); setTimeout(() => flag.classList.remove('on'), 1300); }
}

export function contactModal(k) {
  const c = store.get('clients', ui.client); if (!c) return;
  const list = [...(c.contacts || [])];
  const x = k >= 0 ? list[k] : {};
  modal({
    title: k >= 0 ? 'Edit contact' : 'Add contact', sub: esc(c.name),
    body: `<div class="grid2">${fld({ label: 'Name', name: 'name', value: x.name || '', req: true })}${fld({ label: 'Role', name: 'role', value: x.role || '', placeholder: 'e.g. Purchase manager' })}${fld({ label: 'Phone', name: 'phone', value: x.phone || '' })}${fld({ label: 'Email', name: 'email', value: x.email || '' })}</div>`,
    actions: [
      ...(k >= 0 ? [{ label: 'Remove', cls: 'btn-danger', onClick: () => { list.splice(k, 1); store.update('clients', c.id, { contacts: list }); toast('Contact removed'); } }, { spacer: true }] : []),
      { label: 'Cancel' },
      { label: 'Save contact', cls: 'btn-primary', onClick: (root) => {
        const g = (n) => root.querySelector(`[name=${n}]`).value.trim();
        if (!g('name')) { root.querySelector('[name=name]').focus(); return false; }
        if (!checkForm(root)) return false;
        const item = { name: g('name'), role: g('role'), phone: g('phone'), email: g('email') };
        if (k >= 0) list[k] = item; else list.push(item);
        store.update('clients', c.id, { contacts: list });
      } },
    ],
  });
}

export function newClientModal() {
  const d = derived();
  modal({
    title: 'Add client',
    body: `<div class="grid2">${fld({ label: 'Client name', name: 'name', req: true, cls: 'span-all' })}${fld({ label: 'Sector', name: 'sector', type: 'select', options: d.settings.sectors })}${fld({ label: 'City', name: 'city' })}</div>`,
    actions: [{ label: 'Cancel' }, { label: 'Add client', cls: 'btn-primary', onClick: (root) => {
      const name = root.querySelector('[name=name]').value.trim();
      if (!name) { root.querySelector('[name=name]').focus(); return false; }
      const exists = store.all('clients').find((x) => normName(x.name) === normName(name));
      if (exists) { toast(`${exists.name} is already in the list`); openClient(exists.id); return true; }
      const c = store.create('clients', { name, sector: root.querySelector('[name=sector]').value, city: root.querySelector('[name=city]').value.trim(), contacts: [] });
      openClient(c.id);
    } }],
  });
}

export function clientMenu(anchor) {
  const c = store.get('clients', ui.client); if (!c) return;
  const d = derived();
  const r = clientRows(d).find((x) => x.c.id === c.id);
  popMenu(anchor, [
    { html: `${icon('users')} Merge into another client`, onClick: () => mergeModal(c) },
    '-',
    { html: `<span style="color:var(--red);display:flex;gap:9px;align-items:center">${icon('trash')} Delete client</span>`, onClick: async () => {
      if (r && r.bids.length) { toast(`${c.name} has ${plural(r.bids.length, 'bid')}. Merge it into another client instead.`); return; }
      if (await confirmBox(`Delete ${esc(c.name)}?`, { ok: 'Delete', danger: true })) { store.remove('clients', c.id); closeClient(); toast('Client deleted', { undo: () => store.restore('clients', c.id) }); }
    } },
  ]);
}

function mergeModal(c) {
  const others = store.all('clients').filter((x) => x.id !== c.id).sort((a, b) => a.name.localeCompare(b.name));
  modal({
    title: `Merge ${c.name}`, sub: 'Use this when the same client was entered under two names. Its bids and contacts move to the client you pick, and this name is removed.',
    body: fld({ label: 'Merge into', name: 'target', type: 'select', options: others.map((o) => ({ v: o.id, l: o.name })) }),
    actions: [{ label: 'Cancel' }, { label: 'Merge', cls: 'btn-primary', onClick: (root) => {
      const t = store.get('clients', root.querySelector('[name=target]').value);
      if (!t) return false;
      for (const b of store.all('bids')) if (b.clientId === c.id || normName(b.client) === normName(c.name)) store.update('bids', b.id, { client: t.name, clientId: t.id });
      store.update('clients', t.id, { contacts: [...(t.contacts || []), ...(c.contacts || [])], notes: [t.notes, c.notes].filter(Boolean).join('\n') });
      store.remove('clients', c.id);
      toast(`Merged into ${t.name}`);
      openClient(t.id);
    } }],
  });
}
export { isURL };
