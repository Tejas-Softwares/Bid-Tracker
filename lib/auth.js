// Accounts and sessions. Passwords are stored as scrypt hashes; a session is a random token in an
// HttpOnly cookie, kept in the database only as its SHA-256 hash.
import crypto from 'node:crypto';
import { cookies, isSecure, fail, clientIp } from './http.js';

const COOKIE = 'tbt_session';
const LONG = 30 * 86400; // "Keep me signed in": 30 days
const SHORT = 12 * 3600; // otherwise 12 hours
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scrypt(pw, salt, opts = SCRYPT) {
  return new Promise((resolve, reject) => crypto.scrypt(pw, salt, opts.keylen, { N: opts.N, r: opts.r, p: opts.p, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? reject(e) : resolve(k))));
}
export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function verifyPassword(pw, stored) {
  try {
    const [kind, N, r, p, salt, key] = String(stored).split('$');
    if (kind !== 'scrypt') return false;
    const want = Buffer.from(key, 'base64');
    const got = await scrypt(pw, Buffer.from(salt, 'base64'), { N: +N, r: +r, p: +p, keylen: want.length });
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  } catch { return false; }
}
// A hash to compare against when the email is unknown, so timing does not reveal which emails exist
let dummy = null;
export async function dummyVerify(pw) { if (!dummy) dummy = await hashPassword('not-a-real-password'); await verifyPassword(pw, dummy); }

export const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const newId = (p) => p + crypto.randomBytes(9).toString('base64url').replace(/[-_]/g, '').slice(0, 12);

export function normEmail(e) { return String(e || '').trim().toLowerCase(); }
export function checkEmail(e) { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200) fail(400, 'Enter a valid email address.', 'email'); }
export function checkPassword(pw, email) {
  pw = String(pw || '');
  if (pw.length < 8) fail(400, 'Use at least 8 characters for the password.', 'password');
  if (pw.length > 200) fail(400, 'That password is too long.', 'password');
  if (email && pw.toLowerCase() === String(email).toLowerCase()) fail(400, 'The password cannot be your email address.', 'password');
}
export function checkName(n) { n = String(n || '').trim(); if (!n) fail(400, 'Enter your name.', 'name'); if (n.length > 80) fail(400, 'That name is too long.', 'name'); return n; }

function setCookie(res, req, value, maxAge) {
  const parts = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (isSecure(req)) parts.push('Secure');
  if (maxAge !== null) parts.push(`Max-Age=${maxAge}`);
  res.setHeader('Set-Cookie', parts.join('; '));
}

export async function createSession(q, req, res, user, remember) {
  const token = newToken();
  const life = remember ? LONG : SHORT;
  await q(`insert into sessions (token_hash, user_id, expires_at, ip, ua) values ($1, $2, now() + ($3 || ' seconds')::interval, $4, $5)`,
    [sha(token), user.id, String(life), clientIp(req), String(req.headers['user-agent'] || '').slice(0, 200)]);
  setCookie(res, req, token, remember ? life : null);
}

export async function endSession(q, req, res) {
  const t = cookies(req)[COOKIE];
  if (t) await q(`delete from sessions where token_hash = $1`, [sha(t)]);
  setCookie(res, req, '', 0);
}

export async function currentUser(q, req) {
  const t = cookies(req)[COOKIE];
  if (!t) return null;
  const rows = await q(`select u.* from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()`, [sha(t)]);
  const u = rows[0];
  if (!u || u.status !== 'active') return null;
  return u;
}

export async function requireUser(q, req) {
  const u = await currentUser(q, req);
  if (!u) fail(401, 'Your session has ended. Sign in again.', 'auth');
  return u;
}
export function requireAdmin(u) { if (u.role !== 'admin') fail(403, 'Only an admin can do this.', 'admin'); }

const ms = (d) => (d ? new Date(d).getTime() : null);
export function publicUser(u, full = false) {
  if (!u) return null;
  const p = { id: u.id, name: u.name, email: u.email, position: u.position || '', role: u.role, status: u.status };
  if (full) Object.assign(p, { createdAt: ms(u.created_at), lastLogin: ms(u.last_login), approvedBy: u.approved_by || '' });
  return p;
}

// Too many wrong passwords: 5 for one email or 30 from one address in 15 minutes
export async function tooManyAttempts(q, email, ip) {
  const r = await q(`select
      count(*) filter (where email = $1 and not ok) as by_email,
      count(*) filter (where ip = $2 and not ok) as by_ip
    from login_attempts where at > now() - interval '15 minutes'`, [email, ip]);
  return Number(r[0].by_email) >= 5 || Number(r[0].by_ip) >= 30;
}
export async function recordAttempt(q, email, ip, ok) {
  await q(`insert into login_attempts (email, ip, ok) values ($1, $2, $3)`, [email, ip, ok]);
}
