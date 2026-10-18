// Small helpers for the API functions: JSON replies, errors, cookies, same-origin check.

export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export function fail(status, message, code) {
  const e = new Error(message);
  e.status = status; e.code = code || 'error';
  throw e;
}

// Wraps a handler: blocks cross-site writes, turns thrown errors into friendly JSON.
export function route(fn) {
  return async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (req.headers['x-tbt'] !== '1') return send(res, 403, { error: 'Request blocked.', code: 'csrf' });
        const origin = req.headers.origin;
        if (origin) {
          let ok = false;
          try { ok = new URL(origin).host === (req.headers['x-forwarded-host'] || req.headers.host); } catch { ok = false; }
          if (!ok) return send(res, 403, { error: 'Request blocked.', code: 'csrf' });
        }
      }
      await fn(req, res);
    } catch (e) {
      if (e && e.status) return send(res, e.status, { error: e.message, code: e.code });
      console.error(e);
      send(res, 500, { error: 'Something went wrong on the server. Try again in a minute.', code: 'server' });
    }
  };
}

export function body(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  if (typeof b === 'string' || Buffer.isBuffer(b)) { try { return JSON.parse(String(b)); } catch { return {}; } }
  return {};
}

export function query(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  const u = new URL(req.url, 'http://local');
  return Object.fromEntries(u.searchParams);
}

export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || '';
}

export function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function isSecure(req) {
  return req.headers['x-forwarded-proto'] === 'https' || !!process.env.VERCEL;
}

export function originOf(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${isSecure(req) ? 'https' : 'http'}://${host}`;
}
