// End-to-end checks of the hosted tracker: starts the local server (in-memory database), then drives two
// people in two separate browsers. Run with: npm test   (needs Playwright with Chromium installed)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const p of ['playwright', ...(process.env.NODE_PATH || '').split(':').filter(Boolean).map((d) => path.join(d, 'playwright')), '/usr/local/lib/node_modules_global/playwright']) {
    try { return require(p); } catch { /* next */ }
  }
  throw new Error('Playwright not found. npm i -D playwright');
}
const { chromium } = loadPlaywright();
const PORT = 4300 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}`;
const SHOTS = path.join(root, 'tests', 'screens');
fs.mkdirSync(SHOTS, { recursive: true });
const XLSX = process.env.XLSX || '/home/claude/src_data/bid_tracker.xlsx';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ok  ', msg); } else { fail++; console.log('  FAIL', msg); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const section = (t) => console.log('\n' + t);

const server = spawn(process.execPath, [path.join(root, 'scripts/dev-server.mjs')], { env: { ...process.env, PORT: String(PORT), DEV_DATA: 'memory', SETUP_CODE: 'test-code-123' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
for (let i = 0; i < 100 && !serverLog.includes('running at'); i++) await sleep(100);
if (!serverLog.includes('running at')) { console.log(serverLog); process.exit(1); }

const browser = await chromium.launch();
const errors = [];
const pages = [];
async function person(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true, ...opts });
  const page = await ctx.newPage();
  pages.push(page);
  if (process.env.DEBUG_REQ) page.on('request', (r) => { if (r.url().includes('/api/')) console.log('   [req]', r.method(), r.url().replace(BASE, ''), (r.postData() || '').slice(0, 120)); });
  if (process.env.DEBUG_AUTH) {
    await page.addInitScript(() => { const d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML'); Object.defineProperty(Element.prototype, 'innerHTML', { set(v) { if (this.id === 'auth-root') console.log('AUTH RENDER', performance.now().toFixed(0), new Error().stack.split('\n').slice(2, 4).join(' / ')); d.set.call(this, v); }, get() { return d.get.call(this); } }); });
    page.on('console', (m) => console.log('   [page]', m.text().slice(0, 200)));
    page.on('request', (r) => { if (r.url().includes('/api/')) console.log('   [req]', r.method(), r.url().replace(BASE, ''), (r.postData() || '').slice(0, 120)); });
  }
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of (40[0139]|429)/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('response', (r) => { if ([400, 500].includes(r.status())) console.log('   [http ' + r.status() + ']', r.request().method(), r.url().replace(BASE, ''), (r.request().postData() || '').slice(0, 160)); });
  return { ctx, page };
}
const api = (page, p, opt = {}) => page.evaluate(async ([p, opt]) => {
  const r = await fetch('/api/' + p, { method: opt.method || 'GET', headers: { 'Content-Type': 'application/json', 'X-TBT': '1' }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}, [p, opt]);
async function signIn(page, email, password) {
  await page.goto(BASE + '/');
  await page.waitForSelector('form[data-auth="signin"]');
  await page.fill('[name=email]', email);
  await page.fill('[name=password]', password);
  await page.click('form[data-auth] button[type=submit]');
}
const waitApp = (page) => page.waitForSelector('#app:not([hidden])', { timeout: 10000 });
async function goView(page, v) { await page.click(`#nav [data-view="${v}"]`); await page.waitForTimeout(250); }
async function tab(page, t) { await page.click(`.drawer [data-act="bid-tab"][data-tab="${t}"]`); await page.waitForSelector(`.drawer .tabs button.on[data-tab="${t}"]`); await page.waitForTimeout(120); }
async function until(fn, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(250); } return false; }

const ADMIN = { name: 'Tanushri Bhuruk', position: 'Director', email: 'tanushri@tejas.test', password: 'Admin#Pass2026' };
const MEMBER = { name: 'Ashit Patil', position: 'Estimation engineer', email: 'ashit@tejas.test', password: 'Member#Pass2026' };

try {
  // ---------------------------------------------------------------- setup
  section('First-time setup');
  const A = await person();
  const pa = A.page;
  await pa.goto(BASE + '/');
  await pa.waitForSelector('form[data-auth="setup"]');
  ok(true, 'an empty tracker asks for first-time setup');
  await pa.fill('[name=code]', 'wrong');
  await pa.fill('[name=name]', ADMIN.name); await pa.fill('[name=position]', ADMIN.position); await pa.fill('[name=email]', ADMIN.email);
  await pa.fill('[name=password]', ADMIN.password); await pa.fill('[name=password2]', ADMIN.password);
  await pa.click('button[type=submit]');
  await pa.waitForSelector('.auth-msg.err');
  ok(/setup code/i.test(await pa.textContent('.auth-msg.err')), 'a wrong setup code is refused');
  await pa.fill('[name=code]', 'test-code-123');
  await pa.fill('[name=password]', ADMIN.password); await pa.fill('[name=password2]', ADMIN.password);
  await pa.click('button[type=submit]');
  await waitApp(pa);
  ok((await pa.textContent('#side-foot')).includes(ADMIN.name) && (await pa.textContent('#side-foot')).includes('Admin'), 'the first account is the admin, shown with name and position');
  const cookies = await A.ctx.cookies();
  const sess = cookies.find((c) => c.name === 'tbt_session');
  ok(sess && sess.httpOnly && sess.sameSite === 'Lax', 'the session cookie is HttpOnly and SameSite=Lax');

  // ---------------------------------------------------------------- sign up and approval
  section('Accounts: sign up, approval, sign in');
  const B = await person();
  const pb = B.page;
  await pb.goto(BASE + '/');
  await pb.waitForSelector('form[data-auth="signin"]');
  const signinText = await pb.textContent('.auth-box');
  ok(!signinText.includes(ADMIN.name) && !/sign in as/i.test(signinText), 'the sign-in screen does not list anyone\'s name');
  await pb.screenshot({ path: path.join(SHOTS, '01-sign-in.png') });
  await pb.click('[data-auth-go="signup"]');
  await pb.fill('[name=name]', MEMBER.name); await pb.fill('[name=position]', MEMBER.position); await pb.fill('[name=email]', MEMBER.email);
  await pb.fill('[name=password]', MEMBER.password); await pb.fill('[name=password2]', MEMBER.password + 'x');
  await pb.click('button[type=submit]');
  await pb.waitForSelector('.auth-msg.err');
  ok(/not the same/.test(await pb.textContent('.auth-msg.err')), 'mismatched passwords are caught');
  await pb.fill('[name=password]', MEMBER.password); await pb.fill('[name=password2]', MEMBER.password);
  await pb.click('button[type=submit]');
  await pb.waitForSelector('text=Account created');
  ok(true, 'a new account waits for approval');
  await signIn(pb, MEMBER.email, MEMBER.password);
  await pb.waitForSelector('.auth-msg.err');
  ok(/waiting for an admin/i.test(await pb.textContent('.auth-msg.err')), 'a pending account cannot sign in');

  const dup = await api(pb, 'auth', { method: 'POST', body: { action: 'signup', name: 'Imposter', position: 'x', email: ADMIN.email, password: 'Whatever#123' } });
  ok(dup.status === 409, 'nobody can create a second account with an existing email');

  await pa.reload(); await waitApp(pa);
  ok(await pa.waitForSelector('.banner.info >> text=waiting for your approval', { timeout: 5000 }).then(() => true, () => false), 'the admin sees a banner about the waiting account');
  await pa.click('.banner.info [data-act="go"]');
  await pa.waitForSelector('[data-act="user-do"][data-do="approve"]');
  await pa.screenshot({ path: path.join(SHOTS, '02-team-approval.png') });
  await pa.click('[data-act="user-do"][data-do="approve"]');
  await pa.waitForSelector(`[data-user-role]`);
  ok(true, 'the admin approves the account');

  await signIn(pb, MEMBER.email, 'wrong-password');
  await pb.waitForSelector('.auth-msg.err');
  ok(/not right/.test(await pb.textContent('.auth-msg.err')), 'a wrong password is refused');
  await signIn(pb, ADMIN.email, MEMBER.password);
  await pb.waitForSelector('.auth-msg.err');
  ok(/not right/.test(await pb.textContent('.auth-msg.err')), 'someone cannot sign in as another person with their own password');
  await signIn(pb, MEMBER.email, MEMBER.password);
  await waitApp(pb);
  ok((await pb.textContent('#side-foot')).includes(MEMBER.name) && (await pb.textContent('#side-foot')).includes(MEMBER.position), 'the member signs in and sees their name and position');

  // ---------------------------------------------------------------- new bid: company + client contact
  section('New bid: company toggle and client contact');
  await pa.goto(BASE + '/#/bids'); await waitApp(pa);
  await pa.click('header [data-act="new-bid"]');
  await pa.waitForSelector('.modal [data-companies]');
  const coLabels = await pa.$$eval('.modal [data-company]', (els) => els.map((e) => e.textContent.trim()));
  ok(coLabels.includes('Tejash Electrical Projects Pvt. Limited') && coLabels.includes('Tejas Electrical Proprietorship Projects'), 'the new bid form offers both companies');
  ok(await pa.isVisible('.modal legend >> text=Client contact'), 'the new bid form has a Client contact section');
  await pa.click('.modal [data-company="prop"]');
  await pa.fill('.modal [name=name]', 'Data hall 2 LT panels and cabling');
  await pa.fill('.modal [name=client]', 'Adani ConneX');
  await pa.fill('.modal [name=location]', 'Navi Mumbai');
  await pa.fill('.modal [name=contactName]', 'Rohit Shah');
  await pa.fill('.modal [name=contactRole]', 'Procurement lead');
  await pa.fill('.modal [name=contactPhone]', '+91 98200 11111');
  await pa.fill('.modal [name=contactEmail]', 'rohit@adani.example');
  await pa.screenshot({ path: path.join(SHOTS, '03-new-bid.png') });
  await pa.click('.modal footer .btn-primary');
  await pa.waitForSelector('.drawer');
  const head = await pa.textContent('.drawer .d-top');
  ok(head.includes('TEP/26-27/001') && head.includes('Proprietorship'), 'the bid gets the Proprietorship number TEP/26-27/001 and company tag');
  ok(await pa.inputValue('.drawer [data-f="contactName"]') === 'Rohit Shah' && await pa.inputValue('.drawer [data-f="contactEmail"]') === 'rohit@adani.example', 'the client contact is saved on the bid');
  ok(await pa.isVisible('.drawer .contact-acts a[href^="tel:"]'), 'the bid offers a Call button for the contact');
  const tabs = await pa.$$eval('.drawer .tabs button', (els) => els.map((e) => e.textContent.trim()));
  ok(tabs.some((t) => t.startsWith('Commercial Terms')) && !tabs.some((t) => /EMD and terms/.test(t)), 'the tab is called "Commercial Terms"');
  ok(tabs.some((t) => t.startsWith('NT items')), 'the bid has an NT items tab');
  const bidId = await pa.getAttribute('.drawer', 'data-bid');
  await pa.click('.drawer [data-act="close-bid"]');

  // a Pvt. Ltd. bid too
  await pa.click('header [data-act="new-bid"]');
  await pa.waitForSelector('.modal [data-companies]');
  await pa.fill('.modal [name=name]', 'Substation 33 kV, Plant 3');
  await pa.fill('.modal [name=client]', 'Jabil Circuit');
  await pa.click('.modal footer .btn-primary');
  await pa.waitForSelector('.drawer');
  ok((await pa.textContent('.drawer .d-top')).includes('TEJ/26-27/001'), 'a Pvt. Ltd. bid is numbered TEJ/26-27/001, separately');
  await pa.click('.drawer [data-act="close-bid"]');

  // ---------------------------------------------------------------- company filter
  section('Company filter');
  await pa.selectOption('.toolbar [data-co]', 'prop');
  await pa.waitForTimeout(300);
  let rows = await pa.$$eval('.tbl tbody tr .bid-name', (els) => els.map((e) => e.textContent));
  ok(rows.length === 1 && rows[0].includes('Data hall 2'), 'filtering to Proprietorship shows only its bid');
  await pa.selectOption('.toolbar [data-co]', 'pvt');
  await pa.waitForTimeout(300);
  rows = await pa.$$eval('.tbl tbody tr .bid-name', (els) => els.map((e) => e.textContent));
  ok(rows.length === 1 && rows[0].includes('Substation'), 'filtering to Pvt. Ltd. shows only its bid');
  await goView(pa, 'dashboard');
  ok(await pa.$eval('[data-co]', (e) => e.value) === 'pvt', 'the company filter carries over to the dashboard');
  await goView(pa, 'board');
  ok(await pa.$$eval('.board .card', (els) => els.length) === 1, 'the board follows the company filter');
  await goView(pa, 'reports');
  ok((await pa.textContent('.doc-head .co b')).includes('Tejash Electrical Projects Pvt. Limited'), 'the weekly report header names the filtered company');
  await pa.selectOption('[data-co]', '');
  await goView(pa, 'bids');
  ok(await pa.$$eval('.tbl tbody tr', (els) => els.length) === 2, '"Both companies" shows every bid');

  // ---------------------------------------------------------------- the other person sees it
  section('Sharing between two people');
  ok(await until(async () => (await pb.$$eval('#nav [data-view="bids"] .count', (e) => e.map((x) => x.textContent))).join('') === '2', 15000), 'the member sees the two new bids within seconds');
  await goView(pb, 'bids');
  await pb.click(`[data-act="open-bid"][data-id="${bidId}"]`);
  await pb.waitForSelector('.drawer');
  ok((await pb.textContent('.drawer .d-top')).includes(`Added by ${ADMIN.name}`), 'the member sees who added the bid');

  // ---------------------------------------------------------------- NT items
  section('NT items create offer revisions');
  await tab(pb, 'nt');
  await pb.click('.drawer [data-act="nt-add"]');
  await pb.waitForSelector('.modal .nt-entry');
  await pb.fill('.modal [name=desc]', 'Extra 4C x 300 sq mm cable runs');
  await pb.fill('.modal [name=qty]', '2');
  await pb.fill('.modal [name=rate]', '150000');
  await pb.waitForTimeout(150);
  ok((await pb.textContent('.modal [data-summary]')).includes('first offer (R0)'), 'with no offer yet, the NT cost becomes R0');
  await pb.click('.modal footer .btn-primary');
  await pb.waitForTimeout(300);
  await tab(pb, 'offers');
  let offerText = await pb.textContent('.drawer .d-body');
  ok(offerText.includes('R0') && offerText.includes('3,00,000'), 'R0 is ₹3,00,000 (2 × ₹1.5 L)');
  // add a normal revised offer, then more NT items
  await tab(pb, 'nt');
  await pb.click('.drawer [data-act="nt-add"]');
  await pb.waitForSelector('.modal .nt-entry');
  await pb.fill('.modal [name=desc]', 'Additional ACB 2500 A');
  await pb.fill('.modal [name=amount]', '4.5 L');
  await pb.click('.modal [data-add-row]');
  await pb.fill('.modal tbody tr:nth-child(2) [name=desc]', 'Cable tray extension');
  await pb.fill('.modal tbody tr:nth-child(2) [name=amount]', '50000');
  await pb.waitForTimeout(150);
  const sum = await pb.textContent('.modal [data-summary]');
  ok(sum.includes('R1') && sum.includes('₹3 L + ₹5 L = ₹8 L'), 'the summary previews R1 = R0 ₹3 L + ₹5 L of NT items = ₹8 L');
  await pb.click('.modal footer .btn-primary');
  await pb.waitForTimeout(300);
  const ntRows = await pb.$$eval('.drawer .d-body tbody tr', (els) => els.length);
  ok(ntRows === 3, 'the NT items tab lists all three items');
  await tab(pb, 'offers');
  offerText = await pb.textContent('.drawer .d-body');
  ok(offerText.includes('R1') && offerText.includes('8,00,000') && /NT items added/.test(offerText), 'revision R1 of ₹8,00,000 is created with reason "NT items added"');
  // reject one NT item -> R2 = R1 - 50,000
  await tab(pb, 'nt');
  await pb.click('.drawer tr:has-text("Cable tray extension") [data-act="nt-edit"]');
  await pb.waitForSelector('.modal [name=status]');
  await pb.selectOption('.modal [name=status]', 'Rejected by client');
  await pb.waitForTimeout(100);
  ok((await pb.textContent('.modal [data-summary]')).includes('R2'), 'rejecting an NT item previews a new revision R2');
  await pb.click('.modal footer .btn-primary');
  await pb.waitForTimeout(300);
  await tab(pb, 'offers');
  offerText = await pb.textContent('.drawer .d-body');
  ok(offerText.includes('R2') && offerText.includes('7,50,000'), 'R2 is ₹7,50,000 after the client rejects the ₹50,000 item');
  ok((await pb.textContent('.drawer .d-facts')).includes('7.5 L'), 'the bid\'s current offer is now ₹7.5 L');
  await pb.screenshot({ path: path.join(SHOTS, '04-offers-after-nt.png') });
  await tab(pb, 'nt');
  await pb.screenshot({ path: path.join(SHOTS, '05-nt-items.png') });

  // ---------------------------------------------------------------- deleting needs the phrase
  section('Deleting a bid needs "DELETE BID"');
  await pb.click('.drawer [data-act="bid-menu"]');
  await pb.click('.menu button:has-text("Delete bid")');
  await pb.waitForSelector('.modal .btn-confirm');
  ok(await pb.$eval('.modal .btn-confirm', (b) => b.disabled), 'the Delete button is disabled at first');
  await pb.fill('.modal [name=phrase]', 'DELETE');
  ok(await pb.$eval('.modal .btn-confirm', (b) => b.disabled), 'a partial phrase does not enable it');
  await pb.screenshot({ path: path.join(SHOTS, '06-delete-confirm.png') });
  await pb.fill('.modal [name=phrase]', 'DELETE BID');
  ok(!(await pb.$eval('.modal .btn-confirm', (b) => b.disabled)), 'typing DELETE BID enables it');
  await pb.click('.modal .btn-confirm');
  await pb.waitForTimeout(300);
  ok(!(await pb.$(`[data-act="open-bid"][data-id="${bidId}"]`)), 'the bid is deleted');
  await pb.waitForTimeout(1200);

  // ---------------------------------------------------------------- activity
  section('Activity: who did what, filters, restore');
  await goView(pa, 'activity');
  await pa.waitForSelector('.act-item');
  await pa.click('[data-act="act-cat"][data-v="deletes"]');
  ok(await until(async () => (await pa.$$('.act-item')).length >= 1, 5000), 'filtering to "Deletions and restores" shows the deletion');
  const delEntry = await pa.textContent('.act-item');
  ok(delEntry.includes(MEMBER.name) && delEntry.includes(MEMBER.email) && delEntry.includes('Deleted bid TEP/26-27/001'), 'the entry names who deleted it, with their email');
  ok(!(await pa.$$eval('.act-item', (els) => els.some((e) => /Added bid/.test(e.textContent)))), 'other kinds of activity are filtered out');
  await pa.screenshot({ path: path.join(SHOTS, '07-activity-deletions.png') });
  // members see activity but cannot restore
  await goView(pb, 'activity');
  await pb.waitForSelector('.act-item');
  ok(!(await pb.$('[data-act="act-restore"]')), 'a member does not get a Restore button');
  const memberRestore = await api(pb, 'activity', { method: 'POST', body: { action: 'restore', id: 1 } });
  ok(memberRestore.status === 403, 'the server refuses a restore from a member');
  // person filter
  await pa.click('[data-act="act-cat"][data-v=""]');
  await pa.waitForTimeout(400);
  const memberId = await pa.$eval('[data-af="user"]', (s) => [...s.options].find((o) => /Ashit/.test(o.textContent))?.value);
  await pa.selectOption('[data-af="user"]', memberId);
  await pa.waitForTimeout(700);
  const whoList = await pa.$$eval('.act-who b', (els) => [...new Set(els.map((e) => e.textContent))]);
  ok(whoList.length === 1 && whoList[0] === MEMBER.name, 'the person filter shows only that person\'s activity');
  const sums = await pa.$$eval('.act-sum', (els) => els.map((e) => e.textContent).join(' | '));
  ok(/Added NT item/.test(sums) && /Signed in/.test(sums), 'NT items and sign-ins are in the log');
  await pa.fill('[data-af="q"]', 'TEP/26-27/001');
  await pa.waitForTimeout(900);
  ok((await pa.$$('.act-item')).length >= 3, 'searching by bid number finds its entries');
  await pa.click('[data-act="act-clear"]');
  await pa.waitForTimeout(500);
  // details of an edit
  await pa.click('[data-act="act-cat"][data-v="offers"]');
  await pa.waitForTimeout(700);
  // restore
  await pa.click('[data-act="act-cat"][data-v="deletes"]');
  await pa.waitForSelector('[data-act="act-restore"]');
  await pa.click('[data-act="act-restore"]');
  await pa.click('.modal footer .btn-primary');
  await pa.waitForTimeout(1200);
  ok(await until(async () => (await pa.$$eval('.act-sum', (els) => els.some((e) => /Restored bid/.test(e.textContent)))), 5000), 'the admin restores the bid and the restore is logged');
  await goView(pa, 'bids');
  await pa.click(`[data-act="open-bid"][data-id="${bidId}"]`);
  await pa.waitForSelector('.drawer');
  ok((await pa.textContent('.drawer .tabs')).includes('NT items3') && (await pa.textContent('.drawer .d-facts')).includes('7.5 L'), 'the restored bid has its NT items and offers back');
  await pa.click('.drawer [data-act="close-bid"]');

  // ---------------------------------------------------------------- permissions
  section('Permissions');
  await pb.goto(BASE + '/#/settings'); await waitApp(pb);
  await pb.click('[data-act="settings-tab"][data-tab="lists"]');
  await pb.waitForSelector('[data-co-f="pvt:name"]');
  ok(await pb.isVisible('text=Only an admin can change these') && await pb.$eval('[data-co-f="pvt:name"]', (e) => e.disabled), 'members see the lists read-only');
  const sneak = await api(pb, 'sync', { method: 'POST', body: { records: [{ _c: 'settings', id: 'main', _v: 99, _ts: Date.now(), _dev: 'x', sectors: ['Hacked'] }] } });
  const after = await api(pb, 'sync?since=0');
  ok(!JSON.stringify(after.json.records.filter((r) => r._c === 'settings')).includes('Hacked'), 'the server ignores settings changes from a member');
  const erase = await api(pb, 'sync', { method: 'POST', body: { records: [], reason: 'erase' } });
  ok(erase.status === 403, 'a member cannot "delete everything"');
  const users = await api(pb, 'users', { method: 'POST', body: { action: 'role', id: memberId, role: 'admin' } });
  ok(users.status === 403, 'a member cannot make themselves an admin');
  const bk = await api(pb, 'backups');
  ok(bk.status === 403, 'a member cannot read backups');
  const noCsrf = await pb.evaluate(async () => (await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"records":[]}' })).status);
  ok(noCsrf === 403, 'requests without the app\'s header are blocked');

  // ---------------------------------------------------------------- account changes
  section('My account and password reset');
  await pb.click('[data-act="settings-tab"][data-tab="account"]');
  await pb.fill('form[data-set-form="profile"] [name=position]', 'Senior estimation engineer');
  await pb.click('form[data-set-form="profile"] button[type=submit]');
  ok(await until(async () => (await pb.textContent('#side-foot')).includes('Senior estimation engineer'), 4000), 'a person can change their own position');
  await pb.fill('[name=current]', 'nope'); await pb.fill('[name=next]', 'NewPass#2026'); await pb.fill('[name=next2]', 'NewPass#2026');
  await pb.click('form[data-set-form="password"] button[type=submit]');
  await pb.waitForTimeout(500);
  ok(await pb.isVisible('.toast >> text=current password is not right'), 'changing the password needs the current one');
  // admin makes a reset link
  await pa.goto(BASE + '/#/settings'); await waitApp(pa);
  await pa.click('[data-act="settings-tab"][data-tab="team"]');
  await pa.waitForSelector(`[data-act="user-menu"][data-id="${memberId}"]`);
  await pa.click(`[data-act="user-menu"][data-id="${memberId}"]`);
  await pa.click('.menu button:has-text("password reset link")');
  await pa.waitForSelector('.modal #rl');
  const link = await pa.inputValue('.modal #rl');
  ok(/\/#\/reset\/[A-Za-z0-9_-]{20,}$/.test(link), 'the admin gets a one-time reset link');
  await pa.click('.modal footer .btn:not(.btn-primary)');
  const C = await person();
  await C.page.goto(link);
  await C.page.waitForSelector('form[data-auth="reset"]');
  await C.page.fill('[name=password]', 'Reset#Pass2026'); await C.page.fill('[name=password2]', 'Reset#Pass2026');
  await C.page.click('button[type=submit]');
  await C.page.waitForSelector('.auth-msg.ok');
  await signIn(C.page, MEMBER.email, 'Reset#Pass2026');
  await waitApp(C.page);
  ok(true, 'the member sets a new password from the link and signs in with it');
  await C.ctx.close();
  const C2 = await person();
  await C2.page.goto(link);
  ok(await C2.page.waitForSelector('text=expired or was already used', { timeout: 5000 }).then(() => true, () => false), 'the reset link works only once');
  await C2.ctx.close();

  // ---------------------------------------------------------------- turning an account off
  section('Turning an account off');
  await pa.click(`[data-act="user-menu"][data-id="${memberId}"]`);
  await pa.click('.menu button:has-text("Turn off")');
  await pa.click('.modal footer .btn-danger');
  await pa.waitForSelector('text=Turned off');
  ok(true, 'the admin turns the member\'s account off');
  await pb.goto(BASE + '/#/dashboard');
  await pb.waitForSelector('form[data-auth="signin"]');
  ok(true, 'the member is signed out everywhere');
  await signIn(pb, MEMBER.email, 'Reset#Pass2026');
  await pb.waitForSelector('.auth-msg.err');
  ok(/turned off/.test(await pb.textContent('.auth-msg.err')), 'and cannot sign in again');
  await pa.click(`[data-act="user-do"][data-do="enable"][data-id="${memberId}"]`);
  await pa.waitForTimeout(400);

  // ---------------------------------------------------------------- financial years
  section('Financial years');
  await goView(pa, 'bids');
  let fys = await pa.$$eval('[data-filter="fy"] option', (o) => o.map((x) => x.textContent));
  ok(fys.includes('FY 2026-27') && !fys.includes('FY 2025-26'), 'this year the list shows FY 2026-27');
  const D = await person();
  await D.page.clock.setFixedTime(new Date('2027-06-15T10:00:00+05:30'));
  await signIn(D.page, ADMIN.email, ADMIN.password);
  await waitApp(D.page);
  await goView(D.page, 'bids');
  fys = await D.page.$$eval('[data-filter="fy"] option', (o) => o.map((x) => x.textContent));
  ok(fys[1] === 'FY 2027-28' && fys.includes('FY 2026-27'), 'next year (June 2027) the list shows FY 2027-28 and still FY 2026-27');
  await goView(D.page, 'dashboard');
  const dashFys = await D.page.$$eval('#dash-fy option', (o) => o.map((x) => x.textContent));
  ok(dashFys.join(',') === 'FY 2027-28,FY 2026-27', 'the dashboard year list also keeps last year');
  await D.page.selectOption('#dash-fy', { label: 'FY 2026-27' });
  await D.page.waitForTimeout(300);
  ok((await D.page.textContent('.figs')).includes('2026-27'), 'last year\'s figures can be viewed');
  await D.ctx.close();

  // ---------------------------------------------------------------- data: import, backups, old file
  section('Data: Excel import, backups and the old tracker\'s backup file');
  await pa.goto(BASE + '/#/settings'); await waitApp(pa);
  await pa.click('[data-act="settings-tab"][data-tab="data"]');
  await pa.waitForSelector('[data-act="backup-now"]');
  await pa.click('[data-act="backup-now"]');
  ok(await until(async () => (await pa.textContent('.set-block')).length > 0 && (await pa.$$eval('td', (t) => t.some((x) => x.textContent === 'Saved by hand'))), 5000), 'the admin saves a backup and it is listed');
  if (fs.existsSync(XLSX)) {
    const [fc] = await Promise.all([pa.waitForEvent('filechooser'), pa.click('[data-act="import-excel"]')]);
    await fc.setFiles(XLSX);
    await pa.waitForSelector('.modal [name=company]');
    await pa.selectOption('.modal [name=company]', 'pvt');
    await pa.click('.modal footer .btn-primary');
    await pa.waitForTimeout(1500);
    const imp = await api(pa, 'activity?category=data');
    ok(imp.json.items.some((i) => /Imported .* from Excel/.test(i.summary)), 'an Excel import is logged as one entry');
  }
  // a backup file from the old shared-folder version
  const oldFile = path.join(SHOTS, 'old-backup.json');
  fs.writeFileSync(oldFile, JSON.stringify({ app: 'tejas-bid-tracker', format: 1, savedAt: Date.now() - 86400000, user: 'Shital', records: [
    { _c: 'bids', id: 'bOLD1', _v: 4, _ts: Date.now() - 86400000, _by: 'Shital', _dev: 'dOld', no: 'TEJ/26-27/045', name: 'Old tracker bid: TE Connectivity LT works', client: 'TE Connectivity', status: 'submitted', receivedDate: '2026-08-02', createdBy: 'Shital', createdAt: Date.now() - 50 * 86400000 },
    { _c: 'revisions', id: 'rOLD1', _v: 1, _ts: Date.now() - 86400000, _dev: 'dOld', bidId: 'bOLD1', seq: 0, value: 6200000, date: '2026-08-20', reason: 'First offer' },
    { _c: 'settings', id: 'main', _v: 3, _ts: Date.now() - 86400000, _dev: 'dOld', team: ['Shital'], prefix: 'TEJ', sectors: ['Data centre', 'Automobile and EV'] },
  ] }));
  const [fc2] = await Promise.all([pa.waitForEvent('filechooser'), pa.click('[data-act="restore-file"]')]);
  await fc2.setFiles(oldFile);
  await pa.waitForSelector('.modal .radio-cards');
  await pa.click('.modal footer .btn-primary');
  await pa.waitForTimeout(1500);
  const oldBid = await api(pa, 'sync?since=0');
  const ob = oldBid.json.records.find((r) => r.id === 'bOLD1');
  ok(ob && !ob._del && ob.createdBy === 'Shital', '"Add what is missing" brings in the old bid and keeps who created it');
  ok(oldBid.json.records.filter((r) => r._c === 'bids' && !r._del).length >= 3, 'and keeps the bids already here');

  // ---------------------------------------------------------------- sign out
  section('Signing out');
  await pa.click('#side-foot [data-act="me-menu"]');
  await pa.click('.menu button:has-text("Sign out")');
  await pa.waitForSelector('form[data-auth="signin"]');
  const left = await pa.evaluate(() => new Promise((res) => { const r = indexedDB.open('tejas-bid-tracker-web', 1); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('records'); g.onsuccess = () => res((g.result || []).length); }; }));
  ok(left === 0, 'signing out clears the bids kept in this browser');
  const st = await api(pa, 'auth?action=status');
  ok(st.json.user === null, 'and ends the session on the server');

  // ---------------------------------------------------------------- phone layout
  section('Phone layout');
  const M = await person({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await signIn(M.page, ADMIN.email, ADMIN.password);
  await waitApp(M.page);
  for (const v of ['bids', 'activity', 'settings']) {
    await M.page.goto(BASE + '/#/' + v); await M.page.waitForTimeout(700);
    const over = await M.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(over <= 1, `no sideways scrolling on ${v} at phone width`);
    await M.page.screenshot({ path: path.join(SHOTS, `08-phone-${v}.png`) });
  }
  await M.page.goto(BASE + '/#/bids'); await M.page.waitForTimeout(400);
  await M.page.click('header [data-act="new-bid"]');
  await M.page.waitForSelector('.modal');
  await M.page.screenshot({ path: path.join(SHOTS, '09-phone-new-bid.png') });
  await M.ctx.close();

  // ---------------------------------------------------------------- admin recovery
  section('Admin recovery with the setup code');
  const R = await person();
  await R.page.goto(BASE + '/');
  await R.page.waitForSelector('[data-auth-go="recover"]');
  await R.page.click('[data-auth-go="recover"]');
  await R.page.fill('[name=code]', 'test-code-123'); await R.page.fill('[name=email]', MEMBER.email);
  await R.page.fill('[name=password]', 'Hijack#Pass2026'); await R.page.fill('[name=password2]', 'Hijack#Pass2026');
  await R.page.click('button[type=submit]');
  await R.page.waitForSelector('.auth-msg.err');
  ok(/only for an admin/.test(await R.page.textContent('.auth-msg.err')), 'the setup code cannot reset a member\'s password');
  await R.page.fill('[name=code]', 'not-the-code'); await R.page.fill('[name=email]', ADMIN.email);
  await R.page.fill('[name=password]', 'Recovered#2026'); await R.page.fill('[name=password2]', 'Recovered#2026');
  await R.page.click('button[type=submit]');
  await R.page.waitForSelector('.auth-msg.err');
  ok(/not right/.test(await R.page.textContent('.auth-msg.err')), 'a wrong setup code is refused');
  await R.page.fill('[name=code]', 'test-code-123');
  await R.page.fill('[name=password]', 'Recovered#2026'); await R.page.fill('[name=password2]', 'Recovered#2026');
  await R.page.click('button[type=submit]');
  await R.page.waitForSelector('.auth-msg.ok');
  await signIn(R.page, ADMIN.email, 'Recovered#2026');
  await waitApp(R.page);
  ok(true, 'an admin who forgot their password resets it with the setup code and signs in');
  await R.ctx.close();

  await pa.screenshot({ path: path.join(SHOTS, '10-signed-out.png') });
} catch (e) {
  fail++;
  console.log('  FAIL (stopped)', e.message.split('\n')[0]);
  console.log(e.stack.split('\n').slice(1, 4).join('\n'));
  for (const [k, pg] of pages.entries()) await pg.screenshot({ path: path.join(SHOTS, `fail-${k}.png`) }).catch(() => {});
} finally {
  ok(errors.length === 0, 'no script errors in the browser' + (errors.length ? ': ' + errors.slice(0, 5).join(' || ') : ''));
  await browser.close();
  server.kill();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail && process.env.SHOW_LOG) console.log(serverLog);
  process.exit(fail ? 1 : 0);
}
