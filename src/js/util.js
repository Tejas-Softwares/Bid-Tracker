// Small helpers shared by every part of the app: ids, dates, Indian money, HTML escaping.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function uid(prefix = '') {
  const a = new Uint8Array(10);
  (globalThis.crypto || window.crypto).getRandomValues(a);
  return prefix + Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => (s === null || s === undefined ? '' : String(s).replace(/[&<>"']/g, (c) => ESC[c]));

export function debounce(fn, ms) {
  let t;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  d.flush = (...args) => { clearTimeout(t); fn(...args); };
  return d;
}

export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
export function groupBy(arr, f) {
  const m = new Map();
  for (const x of arr) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}
export const uniq = (arr) => Array.from(new Set(arr.filter((x) => x !== '' && x !== null && x !== undefined)));
export function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'user'; }
export function initials(name) {
  const p = String(name || '?').trim().split(/\s+/);
  return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// ---------- Dates (stored as YYYY-MM-DD strings, in local time) ----------
const pad = (n) => String(n).padStart(2, '0');
export function isoDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function today() { return isoDate(new Date()); }
export function parseISO(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}
export function addDays(s, n) { const d = parseISO(s); if (!d) return ''; d.setDate(d.getDate() + n); return isoDate(d); }
export function daysBetween(a, b) {
  const da = parseISO(a), db = parseISO(b);
  if (!da || !db) return null;
  return Math.round((db - da) / 86400000);
}
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function fmtDate(s, opts = {}) {
  const d = parseISO(s);
  if (!d) return '';
  if (opts.short) return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (opts.day) return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function fmtDateTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  let h = d.getHours(); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h}:${pad(d.getMinutes())} ${ap}`;
}
export function fmtTime(t) {
  if (!t) return '';
  const [hh, mm] = t.split(':').map(Number);
  const ap = hh >= 12 ? 'pm' : 'am';
  return `${hh % 12 || 12}:${pad(mm || 0)} ${ap}`;
}
export function timeAgo(ms) {
  if (!ms) return 'never';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr${h > 1 ? 's' : ''} ago`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d} day${d > 1 ? 's' : ''} ago`;
  return fmtDate(isoDate(new Date(ms)));
}
// Relative wording for a due date: "Today", "Tomorrow", "In 5 days", "3 days late"
export function dueWords(dueDate, ref = today()) {
  const n = daysBetween(ref, dueDate);
  if (n === null) return '';
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return '1 day late';
  if (n < 0) return `${-n} days late`;
  return `In ${n} days`;
}
// Indian financial year: April to March. fyOf('2026-10-15') === 2026 (FY 2026-27)
export function fyOf(s) { const d = parseISO(s); if (!d) return null; return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; }
export function fyLabel(y) { return `FY ${y}-${String(y + 1).slice(2)}`; }
export function fyShort(y) { return `${String(y).slice(2)}-${String(y + 1).slice(2)}`; }
export function fyRange(y) { return [`${y}-04-01`, `${y + 1}-03-31`]; }
export function inFY(s, y) { return !!s && fyOf(s) === y; }
export function startOfWeek(s) { const d = parseISO(s); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return isoDate(d); }

// ---------- Money (whole rupees) ----------
// Accepts "4.5 cr", "87.5L", "87.5 lakh", "45,00,000", "₹ 4,50,000", "450k", "4500000"
export function parseMoney(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return isFinite(input) ? Math.round(input) : null;
  let s = String(input).trim().toLowerCase().replace(/₹|rs\.?|inr|\/-|,|\s+/g, ' ').replace(/\s+/g, '');
  if (!s) return null;
  const m = s.match(/^(-?\d*\.?\d+)(cr|crs|crore|crores|l|lac|lacs|lakh|lakhs|k|thousand)?$/);
  if (!m) return NaN;
  let n = parseFloat(m[1]);
  const u = m[2] || '';
  if (/^cr/.test(u)) n *= 1e7;
  else if (/^(l|lac|lakh)/.test(u)) n *= 1e5;
  else if (/^(k|thousand)/.test(u)) n *= 1e3;
  return Math.round(n);
}
export function groupIndian(n) {
  const neg = n < 0; n = Math.abs(Math.round(n));
  const s = String(n);
  if (s.length <= 3) return (neg ? '-' : '') + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (neg ? '-' : '') + rest + ',' + last3;
}
export function inr(n) { if (n === null || n === undefined || n === '' || isNaN(n)) return ''; return '₹' + groupIndian(n); }
// Compact: ₹4.32 Cr, ₹87.5 L, ₹45,000
export function inrShort(n, opts = {}) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return opts.blank ?? '—';
  const a = Math.abs(n), sign = n < 0 ? '-' : '';
  const trim = (x, dp) => { let t = x.toFixed(dp); if (t.includes('.')) t = t.replace(/0+$/, '').replace(/\.$/, ''); return t; };
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7, a >= 1e9 ? 0 : 2)} Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5, a >= 1e6 ? 1 : 2)} L`;
  return sign + '₹' + groupIndian(a);
}
export function pct(n, dp = 0) { if (n === null || n === undefined || isNaN(n)) return '—'; return `${(n * 100).toFixed(dp)}%`; }
export function signedPct(n, dp = 1) { if (n === null || n === undefined || isNaN(n)) return '—'; const v = (n * 100).toFixed(dp); return (n > 0 ? '+' : '') + v + '%'; }
export function plural(n, one, many) { return `${n} ${n === 1 ? one : (many || one + 's')}`; }

export function download(filename, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}
export function pickFile(accept) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept; inp.style.display = 'none';
    inp.onchange = () => { resolve(inp.files[0] || null); inp.remove(); };
    document.body.appendChild(inp); inp.click();
  });
}
export function isURL(s) { return /^https?:\/\/\S+$/i.test(String(s || '').trim()); }
export function normName(s) { return String(s || '').toLowerCase().replace(/&/g, 'and').replace(/\b(pvt|private|ltd|limited|llp|inc|co|company|india)\b/g, '').replace(/[^a-z0-9]+/g, ''); }
// Similarity of two short strings (Dice coefficient on bigrams), used to warn about duplicate bids
export function similarity(a, b) {
  a = String(a || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  b = String(b || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (s) => { const g = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); g.set(k, (g.get(k) || 0) + 1); } return g; };
  const ga = grams(a), gb = grams(b);
  let inter = 0;
  for (const [k, v] of ga) inter += Math.min(v, gb.get(k) || 0);
  return (2 * inter) / (a.length - 1 + b.length - 1);
}
