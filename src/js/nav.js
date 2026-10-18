// Which screen is showing, which bid is open, and the render loop.
import { prefs } from './store.js';
import { fyOf, today } from './util.js';

const now = new Date();
export const ui = {
  view: 'dashboard',
  bid: null,          // id of the bid open in the side panel
  tab: 'details',     // tab inside the bid panel
  client: null,       // id of the client open in the side panel
  dashFY: fyOf(today()),
  cal: { y: now.getFullYear(), m: now.getMonth() },
  settingsTab: 'account',
  reportTab: 'weekly',
  filters: Object.assign({ status: 'open', owner: '', sector: '', fy: '', q: '', due: '', sort: 'due', dir: 1 }, prefs.get('filters', {})),
  boardOwner: '',
  sideOpen: false,
};

let renderer = () => {};
let raf = 0;
let full = false;
export function setRenderer(fn) { renderer = fn; }
// rerender('panel') redraws only the side panel (opening or closing a bid); anything else redraws the screen
export function rerender(part) {
  if (part !== 'panel') full = true;
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; const f = full; full = false; renderer(f ? 'all' : 'panel'); });
}

const VIEWS = ['dashboard', 'bids', 'board', 'calendar', 'clients', 'reports', 'activity', 'settings', 'help'];
export function go(view, opts = {}) {
  if (!VIEWS.includes(view)) view = 'dashboard';
  ui.view = view;
  if (opts.filters) { Object.assign(ui.filters, opts.filters); saveFilters(); }
  if (opts.keepPanel !== true) { ui.bid = null; ui.client = null; }
  ui.sideOpen = false;
  writeHash();
  rerender();
  window.scrollTo(0, 0);
}
export function openBid(id, tab) { ui.tab = tab || (ui.bid === id ? ui.tab : 'details'); ui.bid = id; ui.client = null; writeHash(); rerender('panel'); }
export function closeBid() { ui.bid = null; writeHash(); rerender('panel'); }
export function openClient(id) { ui.client = id; ui.bid = null; writeHash(); rerender('panel'); }
export function closeClient() { ui.client = null; writeHash(); rerender('panel'); }
export function saveFilters() { prefs.set('filters', ui.filters); }

function writeHash() {
  let h = '#/' + ui.view;
  if (ui.bid) h += '?bid=' + encodeURIComponent(ui.bid) + '&tab=' + ui.tab;
  else if (ui.client) h += '?client=' + encodeURIComponent(ui.client);
  if (location.hash !== h) history.replaceState(null, '', h);
}
export function readHash() {
  const m = location.hash.match(/^#\/(\w+)(?:\?(.*))?$/);
  if (!m) return;
  if (VIEWS.includes(m[1])) ui.view = m[1];
  const q = new URLSearchParams(m[2] || '');
  ui.bid = q.get('bid') || null;
  if (ui.bid) ui.tab = q.get('tab') || 'details';
  ui.client = ui.bid ? null : (q.get('client') || null);
}
