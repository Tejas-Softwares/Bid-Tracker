// Shared UI pieces: toasts, modals, menus, tooltips, form fields, chips.
import { esc, inrShort, inr, groupIndian, dueWords, fmtDate, initials, emailIssue, phoneIssue, urlIssue, parseMoney } from './util.js';
import { STATUS } from './config.js';
import { icon } from './icons.js';

// ---------- toast ----------
export function toast(msg, opts = {}) {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; wrap.setAttribute('role', 'status'); document.body.appendChild(wrap); }
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${esc(msg)}</span>${opts.undo ? '<button type="button">Undo</button>' : ''}`;
  if (opts.undo) t.querySelector('button').onclick = () => { opts.undo(); t.remove(); };
  wrap.appendChild(t);
  setTimeout(() => t.remove(), opts.ms || (opts.undo ? 7000 : 3200));
}

// ---------- modal ----------
// Returns { el, close }. `actions` = [{ label, cls, onClick(el) -> false to keep open }]
export function modal({ title, sub = '', body = '', actions = [], wide = false, onMount, onClose, dismissable = true, beforeClose }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.style.zIndex = String(80 + document.querySelectorAll('.modal-wrap').length * 10);
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</header>
    <div class="m-body">${body}</div>
    ${actions.length ? `<footer>${actions.map((a, i) => a.spacer ? '<span class="grow"></span>' : `<button type="button" class="btn ${a.cls || ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</footer>` : ''}
  </div>`;
  const prevFocus = document.activeElement;
  let busy = false;
  const isTop = () => [...document.querySelectorAll('.modal-wrap')].at(-1) === wrap;
  const finish = () => { wrap.remove(); document.removeEventListener('keydown', onKey, true); onClose && onClose(); if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch { /* */ } };
  const tryClose = async (via) => {
    if (busy || !wrap.isConnected) return;
    if (via !== 'ok' && !isTop()) return;
    if (via !== 'ok' && beforeClose) {
      busy = true;
      let allow = true;
      try { allow = (await beforeClose(wrap)) !== false; } finally { busy = false; }
      if (!allow) return;
    }
    finish();
  };
  const onKey = (e) => {
    if (!isTop()) return;
    if (e.key === 'Escape' && dismissable) { e.stopPropagation(); tryClose('esc'); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { const p = actions.findIndex((a) => /primary|blue/.test(a.cls || '')); if (p >= 0) { e.preventDefault(); run(p); } }
  };
  const run = async (i) => {
    const a = actions[i];
    if (!a) return;
    if (!a.onClick) return tryClose('cancel');
    const r = await a.onClick(wrap);
    if (r !== false) tryClose('ok');
  };
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('footer button[data-i]');
    if (b) run(+b.dataset.i);
    else if (e.target === wrap && dismissable) tryClose('backdrop');
  });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(wrap);
  onMount && onMount(wrap);
  const first = wrap.querySelector('input:not([type=hidden]):not([readonly]), select, textarea');
  setTimeout(() => (first || wrap.querySelector('footer .btn-primary, footer .btn-blue') || wrap.querySelector('button'))?.focus(), 30);
  return { el: wrap, close: () => tryClose('ok') };
}

export function unsavedBox({ title = 'Save your changes?', text = 'You have entered details that have not been saved.', save = 'Save', discard = 'Discard' } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    modal({
      title, body: `<p style="margin:0;color:var(--ink-2)">${text}</p>`,
      actions: [
        { label: discard, onClick: () => { answered = true; resolve('discard'); } },
        { spacer: true },
        { label: 'Keep editing', onClick: () => { answered = true; resolve(false); } },
        { label: save, cls: 'btn-primary', onClick: () => { answered = true; resolve('save'); } },
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

export function confirmBox(text, { title = 'Are you sure?', ok = 'Yes', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    modal({
      title, body: `<p style="margin:0;color:var(--ink-2)">${text}</p>`,
      actions: [{ label: 'Cancel', onClick: () => { answered = true; resolve(false); } }, { label: ok, cls: danger ? 'btn-danger' : 'btn-primary', onClick: () => { answered = true; resolve(true); } }],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

// A second step for things that cannot be taken back lightly: the button only works after typing a phrase
export function typedConfirm({ title, text, phrase, ok = 'Delete' }) {
  return new Promise((resolve) => {
    let answered = false;
    modal({
      title,
      body: `<p style="margin:0 0 14px;color:var(--ink-2)">${text}</p>
        <div class="field"><label for="tc_in">To confirm, type <b class="phrase">${esc(phrase)}</b></label><input id="tc_in" name="phrase" autocomplete="off" spellcheck="false" placeholder="${esc(phrase)}"></div>`,
      actions: [
        { label: 'Cancel', onClick: () => { answered = true; resolve(false); } },
        { label: ok, cls: 'btn-danger btn-confirm', onClick: (root) => {
          if (root.querySelector('[name=phrase]').value.trim().toUpperCase() !== phrase) { root.querySelector('[name=phrase]').focus(); return false; }
          answered = true; resolve(true);
        } },
      ],
      onMount: (root) => {
        const btn = root.querySelector('.btn-confirm');
        const inp = root.querySelector('[name=phrase]');
        btn.disabled = true;
        inp.addEventListener('input', () => { btn.disabled = inp.value.trim().toUpperCase() !== phrase; });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !btn.disabled) btn.click(); });
      },
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

// ---------- popup menu ----------
export function popMenu(anchor, items) {
  document.querySelectorAll('.menu').forEach((m) => m.remove());
  const m = document.createElement('div');
  m.className = 'menu';
  m.setAttribute('role', 'menu');
  m.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : `<button type="button" role="menuitem" data-i="${i}" class="${it.on ? 'on' : ''}">${it.html || esc(it.label)}</button>`).join('');
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  const mw = m.offsetWidth, mh = m.offsetHeight;
  let left = Math.min(r.left, window.innerWidth - mw - 8);
  let top = r.bottom + 4;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
  m.style.left = Math.max(8, left) + 'px'; m.style.top = top + 'px';
  const off = (e) => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off, true); document.removeEventListener('keydown', esc_, true); } };
  const esc_ = (e) => { if (e.key === 'Escape') { e.stopPropagation(); m.remove(); document.removeEventListener('mousedown', off, true); document.removeEventListener('keydown', esc_, true); anchor.focus?.(); } };
  setTimeout(() => { document.addEventListener('mousedown', off, true); document.addEventListener('keydown', esc_, true); }, 0);
  m.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    m.remove(); document.removeEventListener('mousedown', off, true); document.removeEventListener('keydown', esc_, true);
    items[+b.dataset.i].onClick?.();
  });
  m.querySelector('button')?.focus();
  return m;
}

// ---------- hover tooltip for any element with data-tip ----------
let tipEl = null;
export function initTips() {
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t) { if (tipEl) tipEl.style.display = 'none'; return; }
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; document.body.appendChild(tipEl); }
    tipEl.innerHTML = t.dataset.tip;
    tipEl.style.display = 'block';
    place(e);
  });
  document.addEventListener('mousemove', (e) => { if (tipEl && tipEl.style.display === 'block' && e.target.closest('[data-tip]')) place(e); });
  document.addEventListener('scroll', () => { if (tipEl) tipEl.style.display = 'none'; }, true);
  function place(e) {
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - 14;
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  }
}

// ---------- small renderers ----------
export function chip(status, opts = {}) {
  const s = STATUS[status] || STATUS.inquiry;
  const attrs = opts.act ? ` data-act="${opts.act}" data-id="${esc(opts.id || '')}" role="button" tabindex="0" aria-label="Status: ${esc(s.label)}. Change status"` : '';
  return `<span class="chip st-${s.key}${opts.act ? ' btnlike' : ''}"${attrs}>${esc(opts.short ? s.short : s.label)}</span>`;
}
export function duePill(b, info) {
  if (!b.dueDate) return '<span class="muted small">No deadline</span>';
  const open = ['inquiry', 'working'].includes(b.status);
  if (!open) return `<span class="small muted nowrap">${fmtDate(b.dueDate)}</span>`;
  const n = info.daysToDue;
  const cls = n < 0 ? 'red' : n <= 2 ? 'red' : n <= 7 ? 'amber' : '';
  return `<span class="pill ${cls}">${esc(dueWords(b.dueDate))}</span>`;
}
export function avatar(name, cls = '') {
  if (!name) return `<span class="avatar none ${cls}" title="Not assigned">–</span>`;
  return `<span class="avatar ${cls}" title="${esc(name)}">${esc(initials(name))}</span>`;
}
export function money(n, opts = {}) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return opts.blank ?? '<span class="muted">—</span>';
  return `<span class="tnum" data-tip="${esc(inr(n))}">${esc(inrShort(n))}</span>`;
}
export function meter(r) {
  if (r === null || r === undefined) return '';
  const p = Math.round(r * 100);
  return `<div class="meter ${p >= 100 ? 'done' : ''}" role="img" aria-label="Checklist ${p}% done"><i style="width:${p}%"></i></div>`;
}

// ---------- form fields ----------
export function pwMarkup(inner) {
  return `<div class="pw-wrap">${inner}<button type="button" class="pw-toggle" data-show-pw aria-label="Show password" aria-pressed="false">${icon('eye')}</button></div>`;
}

export function setFieldErr(el, msg) {
  const f = el?.closest?.('.field');
  if (!f) return;
  if (msg) {
    f.classList.add('err');
    let m = f.querySelector('.err-msg');
    if (!m) { m = document.createElement('div'); m.className = 'err-msg'; m.setAttribute('role', 'alert'); f.appendChild(m); }
    m.textContent = msg;
  } else {
    f.classList.remove('err');
    f.querySelector('.err-msg')?.remove();
  }
}

function validateKind(el) {
  if (el.dataset.validate) return el.dataset.validate;
  const n = el.name || el.dataset.f || el.dataset.cf || '';
  const t = (el.getAttribute('type') || '').toLowerCase();
  if (t === 'email' || /email/i.test(n)) return 'email';
  if (t === 'tel' || /phone/i.test(n)) return 'phone';
  if (t === 'url' || n === 'docLink') return 'url';
  if (el.dataset.type === 'money') return 'money';
  if (el.dataset.type === 'int' || el.dataset.type === 'num' || el.dataset.t === 'int' || el.dataset.t === 'num' || el.dataset.t === 'pct') return 'num';
  if (n === 'password2' || n === 'next2') return 'password2';
  if ((t === 'password' || n === 'password' || n === 'next') && n !== 'code' && n !== 'current') return 'password';
  if (t === 'time') return 'time';
  return '';
}

export function inputIssue(el) {
  if (!el || el.disabled || el.readOnly) return '';
  const v = String(el.value ?? '').trim();
  const kind = validateKind(el);
  if (!kind) return '';
  if (kind === 'email') return emailIssue(v);
  if (kind === 'phone') return phoneIssue(v);
  if (kind === 'url') return urlIssue(v);
  if (kind === 'money') {
    if (!v) return '';
    const n = parseMoney(el.value);
    return (n === null || isNaN(n)) ? 'Type an amount like 4.5 cr, 85 L or 8500000' : '';
  }
  if (kind === 'num') {
    if (el.value === '' || el.value === null) return '';
    const n = Number(el.value);
    if (!isFinite(n)) return 'Enter a number';
    const min = el.min !== '' && el.min != null ? Number(el.min) : null;
    const max = el.max !== '' && el.max != null ? Number(el.max) : null;
    if (min != null && isFinite(min) && n < min) return `Enter ${min} or more`;
    if (max != null && isFinite(max) && n > max) return `Enter ${max} or less`;
    return '';
  }
  if (kind === 'password') {
    if (!v) return '';
    const min = Number(el.getAttribute('minlength')) || 8;
    if (v.length < min) return `At least ${min} characters`;
    return '';
  }
  if (kind === 'password2') {
    if (!v && !(el.form || el.closest('form, .modal, .drawer, .set-block'))?.querySelector('[name="password"], [name="next"]')?.value) return '';
    const form = el.form || el.closest('form, .modal, .drawer, .set-block');
    const matchName = el.dataset.match || (el.name === 'next2' ? 'next' : 'password');
    const other = form?.querySelector(`[name="${matchName}"]`)?.value || '';
    if (!v && !other) return '';
    if (v !== other) return 'The two passwords are not the same';
    return '';
  }
  if (kind === 'time') {
    if (!v) return '';
    if (!/^\d{2}:\d{2}$/.test(v)) return 'Enter a valid time';
    return '';
  }
  return '';
}

export function checkInput(el) {
  if (!el || !el.closest) return true;
  if (el.type === 'hidden' || el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'BUTTON') return true;
  if (!el.closest('.field')) return true;
  const msg = inputIssue(el);
  setFieldErr(el, msg);
  return !msg;
}

export function checkForm(root) {
  let first = null;
  root.querySelectorAll('input, select, textarea').forEach((el) => {
    if (!checkInput(el) && !first) first = el;
  });
  first?.focus();
  return !first;
}

export function initFormChecks() {
  document.addEventListener('focusout', (e) => {
    const el = e.target;
    if (el && el.matches?.('input, select, textarea')) checkInput(el);
  }, true);
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el || !el.matches?.('input, select, textarea')) return;
    const kind = validateKind(el);
    if (el.closest('.field.err') || kind === 'password2') checkInput(el);
    if (kind === 'password') {
      const form = el.form || el.closest('form, .modal, .set-block');
      const other = form?.querySelector('[name="password2"], [name="next2"]');
      if (other && (other.value || other.closest('.field.err'))) checkInput(other);
    }
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-show-pw]');
    if (!b) return;
    e.preventDefault();
    const inp = b.closest('.pw-wrap')?.querySelector('input');
    if (!inp) return;
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.setAttribute('aria-pressed', show ? 'true' : 'false');
    b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    b.innerHTML = icon(show ? 'eyeOff' : 'eye');
  });
}

// fld({ label, name, type, value, options, hint, cls, placeholder, req, attrs, list })
export function fld(f) {
  const id = 'f_' + (f.id || f.name || Math.random().toString(36).slice(2));
  const v = f.value ?? '';
  const data = f.data || '';
  const req = f.req ? ' <span class="req">*</span>' : '';
  const nm = f.name || '';
  let validate = f.validate || '';
  if (!validate) {
    if (f.type === 'email' || /email/i.test(nm)) validate = 'email';
    else if (f.type === 'tel' || f.type === 'phone' || /phone/i.test(nm)) validate = 'phone';
    else if (f.type === 'url' || nm === 'docLink') validate = 'url';
    else if (nm === 'password2' || nm === 'next2') validate = 'password2';
    else if (f.type === 'password' && nm !== 'code' && nm !== 'current') validate = 'password';
  }
  const match = validate === 'password2' ? ` data-match="${esc(f.match || (nm === 'next2' ? 'next' : 'password'))}"` : '';
  const vAttr = validate ? ` data-validate="${validate}"${match}` : '';
  let input = '';
  const common = `id="${id}" name="${esc(nm)}" ${data} ${f.attrs || ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}${vAttr}`;
  switch (f.type) {
    case 'textarea':
      input = `<textarea ${common} rows="${f.rows || 3}">${esc(v)}</textarea>`; break;
    case 'select': {
      const opts = (f.options || []).map((o) => typeof o === 'string' ? { v: o, l: o } : o);
      const hasV = v !== '' && !opts.some((o) => String(o.v) === String(v));
      input = `<select ${common}>${f.blank !== false ? `<option value="">${esc(f.blankLabel || 'Choose…')}</option>` : ''}${hasV ? `<option value="${esc(v)}" selected>${esc(v)}</option>` : ''}${opts.map((o) => `<option value="${esc(o.v)}"${String(o.v) === String(v) ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select>`;
      break;
    }
    case 'money': {
      const shown = v === '' || v === null ? '' : groupIndian(v);
      input = `<div class="money-wrap"><input ${common} type="text" inputmode="decimal" autocomplete="off" value="${esc(shown)}" data-type="money"></div><div class="money-preview">${v !== '' && v !== null && !isNaN(v) ? esc(inrShort(v)) : (f.moneyHint || 'Type 4.5 cr, 85 L or 8500000')}</div>`;
      break;
    }
    case 'date': input = `<input ${common} type="date" value="${esc(v)}" data-type="date">`; break;
    case 'time': input = `<input ${common} type="time" value="${esc(v)}" data-validate="time">`; break;
    case 'int': input = `<input ${common} type="number" inputmode="numeric" step="1" min="${f.min ?? 0}" value="${esc(v)}" data-type="int">`; break;
    case 'pct': input = `<input ${common} type="number" inputmode="decimal" step="0.5" min="0" max="100" value="${esc(v)}" data-type="num">`; break;
    case 'url': input = `<input ${common} type="url" value="${esc(v)}" placeholder="${esc(f.placeholder || 'Paste a OneDrive or SharePoint link')}">`; break;
    case 'email': input = `<input ${common} type="email" value="${esc(v)}" autocomplete="${esc(f.autocomplete || 'email')}">`; break;
    case 'tel':
    case 'phone': input = `<input ${common} type="tel" value="${esc(v)}" inputmode="tel">`; break;
    case 'password': {
      const min = f.minlength ? ` minlength="${f.minlength}"` : '';
      input = pwMarkup(`<input ${common} type="password"${min} value="${esc(v)}">`);
      break;
    }
    default: {
      const typ = validate === 'email' ? 'email' : validate === 'phone' ? 'tel' : 'text';
      input = `<input ${common} type="${typ}" value="${esc(v)}" ${f.list ? `list="${f.list}"` : ''} autocomplete="${esc(f.autocomplete || 'off')}">`;
    }
  }
  return `<div class="field ${f.cls || ''}"><label for="${id}">${esc(f.label)}${req}</label>${input}${f.hint ? `<div class="hint">${f.hint}</div>` : ''}</div>`;
}
export function datalist(id, values) { return `<datalist id="${id}">${values.map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>`; }

export function emptyState({ title, text, acts = '' }) {
  return `<div class="empty"><h3>${esc(title)}</h3><p>${text}</p>${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
}
export { icon };
