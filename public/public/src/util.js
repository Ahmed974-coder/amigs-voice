// Shared helpers for AMIGS Voice

export const YEARS = [7, 8, 9, 10, 11];

export const CATEGORIES = [
  'School facilities',
  'Education and enrichment',
  'Sports',
  'Extracurricular activities',
  'Student wellbeing',
  'School events',
  'General suggestions',
];

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });

export const fail = (message, status = 400) => json({ error: message }, status);

export const uid = (prefix = '') =>
  prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20);

export const now = () => new Date().toISOString();

export const iso = (d) => new Date(d).toISOString();

export const addDays = (days, from = Date.now()) =>
  new Date(from + days * 86400000).toISOString();

export function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token, maxAge = 60 * 60 * 24 * 14) {
  return `amigs_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export const clearCookie = () =>
  'amigs_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

export function csv(rows, columns) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(c.get(r))).join(',')).join('\r\n');
  return '\uFEFF' + head + '\r\n' + body + '\r\n';
}

export function csvResponse(filename, content) {
  return new Response(content, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}

export function parseYears(value, fallback = YEARS) {
  let arr = value;
  if (typeof value === 'string') {
    try {
      arr = JSON.parse(value);
    } catch {
      arr = value.split(',').map((s) => Number(s.trim()));
    }
  }
  if (!Array.isArray(arr)) return fallback;
  const clean = [...new Set(arr.map(Number).filter((n) => YEARS.includes(n)))].sort((a, b) => a - b);
  return clean.length ? clean : fallback;
}

export function isEligible(eligibleYears, yearGroup) {
  if (!yearGroup) return false;
  return parseYears(eligibleYears).includes(Number(yearGroup));
}

export function displayName(user, mode = 'initials') {
  if (!user) return 'Unknown';
  if (mode === 'anonymous') return 'Anonymous student';
  if (mode === 'full') return user.name;
  const parts = String(user.name).trim().split(/\s+/);
  const first = parts[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] + '.' : '';
  return `${first} ${last}`.trim();
}

export function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function str(value, max = 5000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length < 200;
}

export function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

// Very small in-isolate rate limiter (defence in depth; D1 constraints are authoritative)
const buckets = new Map();
export function rateLimit(key, limit, windowMs) {
  const t = Date.now();
  const entry = buckets.get(key);
  if (!entry || t - entry.start > windowMs) {
    buckets.set(key, { start: t, count: 1 });
    return true;
  }
  entry.count += 1;
  if (buckets.size > 5000) buckets.clear();
  return entry.count <= limit;
}

export async function getSettings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const row of results || []) out[row.key] = row.value;
  return out;
}

export async function setSetting(env, key, value) {
  await env.DB.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
    .bind(key, String(value))
    .run();
}

export async function notify(env, userId, type, message, link = null) {
  await env.DB.prepare(
    'INSERT INTO notifications (id, user_id, type, message, link, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
  )
    .bind(uid('n_'), userId, type, message, link, now())
    .run();
}

export async function notifyRole(env, role, type, message, link = null) {
  const { results } = await env.DB.prepare(
    'SELECT id FROM users WHERE role = ? AND status = ?'
  )
    .bind(role, 'active')
    .all();
  for (const u of results || []) await notify(env, u.id, type, message, link);
}

export async function audit(env, actor, action, targetType, targetId, details = '') {
  await env.DB.prepare(
    'INSERT INTO audit_log (id, actor_id, actor_name, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(uid('a_'), actor?.id || null, actor?.name || 'system', action, targetType, targetId, details, now())
    .run();
}

export function hasPerm(user, perm) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'teacher') return false;
  try {
    return JSON.parse(user.permissions || '[]').includes(perm);
  } catch {
    return false;
  }
}

export function canModerate(user) {
  return user?.role === 'admin' || hasPerm(user, 'moderate');
}

export function canCreatePolls(user) {
  return user?.role === 'admin' || hasPerm(user, 'create_polls');
}
