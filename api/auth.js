// Sign in, sign out, first-time setup, create account, password changes.
import { db } from '../lib/db.js';
import { route, send, fail, body, query, clientIp } from '../lib/http.js';
import { hashPassword, verifyPassword, dummyVerify, createSession, endSession, currentUser, requireUser, publicUser, normEmail, checkEmail, checkPassword, checkName, newId, sha, tooManyAttempts, recordAttempt } from '../lib/auth.js';
import { logActivity } from '../lib/activity.js';
import { renameOwner } from '../lib/records.js';

export default route(async (req, res) => {
  const q = await db();
  const action = query(req).action || body(req).action;

  if (req.method === 'GET') {
    if (action === 'reset-check') {
      const t = String(query(req).token || '');
      const r = (await q(`select u.email from resets x join users u on u.id = x.user_id where x.token_hash = $1 and not x.used and x.expires_at > now()`, [sha(t)]))[0];
      return send(res, 200, { ok: !!r, email: r ? r.email : '' });
    }
    const count = Number((await q(`select count(*) as n from users`))[0].n);
    const user = await currentUser(q, req);
    return send(res, 200, { needsSetup: count === 0, user: publicUser(user) });
  }
  if (req.method !== 'POST') fail(405, 'Not allowed.', 'method');
  const b = body(req);

  if (action === 'setup') {
    const count = Number((await q(`select count(*) as n from users`))[0].n);
    if (count > 0) fail(409, 'The tracker is already set up. Sign in instead.', 'already_setup');
    const code = process.env.SETUP_CODE;
    if (!code) fail(400, 'Add a SETUP_CODE environment variable in Vercel first (see the setup guide), then redeploy.', 'no_setup_code');
    if (String(b.code || '').trim() !== code) fail(403, 'That setup code is not right.', 'bad_code');
    const email = normEmail(b.email); checkEmail(email); checkPassword(b.password, email);
    const name = checkName(b.name);
    const user = { id: newId('u'), email, name, position: String(b.position || '').trim().slice(0, 80), role: 'admin', status: 'active' };
    await q(`insert into users (id, email, name, position, pass, role, status, approved_by, pass_changed_at) values ($1, $2, $3, $4, $5, 'admin', 'active', 'setup', now())`, [user.id, email, name, user.position, await hashPassword(b.password)]);
    await createSession(q, req, res, user, true);
    await q(`update users set last_login = now() where id = $1`, [user.id]);
    await logActivity(q, req, user, [{ action: 'user.setup', summary: `Set up the tracker and became the first admin` }]);
    return send(res, 200, { user: publicUser(user) });
  }

  if (action === 'signup') {
    const email = normEmail(b.email); checkEmail(email); checkPassword(b.password, email);
    const name = checkName(b.name);
    const position = String(b.position || '').trim().slice(0, 80);
    const exists = (await q(`select 1 from users where email = $1`, [email]))[0];
    if (exists) fail(409, 'An account with this email already exists. Sign in, or ask an admin to reset your password.', 'exists');
    const id = newId('u');
    await q(`insert into users (id, email, name, position, pass, role, status, pass_changed_at) values ($1, $2, $3, $4, $5, 'member', 'pending', now())`, [id, email, name, position, await hashPassword(b.password)]);
    await logActivity(q, req, { id, name, email }, [{ action: 'user.signup', summary: `Created an account (${position || 'no position given'}), waiting for approval` }]);
    return send(res, 200, { pending: true });
  }

  if (action === 'login') {
    const email = normEmail(b.email);
    const ip = clientIp(req);
    if (await tooManyAttempts(q, email, ip)) fail(429, 'Too many wrong attempts. Wait 15 minutes, or ask an admin to reset your password.', 'locked');
    const u = (await q(`select * from users where email = $1`, [email]))[0];
    const ok = u ? await verifyPassword(String(b.password || ''), u.pass) : (await dummyVerify(String(b.password || '')), false);
    await recordAttempt(q, email, ip, ok);
    if (!ok) {
      await logActivity(q, req, { id: u ? u.id : null, name: u ? u.name : '', email }, [{ action: 'auth.failed', summary: 'Wrong email or password' }]);
      fail(401, 'The email or password is not right.', 'bad_login');
    }
    if (u.status === 'pending') fail(403, 'Your account is waiting for an admin to approve it. Ask your admin, then try again.', 'pending');
    if (u.status !== 'active') fail(403, 'This account has been turned off. Ask an admin if you need access.', 'disabled');
    await createSession(q, req, res, u, !!b.remember);
    await q(`update users set last_login = now() where id = $1`, [u.id]);
    await logActivity(q, req, u, [{ action: 'auth.signin', summary: 'Signed in' }]);
    return send(res, 200, { user: publicUser(u) });
  }

  if (action === 'logout') {
    const u = await currentUser(q, req);
    await endSession(q, req, res);
    if (u) await logActivity(q, req, u, [{ action: 'auth.signout', summary: 'Signed out' }]);
    return send(res, 200, { ok: true });
  }

  if (action === 'password') {
    const u = await requireUser(q, req);
    if (!(await verifyPassword(String(b.current || ''), u.pass))) fail(400, 'Your current password is not right.', 'bad_password');
    checkPassword(b.next, u.email);
    await q(`update users set pass = $2, pass_changed_at = now() where id = $1`, [u.id, await hashPassword(b.next)]);
    await logActivity(q, req, u, [{ action: 'auth.password', summary: 'Changed their password' }]);
    return send(res, 200, { ok: true });
  }

  if (action === 'profile') {
    const u = await requireUser(q, req);
    const name = checkName(b.name);
    const position = String(b.position || '').trim().slice(0, 80);
    await q(`update users set name = $2, position = $3 where id = $1`, [u.id, name, position]);
    if (name !== u.name) await renameOwner(q, u.id, name);
    await logActivity(q, req, { ...u, name }, [{ action: 'user.update', summary: `Updated their profile${name !== u.name ? ` (name was ${u.name})` : ''}` }]);
    return send(res, 200, { user: publicUser({ ...u, name, position }) });
  }

  if (action === 'reset') {
    const t = String(b.token || '');
    const r = (await q(`select x.user_id, u.* from resets x join users u on u.id = x.user_id where x.token_hash = $1 and not x.used and x.expires_at > now()`, [sha(t)]))[0];
    if (!r) fail(400, 'This link has expired or was already used. Ask an admin for a new one.', 'bad_token');
    checkPassword(b.password, r.email);
    await q(`update users set pass = $2, pass_changed_at = now() where id = $1`, [r.user_id, await hashPassword(b.password)]);
    await q(`update resets set used = true where token_hash = $1`, [sha(t)]);
    await q(`delete from sessions where user_id = $1`, [r.user_id]);
    await logActivity(q, req, { id: r.user_id, name: r.name, email: r.email }, [{ action: 'auth.reset', summary: 'Set a new password from a reset link' }]);
    return send(res, 200, { ok: true, email: r.email });
  }

  // An admin who forgot their password (and has no other admin to send a reset link) uses the setup code
  if (action === 'recover') {
    const email = normEmail(b.email);
    const ip = clientIp(req);
    if (await tooManyAttempts(q, email, ip)) fail(429, 'Too many wrong attempts. Wait 15 minutes and try again.', 'locked');
    const code = process.env.SETUP_CODE;
    const u = (await q(`select * from users where email = $1`, [email]))[0];
    const ok = !!code && String(b.code || '').trim() === code && u && u.role === 'admin' && u.status === 'active';
    if (!ok) {
      await recordAttempt(q, email, ip, false);
      fail(403, 'The setup code or admin email is not right. This works only for an admin account.', 'bad_recover');
    }
    checkPassword(b.password, email);
    await q(`update users set pass = $2, pass_changed_at = now() where id = $1`, [u.id, await hashPassword(b.password)]);
    await q(`delete from sessions where user_id = $1`, [u.id]);
    await logActivity(q, req, u, [{ action: 'auth.reset', summary: 'Set a new admin password using the setup code' }]);
    return send(res, 200, { ok: true, email });
  }

  fail(400, 'Unknown action.', 'bad_request');
});
