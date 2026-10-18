// Board: drag a card to move a bid to the next stage.
import { derived } from '../derive.js';
import { companySelect, companyEmpty } from './common.js';
import { STATUS, PIPELINE_KEYS, PRE_SUBMIT } from '../config.js';
import { esc, inrShort, plural, fyLabel } from '../util.js';
import { icon, chip, duePill, avatar, meter, emptyState } from '../ui.js';
import { setStatus, teamOptions } from '../actions.js';
import { go } from '../nav.js';

export function renderBoard(ui) {
  const d = derived();
  if (companyEmpty(d)) return companyEmpty(d);
  if (!d.bids.length) return emptyState({ title: 'No bids yet', text: 'Bids appear here as cards, one column per stage. Drag a card to move it along.', acts: `<button class="btn btn-primary" data-act="new-bid">${icon('plus')} New bid</button>` });
  const team = teamOptions();
  const own = ui.boardOwner;
  const bids = d.bids.filter((b) => !own || (own === '__none' ? !b.owner : b.owner === own));
  const cols = PIPELINE_KEYS.map((k) => {
    const list = bids.filter((b) => b.status === k).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    const v = list.reduce((s, b) => s + (d.info.get(b.id).value || 0), 0);
    return `<div class="col" style="--c:var(--s-${k})" data-drop="${k}">
      <header><h3>${esc(STATUS[k].short)}</h3><span class="n">${list.length}</span><span class="v">${v ? esc(inrShort(v)) : ''}</span></header>
      <div class="cards">${list.map((b) => card(b, d)).join('') || '<p class="small muted" style="padding:6px 4px;margin:0">Nothing here.</p>'}</div>
    </div>`;
  }).join('');
  const closed = ['won', 'lost', 'regret', 'dropped'].map((k) => {
    const n = bids.filter((b) => b.status === k).length;
    return `<button data-drop="${k}" data-act="go" data-view="bids" data-filter-status="${k}" style="--c:var(--s-${k})">${chip(k)}<span class="small muted hide-sm">Drop a card here</span><span class="n">${n}</span></button>`;
  }).join('');
  return `
  <div class="toolbar">
    ${companySelect()}
    <div class="seg" role="group" aria-label="Show bids of">
      <button class="${!own ? 'on' : ''}" data-act="board-owner" data-v="">Everyone</button>
      ${team.map((t) => `<button class="${own === t ? 'on' : ''}" data-act="board-owner" data-v="${esc(t)}">${esc(t)}</button>`).join('')}
    </div>
    <span class="grow"></span>
    <span class="count small muted">Drag cards between columns, or click a card to open it.</span>
  </div>
  <div class="board">${cols}</div>
  <div class="closed-strip">${closed}</div>`;
}

function card(b, d) {
  const i = d.info.get(b.id);
  return `<div class="card" draggable="true" data-card="${esc(b.id)}" data-act="open-bid" data-id="${esc(b.id)}" tabindex="0" role="button" aria-label="${esc(b.name)}, ${esc(b.client || '')}">
    <div class="n">${esc(b.name)}</div>
    <div class="c">${esc(b.client || '')}</div>
    <div class="row">${avatar(b.owner, 'sm')}<span class="val">${i.value ? esc(inrShort(i.value)) : '<span class="muted small">No value</span>'}</span><span class="grow"></span>${PRE_SUBMIT.includes(b.status) ? duePill(b, i) : b.submittedDate ? `<span class="small muted">${i.daysSinceActivity !== null && i.daysSinceActivity > 0 ? plural(i.daysSinceActivity, 'day') + ' quiet' : 'Active today'}</span>` : ''}</div>
    ${PRE_SUBMIT.includes(b.status) && i.applicable ? `<div class="row" style="margin-top:7px">${meter(i.readiness)}<span class="small muted tnum">${i.done}/${i.applicable}</span></div>` : ''}
  </div>`;
}

export function mountBoard(root) {
  if (root._dnd) return;
  root._dnd = true;
  let dragId = null;
  root.addEventListener('dragstart', (e) => {
    const c = e.target.closest('[data-card]'); if (!c) return;
    dragId = c.dataset.card; c.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragId); } catch { /* */ }
  });
  root.addEventListener('dragend', (e) => { e.target.closest('[data-card]')?.classList.remove('dragging'); root.querySelectorAll('.drop').forEach((x) => x.classList.remove('drop')); dragId = null; });
  root.addEventListener('dragover', (e) => {
    const z = e.target.closest('[data-drop]'); if (!z || !dragId) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    root.querySelectorAll('.drop').forEach((x) => { if (x !== z) x.classList.remove('drop'); });
    z.classList.add('drop');
  });
  root.addEventListener('dragleave', (e) => { const z = e.target.closest('[data-drop]'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('drop'); });
  root.addEventListener('drop', (e) => {
    const z = e.target.closest('[data-drop]'); if (!z || !dragId) return;
    e.preventDefault(); z.classList.remove('drop');
    setStatus(dragId, z.dataset.drop);
    dragId = null;
  });
}
export { go };
