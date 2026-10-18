// Sign in, create an account, first-time setup and setting a new password from a reset link.
import { COMPANY } from '../config.js';
import { esc } from '../util.js';
import { icon, pwMarkup, checkInput } from '../ui.js';
import { BRAND } from '../brand.gen.js';
import { api } from '../server.js';

export const authState = { screen: 'signin', error: '', info: '', busy: false, resetToken: '', resetEmail: '', email: '' };

const field = (label, name, type = 'text', attrs = '') => {
  let extra = attrs;
  if (type === 'email') extra += ' data-validate="email"';
  if (name === 'password' && type === 'password') extra += ' data-validate="password"';
  if (name === 'password2') extra += ' data-validate="password2" data-match="password"';
  let input = `<input id="a_${name}" name="${name}" type="${type}" ${extra}>`;
  if (type === 'password') input = pwMarkup(input);
  return `<div class="field"><label for="a_${name}">${esc(label)}</label>${input}</div>`;
};

export function renderAuth() {
  const s = authState;
  let body = '';
  const msg = `${s.error ? `<div class="auth-msg err" role="alert">${icon('alert')}<span>${esc(s.error)}</span></div>` : ''}${s.info ? `<div class="auth-msg ok" role="status">${icon('checkCircle')}<span>${esc(s.info)}</span></div>` : ''}`;
  if (s.screen === 'setup') {
    body = `<h2>Set up the bid tracker</h2>
      <p class="lead">You are the first person here, so this account becomes the admin. Admins approve everyone else's accounts.</p>
      <form class="auth-form" data-auth="setup" novalidate>${msg}
        ${field('Setup code', 'code', 'password', 'autocomplete="off" required')}
        <div class="hint" style="margin-top:-6px">The SETUP_CODE you added in Vercel.</div>
        <div class="grid2">${field('Your name', 'name', 'text', 'autocomplete="name" required')}${field('Position', 'position', 'text', 'placeholder="e.g. Managing Director"')}</div>
        ${field('Email (this is your username)', 'email', 'email', 'autocomplete="username" required')}
        <div class="grid2">${field('Password', 'password', 'password', 'autocomplete="new-password" minlength="8" required')}${field('Type it again', 'password2', 'password', 'autocomplete="new-password" required')}</div>
        <div class="hint">At least 8 characters.</div>
        <button class="btn btn-primary btn-lg" type="submit" ${s.busy ? 'disabled' : ''}>Create admin account</button>
      </form>`;
  } else if (s.screen === 'signup') {
    body = `<h2>Create your account</h2>
      <p class="lead">An admin approves new accounts before they can sign in.</p>
      <form class="auth-form" data-auth="signup" novalidate>${msg}
        <div class="grid2">${field('Your name', 'name', 'text', 'autocomplete="name" required')}${field('Position', 'position', 'text', 'placeholder="e.g. Estimation engineer" required')}</div>
        ${field('Work email (this is your username)', 'email', 'email', 'autocomplete="username" required')}
        <div class="grid2">${field('Password', 'password', 'password', 'autocomplete="new-password" minlength="8" required')}${field('Type it again', 'password2', 'password', 'autocomplete="new-password" required')}</div>
        <div class="hint">At least 8 characters.</div>
        <button class="btn btn-primary btn-lg" type="submit" ${s.busy ? 'disabled' : ''}>Create account</button>
        <p class="auth-alt">Already have an account? <a href="#" data-auth-go="signin">Sign in</a></p>
      </form>`;
  } else if (s.screen === 'pending') {
    body = `<h2>Account created</h2>
      <p class="lead">Your account is waiting for an admin to approve it. Once it is approved, sign in with your email and password.</p>
      <div class="acts"><button class="btn btn-primary btn-lg" data-auth-go="signin">Back to sign in</button></div>`;
  } else if (s.screen === 'recover') {
    body = `<h2>Admin password recovery</h2>
      <p class="lead">For an admin who has forgotten their password. You need the SETUP_CODE that was added in Vercel when the tracker was set up. Team members should ask an admin for a reset link instead.</p>
      <form class="auth-form" data-auth="recover" novalidate>${msg}
        ${field('Setup code', 'code', 'password', 'autocomplete="off" required')}
        ${field('Admin email', 'email', 'email', `autocomplete="username" required value="${esc(s.email)}"`)}
        <div class="grid2">${field('New password', 'password', 'password', 'autocomplete="new-password" minlength="8" required')}${field('Type it again', 'password2', 'password', 'autocomplete="new-password" required')}</div>
        <button class="btn btn-primary btn-lg" type="submit" ${s.busy ? 'disabled' : ''}>Save new password</button>
        <p class="auth-alt"><a href="#" data-auth-go="signin">Back to sign in</a></p>
      </form>`;
  } else if (s.screen === 'reset') {
    body = `<h2>Set a new password</h2>
      ${s.resetEmail ? `<p class="lead">For ${esc(s.resetEmail)}.</p>` : ''}
      <form class="auth-form" data-auth="reset" novalidate>${msg}
        ${s.resetEmail ? `<div class="grid2">${field('New password', 'password', 'password', 'autocomplete="new-password" minlength="8" required')}${field('Type it again', 'password2', 'password', 'autocomplete="new-password" required')}</div>
        <div class="hint">At least 8 characters.</div>
        <button class="btn btn-primary btn-lg" type="submit" ${s.busy ? 'disabled' : ''}>Save new password</button>` : `<p>This link has expired or was already used. Ask an admin for a new one.</p>`}
        <p class="auth-alt"><a href="#" data-auth-go="signin">Back to sign in</a></p>
      </form>`;
  } else {
    body = `<h2>Sign in</h2>
      <form class="auth-form" data-auth="signin" novalidate>${msg}
        ${field('Email', 'email', 'email', `autocomplete="username" required value="${esc(s.email)}"`)}
        ${field('Password', 'password', 'password', 'autocomplete="current-password" required')}
        <label class="check"><input type="checkbox" name="remember" checked> Keep me signed in on this computer</label>
        <button class="btn btn-primary btn-lg" type="submit" ${s.busy ? 'disabled' : ''}>Sign in</button>
        <p class="auth-alt">New to the tracker? <a href="#" data-auth-go="signup">Create an account</a><br><span class="muted">Forgot your password? Ask an admin to send you a reset link. Admin locked out? <a href="#" data-auth-go="recover">Use the setup code</a>.</span></p>
      </form>`;
  }
  return `<div class="welcome auth" role="main">
    <div class="art"><div class="logo">${BRAND.logo}</div>
      <div><h1>Bid Tracker</h1><p>Every enquiry and tender in one place, from the day it arrives until the order is won.</p></div>
      <div class="addr">${esc(COMPANY.name)}<br>${esc(COMPANY.address)}</div></div>
    <div class="steps"><div class="auth-box">${body}</div></div>
  </div>`;
}

// Returns the signed-in user when the form signs someone in; otherwise null (and the screen is redrawn)
export async function submitAuth(form) {
  const s = authState;
  const v = (n) => (form.querySelector(`[name="${n}"]`)?.value || '').trim();
  const pw = form.querySelector('[name="password"]')?.value || '';
  const pw2 = form.querySelector('[name="password2"]')?.value;
  const kind = form.dataset.auth;
  s.error = ''; s.info = '';
  if (kind !== 'signin' && pw2 !== undefined && pw !== pw2) {
    const p2 = form.querySelector('[name="password2"]');
    if (p2) checkInput(p2);
    s.error = 'The two passwords are not the same.';
    return null;
  }
  if (kind !== 'signin' && pw && pw.length < 8) { s.error = 'Use at least 8 characters.'; return null; }
  const emailEl = form.querySelector('[name="email"]');
  if (emailEl && !checkInput(emailEl)) { s.error = 'Enter a complete email address.'; return null; }
  s.busy = true;
  try {
    if (kind === 'signin') {
      s.email = v('email');
      if (!v('email') || !pw) { s.error = 'Enter your email and password.'; return null; }
      const r = await api('auth', { method: 'POST', body: { action: 'login', email: v('email'), password: pw, remember: form.querySelector('[name="remember"]')?.checked } });
      return r.user;
    }
    if (kind === 'setup') {
      const r = await api('auth', { method: 'POST', body: { action: 'setup', code: v('code'), name: v('name'), position: v('position'), email: v('email'), password: pw } });
      return r.user;
    }
    if (kind === 'signup') {
      if (!v('position')) { s.error = 'Enter your position, for example Estimation engineer.'; return null; }
      await api('auth', { method: 'POST', body: { action: 'signup', name: v('name'), position: v('position'), email: v('email'), password: pw } });
      s.email = v('email');
      s.screen = 'pending';
      return null;
    }
    if (kind === 'recover') {
      const r = await api('auth', { method: 'POST', body: { action: 'recover', code: v('code'), email: v('email'), password: pw } });
      s.screen = 'signin'; s.email = r.email || ''; s.info = 'Password saved. Sign in with your new password.';
      return null;
    }
    if (kind === 'reset') {
      const r = await api('auth', { method: 'POST', body: { action: 'reset', token: s.resetToken, password: pw } });
      s.screen = 'signin'; s.email = r.email || ''; s.info = 'Password saved. Sign in with your new password.';
      history.replaceState(null, '', location.pathname);
      return null;
    }
  } catch (e) {
    s.error = e.message;
  } finally { s.busy = false; }
  return null;
}

export async function prepareReset(token) {
  authState.screen = 'reset';
  authState.resetToken = token;
  try { const r = await api('auth', { query: { action: 'reset-check', token } }); authState.resetEmail = r.ok ? r.email : ''; } catch { authState.resetEmail = ''; }
}
