// Pieces shared by several screens.
import { store } from '../store.js';
import { view } from '../derive.js';
import { esc } from '../util.js';

// Which company's bids to show. The choice applies to every screen and is remembered on this computer.
export function companySelect() {
  const cos = store.settings().companies;
  return `<select class="inp co-select" data-co aria-label="Company" title="${esc((cos.find((c) => c.key === view.company) || {}).name || 'Both companies')}">
    <option value="">Both companies</option>
    ${cos.map((c) => `<option value="${esc(c.key)}" title="${esc(c.name)}" ${view.company === c.key ? 'selected' : ''}>${esc(c.short || c.name)} only</option>`).join('')}
  </select>`;
}

// Shown when bids exist but none belong to the company picked in the company filter
export function companyEmpty(d, withSelect = true) {
  if (!view.company || !d.allBids.length || d.bids.length) return '';
  const name = (store.settings().companies.find((c) => c.key === view.company) || {}).name || 'this company';
  return `${withSelect ? `<div class="toolbar">${companySelect()}</div>` : ''}
  <div class="empty"><h3>No bids for ${esc(name)}</h3><p>Pick "Both companies" to see every bid, or add a new bid for this company.</p>
  <div class="acts"><button class="btn" data-act="company-all">Show both companies</button><button class="btn btn-primary" data-act="new-bid">New bid</button></div></div>`;
}
