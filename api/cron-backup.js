// Runs once a day (vercel.json "crons"): saves the daily backup and clears old sign-in records and activity.
import { db } from '../lib/db.js';
import { send } from '../lib/http.js';
import { snapshot } from '../lib/records.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return send(res, 401, { error: 'Not allowed.' });
  try {
    const q = await db();
    const n = await snapshot(q, 'daily', 'automatic');
    await q(`delete from login_attempts where at < now() - interval '30 days'`);
    await q(`delete from sessions where expires_at < now()`);
    await q(`delete from resets where expires_at < now() - interval '7 days'`);
    await q(`delete from activity where at < now() - interval '90 days'`);
    send(res, 200, { ok: true, records: n });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'Backup failed.' });
  }
}
