// Database access. In production this is Neon Postgres (DATABASE_URL, set by Vercel's Neon integration).
// The local test server injects an in-process Postgres (PGlite) through globalThis.__TBT_DB.
import { neon } from '@neondatabase/serverless';

const SCHEMA_VERSION = '4';
const SCHEMA = [
  `create table if not exists meta (key text primary key, value text)`,
  `create table if not exists users (
     id text primary key,
     email text not null unique,
     name text not null,
     position text not null default '',
     pass text not null,
     role text not null default 'member',
     status text not null default 'pending',
     created_at timestamptz not null default now(),
     approved_by text,
     last_login timestamptz,
     pass_changed_at timestamptz
   )`,
  `create table if not exists sessions (
     token_hash text primary key,
     user_id text not null references users(id) on delete cascade,
     created_at timestamptz not null default now(),
     expires_at timestamptz not null,
     ip text, ua text
   )`,
  `create index if not exists sessions_user on sessions(user_id)`,
  `create table if not exists resets (
     token_hash text primary key,
     user_id text not null references users(id) on delete cascade,
     expires_at timestamptz not null,
     used boolean not null default false,
     created_by text
   )`,
  `create sequence if not exists rec_seq`,
  `create table if not exists records (
     coll text not null,
     id text not null,
     v integer not null,
     ts bigint not null,
     dev text not null default '',
     del boolean not null default false,
     data jsonb not null,
     seq bigint not null,
     updated_by text,
     updated_at timestamptz not null default now(),
     primary key (coll, id)
   )`,
  `create index if not exists records_seq on records(seq)`,
  `create table if not exists activity (
     id bigserial primary key,
     at timestamptz not null default now(),
     user_id text, user_name text, user_email text,
     action text not null,
     entity text, entity_id text,
     bid_id text, bid_no text, bid_name text,
     summary text,
     details jsonb,
     ip text
   )`,
  `create index if not exists activity_at on activity(at desc)`,
  `create index if not exists activity_action on activity(action)`,
  `create index if not exists activity_user on activity(user_id)`,
  `create index if not exists activity_bid on activity(bid_id)`,
  `create table if not exists login_attempts (id bigserial primary key, email text, ip text, ok boolean not null, at timestamptz not null default now())`,
  `create index if not exists login_attempts_email on login_attempts(email, at)`,
  `create table if not exists backups (
     id bigserial primary key,
     day date,
     kind text not null,
     at timestamptz not null default now(),
     by_name text,
     count integer not null default 0,
     records jsonb not null
   )`,
  `create unique index if not exists backups_daily on backups(day) where kind = 'daily'`,
  `create table if not exists bid_files (
     id text primary key,
     bid_id text not null,
     name text not null,
     path text not null default '',
     mime text not null default 'application/octet-stream',
     size integer not null,
     content text not null,
     by_name text,
     by_id text,
     at timestamptz not null default now()
   )`,
  `create index if not exists bid_files_bid on bid_files(bid_id, at)`,
];

let ready = null;

export function db() {
  if (ready) return ready;
  ready = (async () => {
    let q;
    if (globalThis.__TBT_DB) q = globalThis.__TBT_DB;
    else {
      const url = process.env.tejas_database_neon_DATABASE_URL || process.env.POSTGRES_URL;
      if (!url) {
        const e = new Error('The database is not connected yet. In Vercel, add a Neon database to this project (Storage tab), then redeploy.');
        e.status = 503; e.code = 'no_database';
        throw e;
      }
      const sql = neon(url);
      q = (text, params = []) => sql.query(text, params);
    }
    let current = null;
    try { current = (await q(`select value from meta where key = 'schema'`))[0]?.value; } catch { current = null; }
    if (current !== SCHEMA_VERSION) {
      for (const s of SCHEMA) await q(s);
      await q(`insert into meta(key, value) values ('schema', $1) on conflict (key) do update set value = excluded.value`, [SCHEMA_VERSION]);
    }
    return q;
  })();
  ready.catch(() => { ready = null; });
  return ready;
}
