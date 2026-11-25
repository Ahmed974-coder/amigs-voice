// AMIGS Voice — API worker
import {
  YEARS, CATEGORIES, json, fail, uid, now, addDays, parseYears, isEligible, displayName,
  clampInt, str, isEmail, pct, rateLimit, getSettings, setSetting, notify, notifyRole,
  audit, hasPerm, canModerate, canCreatePolls, csv, csvResponse,
} from './util.js';
import {
  hashPassword, verifyPassword, createSession, currentUser, destroySession, publicUser,
} from './auth.js';

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

const routes = [];
const on = (method, pattern, handler) => routes.push({ method, parts: pattern.split('/').filter(Boolean), handler });

function match(patternParts, pathParts) {
  if (patternParts.length !== pathParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i];
    if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(pathParts[i]);
    else if (p !== pathParts[i]) return null;
  }
  return params;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const pathParts = url.pathname.split('/').filter(Boolean);
    for (const r of routes) {
      if (r.method !== request.method) continue;
      const params = match(r.parts, pathParts);
      if (!params) continue;
      try {
        return await r.handler(request, env, url, params);
      } catch (e) {
        console.error('API error', url.pathname, e && e.stack ? e.stack : e);
        return fail('Something went wrong on our side. Please try again.', 500);
      }
    }
    return fail('Not found', 404);
  },
};

/* ------------------------------------------------------------------ */
/* Guards                                                              */
/* ------------------------------------------------------------------ */

async function auth(request, env) {
  return currentUser(request, env);
}

async function requireUser(request, env) {
  const user = await auth(request, env);
  if (!user) throw { status: 401, message: 'Please sign in to continue.' };
  return user;
}

async function requireStaff(request, env, perm) {
  const user = await requireUser(request, env);
  if (user.role === 'admin') return user;
  if (user.role === 'teacher' && (!perm || hasPerm(user, perm))) return user;
  throw { status: 403, message: 'You do not have permission to do that.' };
}

const guard = (fn) => async (request, env, url, params) => {
  try {
    return await fn(request, env, url, params);
  } catch (e) {
    if (e && e.status) return fail(e.message, e.status);
    throw e;
  }
};

const body = async (request) => {
  try {
    return await request.json();
  } catch {
    return {};
  }
};

/* ------------------------------------------------------------------ */
/* Domain helpers                                                      */
/* ------------------------------------------------------------------ */

async function refreshStatuses(env) {
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE polls SET status = 'open' WHERE status = 'scheduled' AND opens_at <= ? AND closes_at > ?").bind(t, t),
    env.DB.prepare("UPDATE polls SET status = 'closed' WHERE status = 'open' AND closes_at <= ?").bind(t),
    env.DB.prepare("UPDATE petitions SET status = 'closed', closed_at = ? WHERE status IN ('approved','under_consideration') AND closing_at IS NOT NULL AND closing_at <= ?").bind(t, t),
  ]);
}

async function eligiblePopulation(env, eligibleYears) {
  const years = parseYears(eligibleYears);
  const placeholders = years.map(() => '?').join(',');
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM users WHERE role = 'student' AND status = 'active' AND year_group IN (${placeholders})`
  )
    .bind(...years)
    .first();
  return row?.n || 0;
}

async function petitionView(env, row, viewer, settings) {
  const mode = settings?.author_display || 'initials';
  const signed = viewer
    ? !!(await env.DB.prepare('SELECT 1 AS x FROM signatures WHERE petition_id = ? AND user_id = ?')
        .bind(row.id, viewer.id)
        .first())
    : false;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    reason: row.reason,
    affected: row.affected,
    category: row.category,
    target: row.target,
    status: row.status,
    eligibleYears: parseYears(row.eligible_years),
    image: row.image || null,
    featured: !!row.featured,
    createdAt: row.created_at,
    closingAt: row.closing_at,
    closedAt: row.closed_at,
    moderationNote: row.moderation_note || null,
    author: displayName({ name: row.author_name, year_group: row.author_year }, mode),
    authorYear: row.author_year,
    isMine: viewer ? row.author_id === viewer.id : false,
    signatures: row.signatures || 0,
    progress: pct(row.signatures || 0, row.target),
    signedByMe: signed,
    eligibleForMe: viewer ? isEligible(row.eligible_years, viewer.year_group) : false,
  };
}

const PETITION_SELECT = `
  SELECT p.*, u.name AS author_name, u.year_group AS author_year,
         (SELECT COUNT(*) FROM signatures s WHERE s.petition_id = p.id) AS signatures
    FROM petitions p JOIN users u ON u.id = p.author_id`;

async function pollView(env, row, viewer) {
  const options = JSON.parse(row.options);
  const eligible = parseYears(row.eligible_years);
  const voted = viewer
    ? !!(await env.DB.prepare(
        row.voting_mode === 'anonymous'
          ? 'SELECT 1 AS x FROM poll_participation WHERE poll_id = ? AND user_id = ?'
          : 'SELECT 1 AS x FROM votes WHERE poll_id = ? AND user_id = ?'
      )
        .bind(row.id, viewer.id)
        .first())
    : false;
  const participants = await env.DB.prepare(
    row.voting_mode === 'anonymous'
      ? 'SELECT COUNT(*) AS n FROM poll_participation WHERE poll_id = ?'
      : 'SELECT COUNT(*) AS n FROM votes WHERE poll_id = ?'
  )
    .bind(row.id)
    .first();
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    question: row.question,
    options,
    type: row.type,
    maxChoices: row.max_choices,
    eligibleYears: eligible,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    resultsVisibility: row.results_visibility,
    resultsReleaseAt: row.results_release_at,
    votingMode: row.voting_mode,
    status: row.status,
    createdAt: row.created_at,
    totalVotes: participants?.n || 0,
    votedByMe: voted,
    eligibleForMe: viewer ? isEligible(row.eligible_years, viewer.year_group) : false,
  };
}

function resultsVisible(poll, viewer) {
  if (viewer && (viewer.role === 'admin' || viewer.role === 'teacher')) return true;
  switch (poll.resultsVisibility) {
    case 'always':
      return true;
    case 'after_vote':
      return !!poll.votedByMe || poll.status === 'closed';
    case 'after_release':
      return poll.resultsReleaseAt ? new Date(poll.resultsReleaseAt) <= new Date() : poll.status === 'closed';
    case 'after_close':
    default:
      return poll.status === 'closed';
  }
}

async function computeResults(env, poll) {
  const options = JSON.parse(poll.options);
  const table = poll.voting_mode === 'anonymous' ? 'ballots' : 'votes';
  const { results } = await env.DB.prepare(`SELECT selections FROM ${table} WHERE poll_id = ?`)
    .bind(poll.id)
    .all();
  const counts = options.map(() => 0);
  let ballots = 0;
  for (const r of results || []) {
    let sel = [];
    try {
      sel = JSON.parse(r.selections);
    } catch {
      sel = [];
    }
    ballots++;
    for (const i of sel) if (counts[i] !== undefined) counts[i]++;
  }
  const eligible = await eligiblePopulation(env, poll.eligible_years);
  const participation = await env.DB.prepare(
    `SELECT u.year_group AS y, COUNT(*) AS n
       FROM ${poll.voting_mode === 'anonymous' ? 'poll_participation' : 'votes'} v
       JOIN users u ON u.id = v.user_id
      WHERE v.poll_id = ? GROUP BY u.year_group ORDER BY u.year_group`
  )
    .bind(poll.id)
    .all();
  const byYear = (participation.results || []).map((r) => ({ year: r.y, votes: r.n }));
  return {
    pollId: poll.id,
    totalVotes: ballots,
    eligibleVoters: eligible,
    participationRate: pct(ballots, eligible),
    options: options.map((label, i) => ({
      index: i,
      label,
      votes: counts[i],
      percent: ballots ? Math.round((counts[i] / ballots) * 1000) / 10 : 0,
    })),
    byYear,
    votingMode: poll.voting_mode,
    computedAt: now(),
  };
}

/* ------------------------------------------------------------------ */
/* Auth routes                                                         */
/* ------------------------------------------------------------------ */

on('GET', '/api/bootstrap/status', guard(async (request, env) => {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
  return json({ needsBootstrap: (row?.n || 0) === 0 });
}));

on('POST', '/api/bootstrap', guard(async (request, env) => {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
  if ((row?.n || 0) > 0) return fail('This platform has already been set up.', 409);
  const b = await body(request);
  const name = str(b.name, 120);
  const email = str(b.email, 200).toLowerCase();
  const password = str(b.password, 200);
  if (!name || !isEmail(email)) return fail('Enter your name and a valid email address.');
  if (password.length < 10) return fail('Choose a password of at least 10 characters.');
  const id = uid('u_');
  await env.DB.prepare(
    `INSERT INTO users (id, name, email, year_group, role, status, password_hash, permissions, created_at)
     VALUES (?, ?, ?, NULL, 'admin', 'active', ?, '[]', ?)`
  )
    .bind(id, name, email, await hashPassword(password), now())
    .run();
  const session = await createSession(env, id);
  await audit(env, { id, name }, 'account.bootstrap', 'user', id, 'Initial administrator account created');
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  return json({ user: publicUser(user) }, 200, { 'set-cookie': session.cookie });
}));

on('POST', '/api/auth/register', guard(async (request, env) => {
  const settings = await getSettings(env);
  const b = await body(request);
  const name = str(b.name, 120);
  const email = str(b.email, 200).toLowerCase();
  const password = str(b.password, 200);
  const role = b.role === 'teacher' ? 'teacher' : 'student';
  if (!rateLimit(`reg:${request.headers.get('CF-Connecting-IP') || 'x'}`, 10, 60000))
    return fail('Too many attempts. Please wait a minute and try again.', 429);
  if (!name || name.length < 2) return fail('Enter your full name.');
  if (!isEmail(email)) return fail('Enter a valid email address.');
  if (password.length < 8) return fail('Choose a password of at least 8 characters.');

  let yearGroup = null;
  if (role === 'student') {
    const domain = (settings.student_email_domain || 'student.amigs.uk').toLowerCase();
    if (!email.endsWith('@' + domain))
      return fail(`Student accounts must use a verified school address ending in @${domain}.`);
    yearGroup = clampInt(b.yearGroup, 7, 11, 0);
    if (!YEARS.includes(yearGroup)) return fail('Select your year group (Years 7 to 11).');
  } else {
    const code = str(b.inviteCode, 60);
    if (!settings.staff_invite_code || code !== settings.staff_invite_code)
      return fail('A valid staff invite code is required to create a staff account.');
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return fail('An account already exists for that email address.', 409);

  const id = uid('u_');
  await env.DB.prepare(
    `INSERT INTO users (id, name, email, year_group, role, status, password_hash, permissions, created_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, '[]', ?)`
  )
    .bind(id, name, email, yearGroup, role, await hashPassword(password), now())
    .run();
  const session = await createSession(env, id);
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  await notify(env, id, 'welcome', 'Welcome to AMIGS Voice. Explore petitions and polls to make your voice heard.', '#/home');
  return json({ user: publicUser(user) }, 200, { 'set-cookie': session.cookie });
}));

on('POST', '/api/auth/login', guard(async (request, env) => {
  const b = await body(request);
  const email = str(b.email, 200).toLowerCase();
  const password = str(b.password, 200);
  const ip = request.headers.get('CF-Connecting-IP') || 'x';
  if (!rateLimit(`login:${ip}:${email}`, 8, 60000))
    return fail('Too many sign-in attempts. Please wait a minute and try again.', 429);
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!user || !(await verifyPassword(password, user.password_hash)))
    return fail('Incorrect email address or password.', 401);
  if (user.status !== 'active') return fail('This account has been suspended. Please contact the school office.', 403);
  await env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(now(), user.id).run();
  const session = await createSession(env, user.id);
  return json({ user: publicUser(user) }, 200, { 'set-cookie': session.cookie });
}));

on('POST', '/api/auth/logout', guard(async (request, env) => {
  const cookie = await destroySession(request, env);
  return json({ ok: true }, 200, { 'set-cookie': cookie });
}));

on('GET', '/api/me', guard(async (request, env) => {
  const user = await auth(request, env);
  const settings = await getSettings(env);
  const unread = user
    ? (await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0').bind(user.id).first())?.n || 0
    : 0;
  return json({
    user: publicUser(user),
    unread,
    settings: {
      schoolName: settings.school_name,
      platformName: settings.platform_name,
      tagline: settings.tagline,
      announcement: settings.announcement,
      studentEmailDomain: settings.student_email_domain,
      authorDisplay: settings.author_display,
      allowWithdrawal: settings.allow_signature_withdrawal === '1',
      categories: CATEGORIES,
      years: YEARS,
    },
  });
}));

/* ------------------------------------------------------------------ */
/* Student dashboard                                                   */
/* ------------------------------------------------------------------ */

on('GET', '/api/dashboard', guard(async (request, env) => {
  const user = await requireUser(request, env);
  const settings = await getSettings(env);
  await refreshStatuses(env);

  const activePetitions = (await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM petitions WHERE status IN ('approved','under_consideration')"
  ).first())?.n || 0;
  const openPolls = (await env.DB.prepare("SELECT COUNT(*) AS n FROM polls WHERE status = 'open'").first())?.n || 0;
  const mySignatures = (await env.DB.prepare('SELECT COUNT(*) AS n FROM signatures WHERE user_id = ?').bind(user.id).first())?.n || 0;
  const myVotes = (await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM votes WHERE user_id = ?) + (SELECT COUNT(*) FROM poll_participation WHERE user_id = ?) AS n`
  ).bind(user.id, user.id).first())?.n || 0;

  const featured = await env.DB.prepare(
    `${PETITION_SELECT} WHERE p.status IN ('approved','under_consideration') AND p.featured = 1 ORDER BY p.created_at DESC LIMIT 3`
  ).all();
  const featuredRows = featured.results?.length
    ? featured.results
    : (await env.DB.prepare(
        `${PETITION_SELECT} WHERE p.status IN ('approved','under_consideration') ORDER BY signatures DESC LIMIT 3`
      ).all()).results || [];

  const polls = await env.DB.prepare(
    "SELECT * FROM polls WHERE status IN ('open','scheduled') ORDER BY opens_at ASC LIMIT 4"
  ).all();

  const responses = await env.DB.prepare(
    `SELECT r.*, p.title FROM official_responses r JOIN petitions p ON p.id = r.petition_id
      ORDER BY r.created_at DESC LIMIT 4`
  ).all();

  const closing = await env.DB.prepare(
    `SELECT p.id, p.title, p.closing_at, p.status,
            (SELECT COUNT(*) FROM signatures s WHERE s.petition_id = p.id) AS signatures, p.target
       FROM petitions p
      WHERE p.status IN ('approved','under_consideration') AND p.closing_at IS NOT NULL
      ORDER BY p.closing_at ASC LIMIT 4`
  ).all();

  return json({
    stats: { activePetitions, openPolls, mySignatures, myVotes },
    featured: await Promise.all(featuredRows.map((r) => petitionView(env, r, user, settings))),
    polls: await Promise.all((polls.results || []).map((r) => pollView(env, r, user))),
    responses: (responses.results || []).map((r) => ({
      id: r.id, petitionId: r.petition_id, title: r.title, status: r.status,
      message: r.message, department: r.department, createdAt: r.created_at,
    })),
    closingSoon: closing.results || [],
    announcement: settings.announcement || '',
  });
}));

/* ------------------------------------------------------------------ */
/* Petitions                                                           */
/* ------------------------------------------------------------------ */

on('GET', '/api/petitions', guard(async (request, env, url) => {
  const user = await auth(request, env);
  const settings = await getSettings(env);
  await refreshStatuses(env);
  const q = str(url.searchParams.get('q') || '', 100);
  const status = url.searchParams.get('status') || '';
  const category = url.searchParams.get('category') || '';
  const year = url.searchParams.get('year') || '';
  const sort = url.searchParams.get('sort') || 'popular';
  const mine = url.searchParams.get('mine') === '1';

  const where = [];
  const binds = [];
  if (!user || user.role === 'student') {
    where.push("p.status IN ('approved','under_consideration','closed')");
  }
  if (status) {
    where.push('p.status = ?');
    binds.push(status);
  }
  if (category) {
    where.push('p.category = ?');
    binds.push(category);
  }
  if (q) {
    where.push('(p.title LIKE ? OR p.description LIKE ? OR p.reason LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (mine && user) {
    where.push('p.author_id = ?');
    binds.push(user.id);
  }
  const sql = `${PETITION_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} LIMIT 200`;
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  let rows = results || [];
  if (year) rows = rows.filter((r) => parseYears(r.eligible_years).includes(Number(year)));

  const order = {
    popular: (a, b) => b.signatures - a.signatures,
    recent: (a, b) => (a.created_at < b.created_at ? 1 : -1),
    closing: (a, b) => {
      const av = a.closing_at || '9999';
      const bv = b.closing_at || '9999';
      return av < bv ? -1 : 1;
    },
    oldest: (a, b) => (a.created_at > b.created_at ? 1 : -1),
  }[sort] || ((a, b) => b.signatures - a.signatures);
  rows.sort(order);

  return json({ petitions: await Promise.all(rows.map((r) => petitionView(env, r, user, settings))) });
}));

on('POST', '/api/petitions', guard(async (request, env) => {
  const user = await requireUser(request, env);
  if (user.role !== 'student') return fail('Only student accounts can start petitions.', 403);
  if (!rateLimit(`petition:${user.id}`, 3, 3600000))
    return fail('You have submitted several petitions recently. Please try again later.', 429);
  const b = await body(request);
  const title = str(b.title, 140);
  const description = str(b.description, 4000);
  const reason = str(b.reason, 2000);
  const affected = str(b.affected, 500);
  const category = CATEGORIES.includes(b.category) ? b.category : 'General suggestions';
  const target = clampInt(b.target, 10, 5000, 100);
  const eligible = parseYears(b.eligibleYears);
  let image = null;
  if (typeof b.image === 'string' && b.image.startsWith('data:image/')) {
    if (b.image.length > 500000) return fail('That image is too large. Please use one under 350 KB.');
    image = b.image;
  }
  if (title.length < 8) return fail('Give your petition a clear title (at least 8 characters).');
  if (description.length < 40) return fail('Please explain your petition in at least 40 characters.');
  if (reason.length < 20) return fail('Please explain why this change matters.');
  if (!affected) return fail('Tell us who this change would affect.');

  const id = uid('p_');
  await env.DB.prepare(
    `INSERT INTO petitions (id, author_id, title, description, reason, affected, category, target,
       status, eligible_years, image, featured, created_at, closing_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 0, ?, ?)`
  )
    .bind(id, user.id, title, description, reason, affected, category, target, JSON.stringify(eligible), image, now(), addDays(60))
    .run();

  await notifyRole(env, 'admin', 'moderation', `New petition submitted: "${title}"`, `#/admin/petitions`);
  const teachers = await env.DB.prepare("SELECT id, permissions FROM users WHERE role = 'teacher' AND status = 'active'").all();
  for (const t of teachers.results || []) {
    if (hasPerm({ role: 'teacher', permissions: t.permissions }, 'moderate'))
      await notify(env, t.id, 'moderation', `New petition awaiting review: "${title}"`, '#/admin/petitions');
  }
  await notify(env, user.id, 'petition_submitted', 'Your petition has been submitted and is awaiting review.', `#/petitions/${id}`);
  await audit(env, user, 'petition.submit', 'petition', id, title);
  return json({ id, status: 'pending' }, 201);
}));

on('GET', '/api/petitions/:id', guard(async (request, env, url, { id }) => {
  const user = await auth(request, env);
  const settings = await getSettings(env);
  await refreshStatuses(env);
  const row = await env.DB.prepare(`${PETITION_SELECT} WHERE p.id = ?`).bind(id).first();
  if (!row) return fail('Petition not found.', 404);
  const isStaff = user && (user.role === 'admin' || user.role === 'teacher');
  if (!isStaff && !['approved', 'under_consideration', 'closed'].includes(row.status) && row.author_id !== user?.id)
    return fail('Petition not found.', 404);

  const petition = await petitionView(env, row, user, settings);
  const responses = await env.DB.prepare(
    'SELECT * FROM official_responses WHERE petition_id = ? ORDER BY created_at DESC'
  ).bind(id).all();
  const updates = await env.DB.prepare(
    'SELECT * FROM response_updates WHERE petition_id = ? ORDER BY created_at ASC'
  ).bind(id).all();
  const signers = await env.DB.prepare(
    `SELECT u.name, u.year_group, s.created_at FROM signatures s JOIN users u ON u.id = s.user_id
      WHERE s.petition_id = ? ORDER BY s.created_at DESC LIMIT 40`
  ).bind(id).all();

  return json({
    petition,
    responses: (responses.results || []).map((r) => ({
      id: r.id, status: r.status, message: r.message, department: r.department, createdAt: r.created_at,
    })),
    updates: (updates.results || []).map((r) => ({ id: r.id, message: r.message, createdAt: r.created_at })),
    recentSigners: (signers.results || []).map((s) => ({
      name: displayName(s, settings.author_display === 'full' ? 'full' : 'initials'),
      year: s.year_group,
      at: s.created_at,
    })),
  });
}));

on('POST', '/api/petitions/:id/sign', guard(async (request, env, url, { id }) => {
  const user = await requireUser(request, env);
  if (user.role !== 'student') return fail('Only student accounts can sign petitions.', 403);
  await refreshStatuses(env);
  const p = await env.DB.prepare('SELECT * FROM petitions WHERE id = ?').bind(id).first();
  if (!p) return fail('Petition not found.', 404);
  if (!['approved', 'under_consideration'].includes(p.status))
    return fail('This petition is not open for signatures.', 409);
  if (!isEligible(p.eligible_years, user.year_group))
    return fail('This petition is not open to your year group.', 403);
  const existing = await env.DB.prepare('SELECT id FROM signatures WHERE petition_id = ? AND user_id = ?')
    .bind(id, user.id)
    .first();
  if (existing) return fail('You have already signed this petition.', 409);

  await env.DB.prepare('INSERT INTO signatures (id, petition_id, user_id, created_at) VALUES (?, ?, ?, ?)')
    .bind(uid('s_'), id, user.id, now())
    .run();

  const count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM signatures WHERE petition_id = ?').bind(id).first())?.n || 0;
  if (count >= p.target && !p.target_notified) {
    await env.DB.prepare('UPDATE petitions SET target_notified = 1 WHERE id = ?').bind(id).run();
    await notifyRole(env, 'admin', 'target_reached', `"${p.title}" has reached its signature target and needs review.`, `#/admin/petitions`);
    await notify(env, p.author_id, 'target_reached', `Your petition "${p.title}" has reached its signature target.`, `#/petitions/${id}`);
  }
  return json({ signatures: count, progress: pct(count, p.target) });
}));

on('DELETE', '/api/petitions/:id/sign', guard(async (request, env, url, { id }) => {
  const user = await requireUser(request, env);
  const settings = await getSettings(env);
  if (settings.allow_signature_withdrawal !== '1')
    return fail('Signature withdrawal is currently disabled by the school.', 403);
  const p = await env.DB.prepare('SELECT * FROM petitions WHERE id = ?').bind(id).first();
  if (!p) return fail('Petition not found.', 404);
  if (!['approved', 'under_consideration'].includes(p.status))
    return fail('This petition is closed; signatures can no longer be withdrawn.', 409);
  const res = await env.DB.prepare('DELETE FROM signatures WHERE petition_id = ? AND user_id = ?').bind(id, user.id).run();
  if (!res.meta?.changes) return fail('You have not signed this petition.', 409);
  const count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM signatures WHERE petition_id = ?').bind(id).first())?.n || 0;
  return json({ signatures: count, progress: pct(count, p.target) });
}));

on('POST', '/api/petitions/:id/report', guard(async (request, env, url, { id }) => {
  const user = await requireUser(request, env);
  const b = await body(request);
  const reason = str(b.reason, 500);
  if (!reason) return fail('Tell us why you are reporting this content.');
  await env.DB.prepare(
    'INSERT INTO reports (id, target_type, target_id, reporter_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(uid('r_'), 'petition', id, user.id, reason, 'open', now())
    .run();
  await notifyRole(env, 'admin', 'report', 'A petition has been reported for moderation.', '#/admin/petitions');
  return json({ ok: true });
}));

/* ------------------------------------------------------------------ */
/* Polls                                                               */
/* ------------------------------------------------------------------ */

on('GET', '/api/polls', guard(async (request, env, url) => {
  const user = await auth(request, env);
  await refreshStatuses(env);
  const status = url.searchParams.get('status') || '';
  const q = str(url.searchParams.get('q') || '', 100);
  const where = [];
  const binds = [];
  if (!user || user.role === 'student') where.push("status IN ('open','closed')");
  if (status) {
    where.push('status = ?');
    binds.push(status);
  }
  if (q) {
    where.push('(title LIKE ? OR question LIKE ? OR description LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const { results } = await env.DB.prepare(
    `SELECT * FROM polls ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY
       CASE status WHEN 'open' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'closed' THEN 2 ELSE 3 END,
       closes_at ASC LIMIT 100`
  )
    .bind(...binds)
    .all();
  return json({ polls: await Promise.all((results || []).map((r) => pollView(env, r, user))) });
}));

on('GET', '/api/polls/:id', guard(async (request, env, url, { id }) => {
  const user = await auth(request, env);
  await refreshStatuses(env);
  const row = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(id).first();
  if (!row) return fail('Poll not found.', 404);
  const poll = await pollView(env, row, user);
  const canSee = resultsVisible(poll, user);
  return json({ poll, results: canSee ? await computeResults(env, row) : null });
}));

on('POST', '/api/polls/:id/vote', guard(async (request, env, url, { id }) => {
  const user = await requireUser(request, env);
  if (user.role !== 'student') return fail('Only student accounts can vote in polls.', 403);
  await refreshStatuses(env);
  const poll = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(id).first();
  if (!poll) return fail('Poll not found.', 404);
  if (poll.status !== 'open') return fail('This poll is not currently open for voting.', 409);
  if (!isEligible(poll.eligible_years, user.year_group)) return fail('This poll is not open to your year group.', 403);

  const options = JSON.parse(poll.options);
  const b = await body(request);
  let selections = Array.isArray(b.selections) ? b.selections.map(Number) : [Number(b.selection)];
  selections = [...new Set(selections.filter((n) => Number.isInteger(n) && n >= 0 && n < options.length))];
  if (!selections.length) return fail('Select an option before submitting your vote.');
  if (poll.type === 'multi') {
    if (selections.length > poll.max_choices) return fail(`You may select up to ${poll.max_choices} options.`);
  } else if (selections.length !== 1) {
    return fail('Please select exactly one option.');
  }

  const table = poll.voting_mode === 'anonymous' ? 'poll_participation' : 'votes';
  const existing = await env.DB.prepare(`SELECT 1 AS x FROM ${table} WHERE poll_id = ? AND user_id = ?`)
    .bind(id, user.id)
    .first();
  if (existing) return fail('You have already voted in this poll.', 409);

  if (poll.voting_mode === 'anonymous') {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO ballots (id, poll_id, selections, created_at) VALUES (?, ?, ?, ?)')
        .bind(uid('b_'), id, JSON.stringify(selections), now()),
      env.DB.prepare('INSERT INTO poll_participation (poll_id, user_id, created_at) VALUES (?, ?, ?)')
        .bind(id, user.id, now()),
    ]);
  } else {
    await env.DB.prepare('INSERT INTO votes (id, poll_id, user_id, selections, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(uid('v_'), id, user.id, JSON.stringify(selections), now())
      .run();
  }

  const fresh = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(id).first();
  const view = await pollView(env, fresh, user);
  return json({ ok: true, results: resultsVisible(view, user) ? await computeResults(env, fresh) : null });
}));

on('GET', '/api/polls/:id/results', guard(async (request, env, url, { id }) => {
  const user = await auth(request, env);
  await refreshStatuses(env);
  const row = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(id).first();
  if (!row) return fail('Poll not found.', 404);
  const poll = await pollView(env, row, user);
  if (!resultsVisible(poll, user)) return fail('Results for this poll have not been released yet.', 403);
  return json({ poll, results: await computeResults(env, row) });
}));

on('GET', '/api/results', guard(async (request, env) => {
  const user = await auth(request, env);
  await refreshStatuses(env);
  const { results } = await env.DB.prepare(
    "SELECT * FROM polls WHERE status = 'closed' ORDER BY closes_at DESC LIMIT 50"
  ).all();
  const out = [];
  for (const row of results || []) {
    const poll = await pollView(env, row, user);
    out.push({ poll, results: resultsVisible(poll, user) ? await computeResults(env, row) : null });
  }
  return json({ polls: out });
}));

/* ------------------------------------------------------------------ */
/* Activity, notifications, profile                                    */
/* ------------------------------------------------------------------ */

on('GET', '/api/activity', guard(async (request, env) => {
  const user = await requireUser(request, env);
  const settings = await getSettings(env);
  const myPetitions = await env.DB.prepare(`${PETITION_SELECT} WHERE p.author_id = ? ORDER BY p.created_at DESC`).bind(user.id).all();
  const signed = await env.DB.prepare(
    `SELECT p.*, u.name AS author_name, u.year_group AS author_year,
            (SELECT COUNT(*) FROM signatures s2 WHERE s2.petition_id = p.id) AS signatures, s.created_at AS signed_at
       FROM signatures s JOIN petitions p ON p.id = s.petition_id JOIN users u ON u.id = p.author_id
      WHERE s.user_id = ? ORDER BY s.created_at DESC`
  ).bind(user.id).all();
  const votes = await env.DB.prepare(
    `SELECT p.id, p.title, p.status, p.closes_at, v.created_at AS voted_at, 'identified' AS mode
       FROM votes v JOIN polls p ON p.id = v.poll_id WHERE v.user_id = ?
     UNION ALL
     SELECT p.id, p.title, p.status, p.closes_at, pp.created_at AS voted_at, 'anonymous' AS mode
       FROM poll_participation pp JOIN polls p ON p.id = pp.poll_id WHERE pp.user_id = ?
     ORDER BY voted_at DESC`
  ).bind(user.id, user.id).all();
  return json({
    petitions: await Promise.all((myPetitions.results || []).map((r) => petitionView(env, r, user, settings))),
    signed: await Promise.all((signed.results || []).map((r) => petitionView(env, r, user, settings))),
    votes: votes.results || [],
  });
}));

on('GET', '/api/notifications', guard(async (request, env) => {
  const user = await requireUser(request, env);
  const { results } = await env.DB.prepare(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100'
  ).bind(user.id).all();
  return json({
    notifications: (results || []).map((n) => ({
      id: n.id, type: n.type, message: n.message, link: n.link, read: !!n.read, createdAt: n.created_at,
    })),
  });
}));

on('POST', '/api/notifications/read', guard(async (request, env) => {
  const user = await requireUser(request, env);
  const b = await body(request);
  if (b.id) await env.DB.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').bind(b.id, user.id).run();
  else await env.DB.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').bind(user.id).run();
  return json({ ok: true });
}));

on('PATCH', '/api/profile', guard(async (request, env) => {
  const user = await requireUser(request, env);
  const b = await body(request);
  const name = str(b.name, 120);
  if (name && name.length >= 2) await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, user.id).run();
  if (b.newPassword) {
    const current = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first();
    if (!(await verifyPassword(str(b.currentPassword, 200), current.password_hash)))
      return fail('Your current password is incorrect.', 403);
    if (str(b.newPassword, 200).length < 8) return fail('Choose a password of at least 8 characters.');
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(await hashPassword(str(b.newPassword, 200)), user.id)
      .run();
  }
  const fresh = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
  return json({ user: publicUser(fresh) });
}));

/* ------------------------------------------------------------------ */
/* Admin — overview & analytics                                        */
/* ------------------------------------------------------------------ */

on('GET', '/api/admin/overview', guard(async (request, env) => {
  await requireStaff(request, env);
  await refreshStatuses(env);
  const one = async (sql, ...binds) => (await env.DB.prepare(sql).bind(...binds).first())?.n || 0;
  const totalStudents = await one("SELECT COUNT(*) AS n FROM users WHERE role = 'student'");
  const totalStaff = await one("SELECT COUNT(*) AS n FROM users WHERE role IN ('teacher','admin')");
  const pending = await one("SELECT COUNT(*) AS n FROM petitions WHERE status = 'pending'");
  const approved = await one("SELECT COUNT(*) AS n FROM petitions WHERE status IN ('approved','under_consideration')");
  const rejected = await one("SELECT COUNT(*) AS n FROM petitions WHERE status = 'rejected'");
  const totalPetitions = await one('SELECT COUNT(*) AS n FROM petitions');
  const activePolls = await one("SELECT COUNT(*) AS n FROM polls WHERE status = 'open'");
  const closedPolls = await one("SELECT COUNT(*) AS n FROM polls WHERE status = 'closed'");
  const totalSignatures = await one('SELECT COUNT(*) AS n FROM signatures');
  const totalVotes = await one('SELECT (SELECT COUNT(*) FROM votes) + (SELECT COUNT(*) FROM ballots) AS n');

  const eligible = await one("SELECT COUNT(*) AS n FROM users WHERE role = 'student' AND status = 'active'");
  const signers = await one('SELECT COUNT(DISTINCT user_id) AS n FROM signatures');
  const voters = await one(
    'SELECT COUNT(*) AS n FROM (SELECT user_id FROM votes UNION SELECT user_id FROM poll_participation)'
  );

  const byStatus = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM petitions GROUP BY status').all();
  const byCategory = await env.DB.prepare('SELECT category, COUNT(*) AS n FROM petitions GROUP BY category ORDER BY n DESC').all();
  const byYear = await env.DB.prepare(
    "SELECT year_group AS year, COUNT(*) AS n FROM users WHERE role = 'student' GROUP BY year_group ORDER BY year_group"
  ).all();
  const signupTrend = await env.DB.prepare(
    "SELECT substr(created_at,1,10) AS day, COUNT(*) AS n FROM signatures WHERE created_at >= ? GROUP BY day ORDER BY day"
  ).bind(addDays(-14)).all();
  const pollParticipation = await env.DB.prepare(
    `SELECT p.id, p.title, p.status,
            (SELECT COUNT(*) FROM votes v WHERE v.poll_id = p.id) +
            (SELECT COUNT(*) FROM ballots b WHERE b.poll_id = p.id) AS votes
       FROM polls p ORDER BY p.created_at DESC LIMIT 8`
  ).all();

  return json({
    stats: {
      totalStudents, totalStaff, totalPetitions, pending, approved, rejected,
      activePolls, closedPolls, totalSignatures, totalVotes,
      signatureParticipation: pct(signers, eligible),
      votingParticipation: pct(voters, eligible),
    },
    byStatus: byStatus.results || [],
    byCategory: byCategory.results || [],
    byYear: byYear.results || [],
    signupTrend: signupTrend.results || [],
    pollParticipation: pollParticipation.results || [],
  });
}));

/* ------------------------------------------------------------------ */
/* Admin — petitions                                                   */
/* ------------------------------------------------------------------ */

on('GET', '/api/admin/petitions', guard(async (request, env, url) => {
  await requireStaff(request, env);
  const settings = await getSettings(env);
  const status = url.searchParams.get('status') || '';
  const q = str(url.searchParams.get('q') || '', 100);
  const where = [];
  const binds = [];
  if (status) {
    where.push('p.status = ?');
    binds.push(status);
  }
  if (q) {
    where.push('(p.title LIKE ? OR p.description LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`);
  }
  const { results } = await env.DB.prepare(
    `${PETITION_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY
       CASE p.status WHEN 'pending' THEN 0 ELSE 1 END, p.created_at DESC LIMIT 300`
  )
    .bind(...binds)
    .all();
  const reports = await env.DB.prepare("SELECT * FROM reports WHERE status = 'open' ORDER BY created_at DESC").all();
  return json({
    petitions: await Promise.all((results || []).map((r) => petitionView(env, r, null, settings))),
    reports: reports.results || [],
  });
}));

on('PATCH', '/api/admin/petitions/:id', guard(async (request, env, url, { id }) => {
  const staff = await requireStaff(request, env, 'moderate');
  const b = await body(request);
  const p = await env.DB.prepare('SELECT * FROM petitions WHERE id = ?').bind(id).first();
  if (!p) return fail('Petition not found.', 404);
  const sets = [];
  const binds = [];

  if (b.status) {
    const allowed = ['pending', 'approved', 'rejected', 'under_consideration', 'closed'];
    if (!allowed.includes(b.status)) return fail('Unknown status.');
    sets.push('status = ?', 'moderated_by = ?', 'moderated_at = ?');
    binds.push(b.status, staff.id, now());
    if (b.status === 'rejected') {
      const note = str(b.note, 1000);
      if (!note) return fail('Please give a reason when rejecting a petition.');
      sets.push('moderation_note = ?');
      binds.push(note);
      await notify(env, p.author_id, 'petition_rejected', `Your petition "${p.title}" was not approved. Reason: ${note}`, `#/petitions/${id}`);
    } else if (b.status === 'approved') {
      await notify(env, p.author_id, 'petition_approved', `Your petition "${p.title}" has been approved and is now live.`, `#/petitions/${id}`);
      const students = await env.DB.prepare(
        "SELECT id, year_group FROM users WHERE role = 'student' AND status = 'active'"
      ).all();
      for (const s of students.results || []) {
        if (isEligible(p.eligible_years, s.year_group))
          await notify(env, s.id, 'petition_new', `New petition: "${p.title}"`, `#/petitions/${id}`);
      }
    } else if (b.status === 'closed') {
      sets.push('closed_at = ?');
      binds.push(now());
      await notify(env, p.author_id, 'petition_closed', `Your petition "${p.title}" has been closed.`, `#/petitions/${id}`);
    }
  }
  if (b.featured !== undefined) {
    sets.push('featured = ?');
    binds.push(b.featured ? 1 : 0);
  }
  if (b.title) {
    sets.push('title = ?');
    binds.push(str(b.title, 140));
  }
  if (b.description) {
    sets.push('description = ?');
    binds.push(str(b.description, 4000));
  }
  if (b.target) {
    sets.push('target = ?');
    binds.push(clampInt(b.target, 10, 5000, p.target));
  }
  if (b.eligibleYears) {
    sets.push('eligible_years = ?');
    binds.push(JSON.stringify(parseYears(b.eligibleYears)));
  }
  if (b.closingAt !== undefined) {
    sets.push('closing_at = ?');
    binds.push(b.closingAt ? new Date(b.closingAt).toISOString() : null);
  }
  if (!sets.length) return fail('Nothing to update.');
  binds.push(id);
  await env.DB.prepare(`UPDATE petitions SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  await audit(env, staff, 'petition.update', 'petition', id, JSON.stringify({ status: b.status, featured: b.featured, title: b.title }));
  return json({ ok: true });
}));

on('DELETE', '/api/admin/petitions/:id', guard(async (request, env, url, { id }) => {
  const staff = await requireStaff(request, env, 'moderate');
  if (staff.role !== 'admin') return fail('Only administrators can delete submissions.', 403);
  const p = await env.DB.prepare('SELECT title FROM petitions WHERE id = ?').bind(id).first();
  if (!p) return fail('Petition not found.', 404);
  await env.DB.prepare('DELETE FROM petitions WHERE id = ?').bind(id).run();
  await audit(env, staff, 'petition.delete', 'petition', id, p.title);
  return json({ ok: true });
}));

on('POST', '/api/admin/petitions/:id/response', guard(async (request, env, url, { id }) => {
  const staff = await requireStaff(request, env, 'moderate');
  const b = await body(request);
  const p = await env.DB.prepare('SELECT * FROM petitions WHERE id = ?').bind(id).first();
  if (!p) return fail('Petition not found.', 404);
  const statuses = ['accepted', 'under_consideration', 'rejected', 'already_planned', 'more_info'];
  if (!statuses.includes(b.status)) return fail('Choose a valid response type.');
  const message = str(b.message, 4000);
  const department = str(b.department, 160);
  if (message.length < 20) return fail('Please write a response of at least 20 characters.');
  if (!department) return fail('State the responsible department or staff role.');
  const rid = uid('or_');
  await env.DB.prepare(
    'INSERT INTO official_responses (id, petition_id, status, message, department, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(rid, id, b.status, message, department, staff.id, now())
    .run();
  const newStatus = b.status === 'accepted' || b.status === 'already_planned' ? 'under_consideration' : p.status;
  await env.DB.prepare('UPDATE petitions SET status = ? WHERE id = ?').bind(newStatus, id).run();
  await notify(env, p.author_id, 'official_response', `The school has responded to your petition "${p.title}".`, `#/petitions/${id}`);
  await audit(env, staff, 'petition.response', 'petition', id, `${b.status} — ${department}`);
  return json({ id: rid });
}));

on('POST', '/api/admin/petitions/:id/updates', guard(async (request, env, url, { id }) => {
  const staff = await requireStaff(request, env, 'moderate');
  const b = await body(request);
  const message = str(b.message, 2000);
  if (message.length < 10) return fail('Write an update of at least 10 characters.');
  const p = await env.DB.prepare('SELECT * FROM petitions WHERE id = ?').bind(id).first();
  if (!p) return fail('Petition not found.', 404);
  await env.DB.prepare(
    'INSERT INTO response_updates (id, petition_id, message, created_by, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(uid('ru_'), id, message, staff.id, now())
    .run();
  await notify(env, p.author_id, 'official_update', `A follow-up update was posted on "${p.title}".`, `#/petitions/${id}`);
  await audit(env, staff, 'petition.update_post', 'petition', id, message.slice(0, 120));
  return json({ ok: true });
}));

/* ------------------------------------------------------------------ */
/* Admin — polls                                                       */
/* ------------------------------------------------------------------ */

on('GET', '/api/admin/polls', guard(async (request, env) => {
  await requireStaff(request, env);
  await refreshStatuses(env);
  const { results } = await env.DB.prepare('SELECT * FROM polls ORDER BY created_at DESC LIMIT 200').all();
  const polls = [];
  for (const row of results || []) {
    const view = await pollView(env, row, null);
    polls.push({ ...view, results: await computeResults(env, row) });
  }
  return json({ polls });
}));

on('POST', '/api/admin/polls', guard(async (request, env) => {
  const staff = await requireStaff(request, env, 'create_polls');
  const b = await body(request);
  const title = str(b.title, 160);
  const question = str(b.question, 400);
  const description = str(b.description, 2000);
  let options = Array.isArray(b.options) ? b.options.map((o) => str(o, 200)).filter(Boolean) : [];
  const type = ['single', 'multi', 'yesno'].includes(b.type) ? b.type : 'single';
  if (type === 'yesno') options = ['Yes', 'No'];
  if (title.length < 5) return fail('Give the poll a title.');
  if (question.length < 5) return fail('Enter the poll question.');
  if (options.length < 2) return fail('Provide at least two answer options.');
  if (options.length > 12) return fail('A poll can have at most 12 options.');
  const opensAt = b.opensAt ? new Date(b.opensAt) : new Date();
  const closesAt = b.closesAt ? new Date(b.closesAt) : new Date(Date.now() + 7 * 86400000);
  if (isNaN(opensAt) || isNaN(closesAt)) return fail('Check the opening and closing dates.');
  if (closesAt <= opensAt) return fail('The closing date must be after the opening date.');
  const maxChoices = type === 'multi' ? clampInt(b.maxChoices, 2, options.length, 2) : 1;
  const eligible = parseYears(b.eligibleYears);
  const votingMode = b.votingMode === 'identified' ? 'identified' : 'anonymous';
  const visibility = ['always', 'after_vote', 'after_close', 'after_release'].includes(b.resultsVisibility)
    ? b.resultsVisibility
    : 'after_close';
  const releaseAt = visibility === 'after_release' && b.resultsReleaseAt ? new Date(b.resultsReleaseAt).toISOString() : null;
  const status = opensAt <= new Date() ? 'open' : 'scheduled';

  const id = uid('pl_');
  await env.DB.prepare(
    `INSERT INTO polls (id, creator_id, title, description, question, options, type, max_choices, eligible_years,
       opens_at, closes_at, results_visibility, results_release_at, voting_mode, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, staff.id, title, description, question, JSON.stringify(options), type, maxChoices,
      JSON.stringify(eligible), opensAt.toISOString(), closesAt.toISOString(), visibility, releaseAt, votingMode, status, now())
    .run();

  if (status === 'open') {
    const students = await env.DB.prepare("SELECT id, year_group FROM users WHERE role = 'student' AND status = 'active'").all();
    for (const s of students.results || []) {
      if (isEligible(JSON.stringify(eligible), s.year_group))
        await notify(env, s.id, 'poll_new', `New poll: "${title}"`, `#/polls/${id}`);
    }
  }
  await audit(env, staff, 'poll.create', 'poll', id, `${title} (${votingMode})`);
  return json({ id, status }, 201);
}));

on('PATCH', '/api/admin/polls/:id', guard(async (request, env, url, { id }) => {
  const staff = await requireStaff(request, env, 'create_polls');
  const b = await body(request);
  const poll = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(id).first();
  if (!poll) return fail('Poll not found.', 404);
  const sets = [];
  const binds = [];
  if (b.status) {
    if (!['scheduled', 'open', 'closed', 'cancelled'].includes(b.status)) return fail('Unknown poll status.');
    sets.push('status = ?');
    binds.push(b.status);
    if (b.status === 'open') {
      const students = await env.DB.prepare("SELECT id, year_group FROM users WHERE role = 'student' AND status = 'active'").all();
      for (const s of students.results || []) {
        if (isEligible(poll.eligible_years, s.year_group))
          await notify(env, s.id, 'poll_new', `Poll now open: "${poll.title}"`, `#/polls/${id}`);
      }
    }
    if (b.status === 'closed') {
      await notify(env, poll.creator_id, 'poll_closed', `Poll "${poll.title}" has been closed.`, `#/admin/polls`);
    }
  }
  if (b.title) { sets.push('title = ?'); binds.push(str(b.title, 160)); }
  if (b.question) { sets.push('question = ?'); binds.push(str(b.question, 400)); }
  if (b.description !== undefined) { sets.push('description = ?'); binds.push(str(b.description, 2000)); }
  if (Array.isArray(b.options) && b.options.length >= 2) {
    sets.push('options = ?');
    binds.push(JSON.stringify(b.options.map((o) => str(o, 200)).filter(Boolean)));
  }
  if (b.closesAt) { sets.push('closes_at = ?'); binds.push(new Date(b.closesAt).toISOString()); }
  if (b.opensAt) { sets.push('opens_at = ?'); binds.push(new Date(b.opensAt).toISOString()); }
  if (b.eligibleYears) { sets.push('eligible_years = ?'); binds.push(JSON.stringify(parseYears(b.eligibleYears))); }
  if (b.resultsVisibility) { sets.push('results_visibility = ?'); binds.push(b.resultsVisibility); }
  if (!sets.length) return fail('Nothing to update.');
  binds.push(id);
  await env.DB.prepare(`UPDATE polls SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  await audit(env, staff, 'poll.update', 'poll', id, JSON.stringify({ status: b.status, title: b.title }));
  return json({ ok: true });
}));

on('DELETE', '/api/admin/polls/:id', guard(async (request, env, url, { id }) => {
  const staff = await requireStaff(request, env, 'create_polls');
  if (staff.role !== 'admin') return fail('Only administrators can delete polls.', 403);
  const poll = await env.DB.prepare('SELECT title FROM polls WHERE id = ?').bind(id).first();
  if (!poll) return fail('Poll not found.', 404);
  await env.DB.prepare('DELETE FROM polls WHERE id = ?').bind(id).run();
  await audit(env, staff, 'poll.delete', 'poll', id, poll.title);
  return json({ ok: true });
}));

/* ------------------------------------------------------------------ */
/* Admin — users                                                       */
/* ------------------------------------------------------------------ */

on('GET', '/api/admin/users', guard(async (request, env, url) => {
  const staff = await requireStaff(request, env);
  const q = str(url.searchParams.get('q') || '', 100);
  const year = url.searchParams.get('year') || '';
  const role = url.searchParams.get('role') || '';
  const where = [];
  const binds = [];
  if (q) {
    where.push('(name LIKE ? OR email LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`);
  }
  if (year) { where.push('year_group = ?'); binds.push(Number(year)); }
  if (role) { where.push('role = ?'); binds.push(role); }
  const { results } = await env.DB.prepare(
    `SELECT id, name, email, year_group, role, status, permissions, created_at, last_login_at
       FROM users ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY role, year_group, name LIMIT 500`
  )
    .bind(...binds)
    .all();
  const showEmails = staff.role === 'admin' || hasPerm(staff, 'view_identities');
  return json({
    users: (results || []).map((u) => ({
      id: u.id,
      name: u.name,
      email: showEmails ? u.email : u.email.replace(/^(.).*@/, '$1***@'),
      yearGroup: u.year_group,
      role: u.role,
      status: u.status,
      permissions: (() => { try { return JSON.parse(u.permissions || '[]'); } catch { return []; } })(),
      createdAt: u.created_at,
      lastLoginAt: u.last_login_at,
    })),
    canManage: staff.role === 'admin',
  });
}));

on('POST', '/api/admin/users', guard(async (request, env) => {
  const staff = await requireStaff(request, env);
  if (staff.role !== 'admin') return fail('Only administrators can create staff accounts.', 403);
  const b = await body(request);
  const name = str(b.name, 120);
  const email = str(b.email, 200).toLowerCase();
  const password = str(b.password, 200);
  const role = ['student', 'teacher', 'admin'].includes(b.role) ? b.role : 'student';
  if (!name || !isEmail(email)) return fail('Enter a name and valid email address.');
  if (password.length < 8) return fail('Set a password of at least 8 characters.');
  const yearGroup = role === 'student' ? clampInt(b.yearGroup, 7, 11, 0) : null;
  if (role === 'student' && !YEARS.includes(yearGroup)) return fail('Select a valid year group.');
  if (await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first())
    return fail('An account already exists for that email address.', 409);
  const id = uid('u_');
  const perms = Array.isArray(b.permissions) ? b.permissions.filter((p) => ['moderate', 'create_polls', 'view_identities', 'export'].includes(p)) : [];
  await env.DB.prepare(
    `INSERT INTO users (id, name, email, year_group, role, status, password_hash, permissions, created_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`
  )
    .bind(id, name, email, yearGroup, role, await hashPassword(password), JSON.stringify(perms), now())
    .run();
  await audit(env, staff, 'user.create', 'user', id, `${role}: ${email}`);
  return json({ id }, 201);
}));

on('PATCH', '/api/admin/users/:id', guard(async (request, env, url, { id }) => {
  const staff = await requireStaff(request, env);
  if (staff.role !== 'admin') return fail('Only administrators can change accounts.', 403);
  const b = await body(request);
  const target = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!target) return fail('Account not found.', 404);
  const sets = [];
  const binds = [];
  if (b.status) {
    if (!['active', 'suspended'].includes(b.status)) return fail('Unknown account status.');
    if (id === staff.id && b.status === 'suspended') return fail('You cannot suspend your own account.');
    sets.push('status = ?');
    binds.push(b.status);
  }
  if (b.role) {
    if (!['student', 'teacher', 'admin'].includes(b.role)) return fail('Unknown role.');
    sets.push('role = ?');
    binds.push(b.role);
  }
  if (b.yearGroup !== undefined && target.role === 'student') {
    sets.push('year_group = ?');
    binds.push(clampInt(b.yearGroup, 7, 11, target.year_group));
  }
  if (Array.isArray(b.permissions)) {
    sets.push('permissions = ?');
    binds.push(JSON.stringify(b.permissions.filter((p) => ['moderate', 'create_polls', 'view_identities', 'export'].includes(p))));
  }
  if (!sets.length) return fail('Nothing to update.');
  binds.push(id);
  await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  await audit(env, staff, 'user.update', 'user', id, JSON.stringify({ status: b.status, role: b.role, permissions: b.permissions }));
  return json({ ok: true });
}));

/* ------------------------------------------------------------------ */
/* Admin — audit, settings, exports                                    */
/* ------------------------------------------------------------------ */

on('GET', '/api/admin/audit', guard(async (request, env, url) => {
  await requireStaff(request, env);
  const q = str(url.searchParams.get('q') || '', 100);
  const { results } = await env.DB.prepare(
    `SELECT * FROM audit_log ${q ? 'WHERE action LIKE ? OR actor_name LIKE ? OR details LIKE ?' : ''}
      ORDER BY created_at DESC LIMIT 300`
  )
    .bind(...(q ? [`%${q}%`, `%${q}%`, `%${q}%`] : []))
    .all();
  return json({ entries: results || [] });
}));

on('GET', '/api/admin/settings', guard(async (request, env) => {
  const staff = await requireStaff(request, env);
  if (staff.role !== 'admin') return fail('Only administrators can view platform settings.', 403);
  return json({ settings: await getSettings(env) });
}));

on('PATCH', '/api/admin/settings', guard(async (request, env) => {
  const staff = await requireStaff(request, env);
  if (staff.role !== 'admin') return fail('Only administrators can change settings.', 403);
  const b = await body(request);
  const allowed = ['school_name', 'platform_name', 'tagline', 'student_email_domain', 'staff_invite_code',
    'author_display', 'allow_signature_withdrawal', 'announcement', 'retention_days', 'safeguarding_contact'];
  for (const key of allowed) {
    if (b[key] !== undefined) await setSetting(env, key, str(String(b[key]), 2000));
  }
  await audit(env, staff, 'settings.update', 'settings', 'global', Object.keys(b).join(', '));
  return json({ settings: await getSettings(env) });
}));

on('GET', '/api/export/petitions.csv', guard(async (request, env) => {
  const staff = await requireStaff(request, env, 'export');
  const { results } = await env.DB.prepare(
    `SELECT p.*, u.name AS author_name, u.year_group AS author_year,
            (SELECT COUNT(*) FROM signatures s WHERE s.petition_id = p.id) AS signatures
       FROM petitions p JOIN users u ON u.id = p.author_id ORDER BY p.created_at DESC`
  ).all();
  const content = csv(results || [], [
    { label: 'ID', get: (r) => r.id },
    { label: 'Title', get: (r) => r.title },
    { label: 'Category', get: (r) => r.category },
    { label: 'Status', get: (r) => r.status },
    { label: 'Author', get: (r) => r.author_name },
    { label: 'Year group', get: (r) => r.author_year },
    { label: 'Signatures', get: (r) => r.signatures },
    { label: 'Target', get: (r) => r.target },
    { label: 'Eligible years', get: (r) => parseYears(r.eligible_years).join(' / ') },
    { label: 'Created', get: (r) => r.created_at },
    { label: 'Closing', get: (r) => r.closing_at || '' },
  ]);
  await audit(env, staff, 'export.petitions', 'export', 'petitions.csv', '');
  return csvResponse('amigs-voice-petitions.csv', content);
}));

on('GET', '/api/export/poll/:id', guard(async (request, env, url, { id }) => {
  const staff = await requireStaff(request, env, 'export');
  const poll = await env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(id).first();
  if (!poll) return fail('Poll not found.', 404);
  const results = await computeResults(env, poll);
  const rows = results.options.map((o) => ({
    poll: poll.title, question: poll.question, option: o.label, votes: o.votes, percent: o.percent,
    total: results.totalVotes, participation: results.participationRate, mode: poll.voting_mode,
  }));
  const content = csv(rows, [
    { label: 'Poll', get: (r) => r.poll },
    { label: 'Question', get: (r) => r.question },
    { label: 'Option', get: (r) => r.option },
    { label: 'Votes', get: (r) => r.votes },
    { label: 'Percent', get: (r) => r.percent },
    { label: 'Total votes', get: (r) => r.total },
    { label: 'Participation %', get: (r) => r.participation },
    { label: 'Voting mode', get: (r) => r.mode },
  ]);
  await audit(env, staff, 'export.poll', 'poll', id, poll.title);
  return csvResponse(`amigs-voice-poll-${id}.csv`, content);
}));

on('GET', '/api/export/users.csv', guard(async (request, env) => {
  const staff = await requireStaff(request, env);
  if (staff.role !== 'admin') return fail('Only administrators can export account data.', 403);
  const { results } = await env.DB.prepare(
    'SELECT name, email, year_group, role, status, created_at, last_login_at FROM users ORDER BY role, year_group, name'
  ).all();
  const content = csv(results || [], [
    { label: 'Name', get: (r) => r.name },
    { label: 'School email', get: (r) => r.email },
    { label: 'Year group', get: (r) => r.year_group || '' },
    { label: 'Role', get: (r) => r.role },
    { label: 'Status', get: (r) => r.status },
    { label: 'Created', get: (r) => r.created_at },
    { label: 'Last sign-in', get: (r) => r.last_login_at || '' },
  ]);
  await audit(env, staff, 'export.users', 'export', 'users.csv', '');
  return csvResponse('amigs-voice-accounts.csv', content);
}));

on('GET', '/api/export/audit.csv', guard(async (request, env) => {
  const staff = await requireStaff(request, env);
  if (staff.role !== 'admin') return fail('Only administrators can export audit logs.', 403);
  const { results } = await env.DB.prepare('SELECT * FROM audit_log ORDER BY created_at DESC').all();
  const content = csv(results || [], [
    { label: 'Timestamp', get: (r) => r.created_at },
    { label: 'Administrator', get: (r) => r.actor_name },
    { label: 'Action', get: (r) => r.action },
    { label: 'Record type', get: (r) => r.target_type },
    { label: 'Record ID', get: (r) => r.target_id },
    { label: 'Details', get: (r) => r.details },
  ]);
  return csvResponse('amigs-voice-audit-log.csv', content);
}));

/* ------------------------------------------------------------------ */
/* Demo data (real rows, admin-triggered, clearly labelled)            */
/* ------------------------------------------------------------------ */

on('POST', '/api/admin/seed-demo', guard(async (request, env) => {
  const staff = await requireStaff(request, env);
  if (staff.role !== 'admin') return fail('Only administrators can load sample data.', 403);
  const existing = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE email LIKE '%@student.amigs.uk'").first();
  if ((existing?.n || 0) > 0) return fail('Sample data has already been loaded.', 409);

  const pw = await hashPassword('AmigsVoice2026!');
  const students = [
    ['Aisha Farwin', '23afarwin', 10], ['Daniel Okafor', '23dokafor', 9], ['Maya Patel', '23mpatel', 11],
    ['Leo Brennan', '23lbrennan', 8], ['Sofia Rossi', '23srossi', 7], ['Yusuf Ali', '23yali', 10],
    ['Grace Mensah', '23gmensah', 9], ['Ethan Clarke', '23eclarke', 11], ['Noor Haddad', '23nhaddad', 8],
    ['Ruby Whitfield', '23rwhitfield', 7],
  ];
  const ids = {};
  for (const [name, handle, year] of students) {
    const id = uid('u_');
    ids[handle] = id;
    await env.DB.prepare(
      `INSERT INTO users (id, name, email, year_group, role, status, password_hash, permissions, created_at)
       VALUES (?, ?, ?, ?, 'student', 'active', ?, '[]', ?)`
    ).bind(id, name, `${handle}@student.amigs.uk`, year, pw, addDays(-30)).run();
  }

  const petitions = [
    ['Introduce more extracurricular clubs', 'Extracurricular activities', 'approved', 1, 250,
      'We would like the school to run a wider range of after-school clubs, including debating, coding, chess and creative writing. Many students currently travel home immediately after lessons because the clubs on offer fill up quickly.',
      'A broader club programme would give students a constructive way to spend time after school and help them build skills beyond the curriculum.',
      'All students in Years 7 to 11, and staff who supervise clubs.'],
    ['Improve lunchtime activities in the main hall', 'Student wellbeing', 'approved', 0, 150,
      'The main hall is often crowded at lunchtime with little to do. We propose a rotating programme of table tennis, board games and quiet study space.',
      'Better lunchtime provision would reduce congestion and support students who prefer a calmer environment.',
      'Students who use the main hall at lunchtime.'],
    ['Add additional inter-school sports competitions', 'Sports', 'under_consideration', 0, 200,
      'We would like more competitive fixtures against other schools across football, netball, athletics and basketball.',
      'Regular competition builds team spirit and gives more students a reason to take part in sport.',
      'Students who represent the school and those who would like to.'],
    ['Refurbish the science laboratories', 'School facilities', 'pending', 0, 300,
      'Two of the science laboratories have equipment that is difficult to use safely and benches that are worn. We would like them refurbished.',
      'Practical science is a core part of the curriculum and safe, modern equipment benefits every student.',
      'All students studying science.'],
    ['Introduce a student enrichment afternoon', 'Education and enrichment', 'approved', 0, 180,
      'We propose one afternoon each half term dedicated to enrichment: guest speakers, workshops and student-led projects.',
      'Enrichment broadens the curriculum and helps students explore interests beyond examined subjects.',
      'All year groups.'],
  ];
  const pids = [];
  for (const [title, category, status, featured, target, description, reason, affected] of petitions) {
    const id = uid('p_');
    pids.push(id);
    const author = ids['23afarwin'];
    await env.DB.prepare(
      `INSERT INTO petitions (id, author_id, title, description, reason, affected, category, target, status,
         eligible_years, featured, created_at, closing_at, moderated_by, moderated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[7,8,9,10,11]', ?, ?, ?, ?, ?)`
    ).bind(id, author, title, description, reason, affected, category, target, status, featured,
      addDays(-14), addDays(46), staff.id, addDays(-13)).run();
    if (status !== 'pending') {
      const signers = Object.values(ids).slice(0, 4 + Math.floor(Math.random() * 5));
      for (const s of signers) {
        await env.DB.prepare('INSERT OR IGNORE INTO signatures (id, petition_id, user_id, created_at) VALUES (?, ?, ?, ?)')
          .bind(uid('s_'), id, s, addDays(-10)).run();
      }
    }
  }

  await env.DB.prepare(
    'INSERT INTO official_responses (id, petition_id, status, message, department, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(uid('or_'), pids[0], 'accepted',
    'Thank you for this proposal. The school has agreed to expand the after-school club programme from next term, with debating and coding clubs added first. A timetable will be published in the school bulletin.',
    'Deputy Head (Curriculum)', staff.id, addDays(-5)).run();

  const polls = [
    ['Which new club should launch first?', 'Extracurricular activities', 'single', ['Debating club', 'Coding club', 'Chess club', 'Creative writing'], 'open', 'anonymous', 5],
    ['Should the library open at break time?', 'School facilities', 'yesno', ['Yes', 'No'], 'open', 'anonymous', 3],
    ['Which sports should be added next year?', 'Sports', 'multi', ['Basketball', 'Athletics', 'Netball', 'Table tennis', 'Swimming'], 'closed', 'identified', -2],
  ];
  for (const [title, category, type, options, status, mode, dayOffset] of polls) {
    const id = uid('pl_');
    await env.DB.prepare(
      `INSERT INTO polls (id, creator_id, title, description, question, options, type, max_choices, eligible_years,
        opens_at, closes_at, results_visibility, results_release_at, voting_mode, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[7,8,9,10,11]', ?, ?, 'after_close', NULL, ?, ?, ?)`
    ).bind(id, staff.id, title, `School consultation: ${category.toLowerCase()}.`, title,
      JSON.stringify(options), type, type === 'multi' ? 2 : 1,
      addDays(dayOffset - 7), addDays(dayOffset), mode, status, addDays(dayOffset - 8)).run();
    if (status === 'closed') {
      for (const s of Object.values(ids).slice(0, 7)) {
        await env.DB.prepare('INSERT INTO votes (id, poll_id, user_id, selections, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(uid('v_'), id, s, JSON.stringify([Math.floor(Math.random() * options.length)]), addDays(dayOffset - 3)).run();
      }
    }
  }

  await setSetting(env, 'announcement', 'Welcome to AMIGS Voice. Petitions and polls are reviewed by staff before publication. Please read the participation rules before submitting.');
  await audit(env, staff, 'settings.seed_demo', 'settings', 'global', 'Sample data loaded');
  return json({ ok: true });
}));
