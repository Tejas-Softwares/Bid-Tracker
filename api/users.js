// The team: everyone sees who is on it; admins approve new accounts, change roles, turn accounts off and reset passwords.
import { db } from '../lib/db.js';
import { route, send, fail, body, originOf } from '../lib/http.js';
import { requireUser, requireAdmin, publicUser, newToken, sha, checkName } from '../lib/auth.js';
import { logActivity } from '../lib/activity.js';
import { renameOwner } from '../lib/records.js';

export default route(async (req, res) => {
  const q = await db();
  const me = await requireUser(q, req);
  if (req.method === 'GET') {
    const rows = me.role === 'admin'
      ? await q(`select * from users order by case status when 'pending' then 0 when 'active' then 1 else 2 end, name`)
      : await q(`select * from users where status = 'active' order by name`);
    return send(res, 200, { users: rows.map((u) => publicUser(u, me.role === 'admin')) });
  }
  if (req.method !== 'POST') fail(405, 'Not allowed.', 'method');
  requireAdmin(me);
  const b = body(req);
  const u = (await q(`select * from users where id = $1`, [String(b.id || '')]))[0];
  if (!u) fail(404, 'That person was not found.', 'not_found');
  const admins = async () => Number((await q(`select count(*) as n from users where role = 'admin' and status = 'active'`))[0].n);
  const log = (action, summary) => logActivity(q, req, me, [{ action, entity: 'user', entityId: u.id, summary, details: { email: u.email } }]);

  switch (b.action) {
    case 'approve':
      if (u.status !== 'pending') fail(409, 'This account is not waiting for approval.', 'state');
      await q(`update users set status = 'active', approved_by = $2 where id = $1`, [u.id, me.name]);
      await log('user.approve', `Approved ${u.name} (${u.email})`);
      break;
    case 'decline':
      if (u.status !== 'pending') fail(409, 'Only accounts waiting for approval can be declined.', 'state');
      await q(`delete from users where id = $1`, [u.id]);
      await log('user.decline', `Declined the account request from ${u.name} (${u.email})`);
      break;
    case 'disable':
      if (u.id === me.id) fail(400, 'You cannot turn off your own account.', 'self');
      if (u.role === 'admin' && (await admins()) <= 1) fail(400, 'There must be at least one admin.', 'last_admin');
      await q(`update users set status = 'disabled' where id = $1`, [u.id]);
      await q(`delete from sessions where user_id = $1`, [u.id]);
      await log('user.disable', `Turned off the account of ${u.name} (${u.email})`);
      break;
    case 'enable':
      await q(`update users set status = 'active' where id = $1`, [u.id]);
      await log('user.enable', `Turned on the account of ${u.name} (${u.email})`);
      break;
    case 'role': {
      const role = b.role === 'admin' ? 'admin' : 'member';
      if (u.role === 'admin' && role !== 'admin' && (await admins()) <= 1) fail(400, 'There must be at least one admin.', 'last_admin');
      await q(`update users set role = $2 where id = $1`, [u.id, role]);
      await log('user.role', `Made ${u.name} ${role === 'admin' ? 'an admin' : 'a member'}`);
      break;
    }
    case 'edit': {
      const name = checkName(b.name);
      const position = String(b.position || '').trim().slice(0, 80);
      await q(`update users set name = $2, position = $3 where id = $1`, [u.id, name, position]);
      if (name !== u.name) await renameOwner(q, u.id, name);
      await log('user.update', `Edited ${u.name}${name !== u.name ? ` (now ${name})` : ''}: ${position || 'no position'}`);
      break;
    }
    case 'reset': {
      const token = newToken();
      await q(`delete from resets where user_id = $1`, [u.id]);
      await q(`insert into resets (token_hash, user_id, expires_at, created_by) values ($1, $2, now() + interval '24 hours', $3)`, [sha(token), u.id, me.name]);
      await log('user.reset', `Made a password reset link for ${u.name} (${u.email})`);
      return send(res, 200, { link: `${originOf(req)}/#/reset/${token}` });
    }
    default: fail(400, 'Unknown action.', 'bad_request');
  }
  const rows = await q(`select * from users order by case status when 'pending' then 0 when 'active' then 1 else 2 end, name`);
  return send(res, 200, { users: rows.map((x) => publicUser(x, true)) });
});
