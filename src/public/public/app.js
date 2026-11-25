/* AMIGS Voice — client application */

const state = {
  me: null,
  settings: {},
  unread: 0,
  filters: { petitionSort: 'popular', petitionStatus: '', petitionCategory: '', petitionYear: '', petitionQ: '' },
  adminFilters: { petitionStatus: '', petitionQ: '', userQ: '', userYear: '', userRole: '', auditQ: '' },
  cache: {},
};

const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
const toastRoot = document.getElementById('toast-root');

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  petition: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  poll: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  results: '<path d="M21.2 15.9A10 10 0 1 1 8.1 2.8"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  activity: '<path d="M22 12h-4l-3 8-4-16-3 8H2"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 21c0-3.5 3.1-5.5 7-5.5s7 2 7 5.5"/><path d="M17 4.5a3.5 3.5 0 0 1 0 7M18 21c0-2.2-.6-3.9-1.8-5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 13.6H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.7 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9.5A1.6 1.6 0 0 0 10.5 3V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.1a2 2 0 1 1 0 4H21a1.6 1.6 0 0 0-1.5 1z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 8a5 5 0 0 1 0 8M18 5a9 9 0 0 1 0 14"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
};

const icon = (name, cls = '') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'content-type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

function toast(message, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === 'err' ? 'alert' : 'check')}<span>${esc(message)}</span>`;
  toastRoot.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .25s';
    setTimeout(() => el.remove(), 260);
  }, 3600);
}

function openModal({ title, body, submitLabel = 'Save', onSubmit, wide = false, danger = false, hideFooter = false }) {
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}" data-modal-panel>
        <div class="modal-head">
          <h2>${esc(title)}</h2>
          <button class="icon-btn" style="margin-left:auto" data-close-modal aria-label="Close">${icon('x')}</button>
        </div>
        <form data-modal-form>
          <div class="modal-body">${body}</div>
          ${hideFooter ? '' : `<div class="modal-foot">
            <button type="button" class="btn ghost" data-close-modal>Cancel</button>
            <button type="submit" class="btn ${danger ? 'danger' : ''}">${esc(submitLabel)}</button>
          </div>`}
        </form>
      </div>
    </div>`;
  const form = modalRoot.querySelector('[data-modal-form]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Working…';
    }
    try {
      await onSubmit(new FormData(form), form);
      closeModal();
    } catch (err) {
      toast(err.message || 'Something went wrong', 'err');
      if (btn) {
        btn.disabled = false;
        btn.textContent = submitLabel;
      }
    }
  });
  const first = form.querySelector('input, select, textarea');
  if (first) setTimeout(() => first.focus(), 60);
}

function closeModal() {
  modalRoot.innerHTML = '';
}

function confirmAction(message, label = 'Confirm') {
  return new Promise((resolve) => {
    openModal({
      title: 'Please confirm',
      body: `<p>${esc(message)}</p>`,
      submitLabel: label,
      danger: true,
      onSubmit: async () => resolve(true),
    });
    modalRoot.querySelectorAll('[data-close-modal]').forEach((el) =>
      el.addEventListener('click', () => resolve(false), { once: true })
    );
  });
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtNum = (n) => Number(n || 0).toLocaleString('en-GB');

function timeLeft(iso) {
  if (!iso) return '';
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'Closed';
  const days = Math.floor(diff / 86400000);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`;
  const hours = Math.floor(diff / 3600000);
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'} left`;
  return 'Closing soon';
}

const PETITION_STATUS = {
  pending: ['Pending review', 'warn'],
  approved: ['Approved', 'ok'],
  rejected: ['Rejected', 'danger'],
  under_consideration: ['Under consideration', ''],
  closed: ['Closed', 'neutral'],
};
const POLL_STATUS = {
  scheduled: ['Scheduled', 'warn'],
  open: ['Open', 'ok'],
  closed: ['Closed', 'neutral'],
  cancelled: ['Cancelled', 'danger'],
};
const RESPONSE_STATUS = {
  accepted: ['Accepted', 'ok'],
  under_consideration: ['Under consideration', ''],
  rejected: ['Rejected', 'danger'],
  already_planned: ['Already planned', 'ok'],
  more_info: ['More information required', 'warn'],
};

const pill = (map, key) => {
  const [label, cls] = map[key] || [key, 'neutral'];
  return `<span class="pill ${cls}">${esc(label)}</span>`;
};

/* ------------------------------------------------------------------ */
/* Charts                                                              */
/* ------------------------------------------------------------------ */

function barList(items, { labelKey = 'label', valueKey = 'value', suffix = '' } = {}) {
  if (!items || !items.length) return '<p class="muted small">No data yet.</p>';
  const max = Math.max(1, ...items.map((i) => Number(i[valueKey]) || 0));
  return `<div class="bars">${items
    .map(
      (i) => `<div class="bar-row">
        <span>${esc(i[labelKey])}</span>
        <span class="mono muted">${fmtNum(i[valueKey])}${suffix}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${((Number(i[valueKey]) || 0) / max) * 100}%"></div></div>
      </div>`
    )
    .join('')}</div>`;
}

function lineChart(points) {
  if (!points || points.length < 2) return '<p class="muted small">Not enough data to chart yet.</p>';
  const w = 640;
  const h = 170;
  const pad = 26;
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => [pad + i * step, h - pad - (p.value / max) * (h - pad * 2)]);
  const line = coords.map((c, i) => `${i ? 'L' : 'M'}${c[0].toFixed(1)} ${c[1].toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)} ${h - pad} L${pad} ${h - pad} Z`;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Trend chart">
    <line class="grid-line" x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}"/>
    <line class="grid-line" x1="${pad}" y1="${pad}" x2="${w - pad}" y2="${pad}"/>
    <path class="area" d="${area}"/>
    <path class="line" d="${line}"/>
    ${coords
      .map((c, i) => (i % Math.ceil(points.length / 7) === 0 || i === points.length - 1 ? `<circle cx="${c[0]}" cy="${c[1]}" r="3" fill="var(--blue)"/>` : ''))
      .join('')}
    <text x="${pad}" y="${h - 6}">${esc(points[0].label)}</text>
    <text x="${w - pad}" y="${h - 6}" text-anchor="end">${esc(points[points.length - 1].label)}</text>
  </svg>`;
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

const STUDENT_NAV = [
  ['home', '/home', 'Home', 'home'],
  ['petitions', '/petitions', 'Petitions', 'petition'],
  ['polls', '/polls', 'Polls', 'poll'],
  ['results', '/results', 'Results', 'results'],
  ['activity', '/activity', 'My Activity', 'activity'],
  ['notifications', '/notifications', 'Notifications', 'bell'],
  ['profile', '/profile', 'Profile', 'user'],
];
const STAFF_NAV = [
  ['admin', '/admin', 'Dashboard', 'home'],
  ['admin-petitions', '/admin/petitions', 'Petition Management', 'petition'],
  ['admin-polls', '/admin/polls', 'Poll Management', 'poll'],
  ['admin-users', '/admin/users', 'Student Accounts', 'users'],
  ['admin-analytics', '/admin/analytics', 'Analytics', 'trend'],
  ['notifications', '/notifications', 'Notifications', 'bell'],
  ['admin-audit', '/admin/audit', 'Audit Logs', 'list'],
  ['admin-settings', '/admin/settings', 'Settings', 'settings'],
];

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

function shell(content, active) {
  const isStaff = state.me && state.me.role !== 'student';
  const nav = isStaff ? STAFF_NAV : STUDENT_NAV;
  const theme = document.documentElement.getAttribute('data-theme');
  const navHtml = nav
    .map(
      ([key, href, label, ico]) => `<a class="nav-item ${active === key ? 'active' : ''}" href="#${href}">
        ${icon(ico)}<span>${label}</span>
        ${key === 'notifications' && state.unread ? `<span class="nav-badge">${state.unread}</span>` : ''}
      </a>`
    )
    .join('');

  return `
  <div class="shell">
    <aside class="sidebar" id="sidebar">
      <div class="brand">
        <div class="brand-mark">AV</div>
        <div class="brand-text">
          <strong>AMIGS Voice</strong>
          <span>Al Madani Grammar</span>
        </div>
      </div>
      <nav aria-label="Main navigation">
        <div class="nav-label">${isStaff ? 'Administration' : 'Student portal'}</div>
        ${navHtml}
        <div class="nav-group">
          <a class="nav-item ${active === 'help' ? 'active' : ''}" href="#/help">${icon('info')}<span>Help &amp; FAQ</span></a>
        </div>
      </nav>
      <div class="sidebar-foot">
        <div class="side-user">
          <div class="avatar">${esc(initials(state.me.name))}</div>
          <div>
            <strong>${esc(state.me.name)}</strong>
            <span>${state.me.role === 'student' ? `Year ${state.me.yearGroup}` : state.me.role === 'admin' ? 'Administrator' : 'Teacher'}</span>
          </div>
        </div>
        <button class="nav-item" style="width:100%;background:none;border:0;cursor:pointer;margin-top:4px" data-action="logout">
          ${icon('logout')}<span>Sign out</span>
        </button>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="icon-btn hamburger" data-action="toggle-sidebar" aria-label="Open menu">${icon('menu')}</button>
        <div class="topbar-title">${esc(state.settings.platformName || 'AMIGS Voice')} <span>· ${esc(state.settings.schoolName || '')}</span></div>
        <div class="topbar-spacer"></div>
        <button class="icon-btn" data-action="toggle-theme" aria-label="Toggle dark mode">${icon(theme === 'dark' ? 'sun' : 'moon')}</button>
        <a class="icon-btn" href="#/notifications" aria-label="Notifications">
          ${icon('bell')}${state.unread ? '<span class="dot"></span>' : ''}
        </a>
        <a class="icon-btn" href="#/profile" aria-label="Your profile"><div class="avatar" style="width:26px;height:26px;font-size:.68rem">${esc(initials(state.me.name))}</div></a>
      </header>
      <main class="content" id="main">${content}</main>
    </div>
    <nav class="mobile-nav" aria-label="Mobile navigation">
      ${(isStaff
        ? [['admin', '/admin', 'Dashboard', 'home'], ['admin-petitions', '/admin/petitions', 'Petitions', 'petition'], ['admin-polls', '/admin/polls', 'Polls', 'poll'], ['admin-users', '/admin/users', 'Accounts', 'users'], ['admin-settings', '/admin/settings', 'Settings', 'settings']]
        : [['home', '/home', 'Home', 'home'], ['petitions', '/petitions', 'Petitions', 'petition'], ['polls', '/polls', 'Polls', 'poll'], ['notifications', '/notifications', 'Alerts', 'bell'], ['profile', '/profile', 'Profile', 'user']]
      )
        .map(([key, href, label, ico]) => `<a class="${active === key ? 'active' : ''}" href="#${href}">${icon(ico)}<span>${label}</span></a>`)
        .join('')}
    </nav>
  </div>`;
}

function authShell(content) {
  return `<div class="auth">
    <aside class="auth-aside">
      <div>
        <div class="brand" style="padding:0 0 26px">
          <div class="brand-mark">AV</div>
          <div class="brand-text"><strong>AMIGS Voice</strong><span>Al Madani Independent Grammar School</span></div>
        </div>
        <h1>Your School.<br/>Your Voice.<br/>Your Say.</h1>
        <p>The official student engagement platform for Al Madani Independent Grammar School. Submit petitions, support ideas and take part in school-approved consultations.</p>
        <div class="auth-points">
          <div class="auth-point">${icon('shield')}<span>Every submission is reviewed by staff before publication.</span></div>
          <div class="auth-point">${icon('lock')}<span>Anonymous polls never link your vote to your account.</span></div>
          <div class="auth-point">${icon('megaphone')}<span>See the school's official response to student proposals.</span></div>
        </div>
      </div>
      <p class="small" style="color:#8FA9CC;margin:0">AMIGS Voice complements Microsoft Teams. It is not a messaging or homework platform.</p>
    </aside>
    <div class="auth-main"><div class="auth-card">${content}</div></div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Auth views                                                          */
/* ------------------------------------------------------------------ */

function viewLogin() {
  return authShell(`
    <div class="card card-pad">
      <div class="auth-brand">
        <div class="brand-mark">AV</div>
        <div><strong>Sign in</strong><span>Use your school account</span></div>
      </div>
      <form data-form="login">
        <label class="field"><span>School email address</span>
          <input type="email" name="email" autocomplete="username" required placeholder="23surname@student.amigs.uk" />
        </label>
        <label class="field"><span>Password</span>
          <input type="password" name="password" autocomplete="current-password" required />
        </label>
        <button class="btn block" type="submit">Sign in</button>
      </form>
      <div class="divider"></div>
      <p class="small muted" style="margin-bottom:10px">New student? You can create an account with your verified school email address.</p>
      <a class="btn ghost block" href="#/signup">Create a student account</a>
      <p class="tiny muted" style="margin:14px 0 0">Staff accounts are issued by the school office. If you cannot sign in, contact your Head of Year.</p>
    </div>`);
}

function viewSignup() {
  const years = (state.settings.years || [7, 8, 9, 10, 11])
    .map((y) => `<option value="${y}">Year ${y}</option>`)
    .join('');
  return authShell(`
    <div class="card card-pad">
      <div class="auth-brand">
        <div class="brand-mark">AV</div>
        <div><strong>Create your account</strong><span>Students in Years 7 to 11</span></div>
      </div>
      <form data-form="register">
        <label class="field"><span>Full name</span><input type="text" name="name" required autocomplete="name" /></label>
        <label class="field"><span>School email address</span>
          <input type="email" name="email" required autocomplete="email" placeholder="23surname@${esc(state.settings.studentEmailDomain || 'student.amigs.uk')}" />
          <div class="hint">Only verified @${esc(state.settings.studentEmailDomain || 'student.amigs.uk')} addresses are accepted.</div>
        </label>
        <label class="field"><span>Year group</span><select name="yearGroup" required>${years}</select></label>
        <label class="field"><span>Password</span>
          <input type="password" name="password" required minlength="8" autocomplete="new-password" />
          <div class="hint">At least 8 characters.</div>
        </label>
        <label class="check" style="margin-bottom:14px">
          <input type="checkbox" required />
          <span class="small">I have read the <a href="#/help">participation rules and privacy notice</a> and understand that all submissions are moderated.</span>
        </label>
        <button class="btn block" type="submit">Create account</button>
      </form>
      <div class="divider"></div>
      <a class="btn ghost block" href="#/login">I already have an account</a>
    </div>`);
}

function viewSetup() {
  return authShell(`
    <div class="card card-pad">
      <div class="auth-brand">
        <div class="brand-mark">AV</div>
        <div><strong>Platform setup</strong><span>Create the first administrator</span></div>
      </div>
      <div class="notice" style="margin-bottom:16px">${icon('shield')}<div>No accounts exist yet. Create the founding administrator account to configure AMIGS Voice.</div></div>
      <form data-form="bootstrap">
        <label class="field"><span>Your name</span><input type="text" name="name" required /></label>
        <label class="field"><span>Email address</span><input type="email" name="email" required /></label>
        <label class="field"><span>Password</span><input type="password" name="password" required minlength="10" /><div class="hint">At least 10 characters.</div></label>
        <button class="btn block" type="submit">Create administrator account</button>
      </form>
    </div>`);
}

/* ------------------------------------------------------------------ */
/* Student views                                                       */
/* ------------------------------------------------------------------ */

function petitionCard(p) {
  const canSign = p.status === 'approved' || p.status === 'under_consideration';
  return `<article class="card petition-card">
    <div class="row" style="gap:8px">
      ${pill(PETITION_STATUS, p.status)}
      <span class="pill neutral">${esc(p.category)}</span>
      ${p.featured ? `<span class="pill warn">${icon('star')} Featured</span>` : ''}
    </div>
    <h3><a href="#/petitions/${p.id}">${esc(p.title)}</a></h3>
    <p class="desc">${esc(p.description)}</p>
    <div class="small muted">Started by ${esc(p.author)} · ${fmtDate(p.createdAt)}</div>
    <div>
      <div class="between small" style="margin-bottom:5px">
        <span><strong class="mono">${fmtNum(p.signatures)}</strong> of ${fmtNum(p.target)} signatures</span>
        <span class="muted mono">${p.progress}%</span>
      </div>
      <div class="progress"><span style="width:${Math.min(100, p.progress)}%"></span></div>
    </div>
    <div class="row" style="margin-top:2px">
      ${
        canSign
          ? p.signedByMe
            ? `<button class="btn soft sm" disabled>${icon('check')} Signed</button>`
            : p.eligibleForMe
            ? `<button class="btn sm" data-action="sign" data-id="${p.id}">Sign petition</button>`
            : `<span class="pill neutral">Not open to your year group</span>`
          : `<span class="pill neutral">${p.status === 'closed' ? 'Closed' : 'Not open'}</span>`
      }
      <a class="btn ghost sm" href="#/petitions/${p.id}">View details</a>
    </div>
  </article>`;
}

function pollCard(p) {
  return `<article class="card petition-card">
    <div class="row" style="gap:8px">
      ${pill(POLL_STATUS, p.status)}
      <span class="pill neutral">${p.votingMode === 'anonymous' ? 'Anonymous' : 'Identified'}</span>
      <span class="pill neutral">${p.type === 'multi' ? 'Multi-select' : p.type === 'yesno' ? 'Yes / No' : 'Single answer'}</span>
    </div>
    <h3><a href="#/polls/${p.id}">${esc(p.title)}</a></h3>
    <p class="desc">${esc(p.question)}</p>
    <div class="small muted">${p.status === 'open' ? `Closes ${fmtDateTime(p.closesAt)} · ${timeLeft(p.closesAt)}` : `Closed ${fmtDateTime(p.closesAt)}`} · ${fmtNum(p.totalVotes)} votes</div>
    <div class="row">
      <a class="btn sm" href="#/polls/${p.id}">${p.status === 'open' && !p.votedByMe ? 'Vote now' : 'View poll'}</a>
      ${p.votedByMe ? `<span class="pill ok">${icon('check')} Voted</span>` : ''}
    </div>
  </article>`;
}

async function viewHome() {
  const d = await api('/api/dashboard');
  const s = d.stats;
  const stat = (label, value, foot, ico) => `<div class="card stat">
      <div class="between"><span class="label">${label}</span><span class="ico">${icon(ico)}</span></div>
      <div class="value">${fmtNum(value)}</div><div class="foot">${foot}</div></div>`;

  return `
    <div class="page-head">
      <div>
        <h1>Welcome back, ${esc(state.me.name.split(' ')[0])}</h1>
        <div class="sub">${state.me.role === 'student' ? `Year ${state.me.yearGroup} · ` : ''}${esc(state.settings.tagline || '')}</div>
      </div>
      <div class="actions">
        <a class="btn" href="#/petitions" data-action="new-petition">${icon('plus')} Start a petition</a>
        <a class="btn ghost" href="#/polls">${icon('poll')} Vote in a poll</a>
      </div>
    </div>
    ${d.announcement ? `<div class="notice" style="margin-bottom:18px">${icon('megaphone')}<div><strong>School announcement.</strong> ${esc(d.announcement)}</div></div>` : ''}
    <div class="grid g4" style="margin-bottom:20px">
      ${stat('Active petitions', s.activePetitions, 'Open for signatures', 'petition')}
      ${stat('Open polls', s.openPolls, 'Accepting votes', 'poll')}
      ${stat('Petitions signed', s.mySignatures, 'Your support so far', 'check')}
      ${stat('Polls participated', s.myVotes, 'Your participation', 'results')}
    </div>

    <div class="grid g2" style="align-items:start">
      <section class="stack">
        <div class="between"><h2>Featured petitions</h2><a class="small" href="#/petitions">View all</a></div>
        ${d.featured.length ? d.featured.map(petitionCard).join('') : `<div class="card empty">${icon('petition')}<p>No petitions are published yet.</p></div>`}
      </section>
      <section class="stack">
        <div class="between"><h2>Recently approved polls</h2><a class="small" href="#/polls">View all</a></div>
        ${d.polls.length ? d.polls.map(pollCard).join('') : `<div class="card empty">${icon('poll')}<p>No polls are open right now.</p></div>`}
        <div class="card card-pad">
          <div class="between" style="margin-bottom:10px"><h2>Closing soon</h2><a class="small" href="#/petitions?sort=closing">See all</a></div>
          ${
            d.closingSoon.length
              ? d.closingSoon
                  .map(
                    (p) => `<div class="between" style="padding:8px 0;border-bottom:1px solid var(--line)">
                      <div style="min-width:0"><a href="#/petitions/${p.id}" class="small" style="font-weight:600">${esc(p.title)}</a>
                      <div class="tiny muted">${fmtNum(p.signatures)} / ${fmtNum(p.target)} signatures</div></div>
                      <span class="pill warn">${esc(timeLeft(p.closing_at))}</span></div>`
                  )
                  .join('')
              : '<p class="small muted">Nothing is closing in the next few days.</p>'
          }
        </div>
      </section>
    </div>

    <section class="stack" style="margin-top:22px">
      <div class="between"><h2>Latest official school responses</h2><a class="small" href="#/results">Results</a></div>
      ${
        d.responses.length
          ? d.responses
              .map(
                (r) => `<div class="card card-pad">
                  <div class="row" style="margin-bottom:6px">${pill(RESPONSE_STATUS, r.status)}<span class="tiny muted">${fmtDate(r.createdAt)} · ${esc(r.department)}</span></div>
                  <h3><a href="#/petitions/${r.petitionId}" style="color:var(--text)">${esc(r.title)}</a></h3>
                  <p class="small muted" style="margin:6px 0 0">${esc(r.message)}</p>
                </div>`
              )
              .join('')
          : `<div class="card empty">${icon('megaphone')}<p>The school has not published any responses yet.</p></div>`
      }
    </section>`;
}

async function viewPetitions() {
  const f = state.filters;
  const qs = new URLSearchParams({ sort: f.petitionSort, status: f.petitionStatus, category: f.petitionCategory, year: f.petitionYear, q: f.petitionQ });
  const d = await api(`/api/petitions?${qs}`);
  const cats = (state.settings.categories || []).map((c) => `<option ${f.petitionCategory === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const years = (state.settings.years || []).map((y) => `<option value="${y}" ${String(f.petitionYear) === String(y) ? 'selected' : ''}>Year ${y}</option>`).join('');

  return `
    <div class="page-head">
      <div><h1>Petitions</h1><div class="sub">Browse proposals from students across the school. Every petition is reviewed by staff before publication.</div></div>
      <div class="actions"><button class="btn" data-action="new-petition">${icon('plus')} Start a petition</button></div>
    </div>
    <div class="toolbar">
      <input type="search" placeholder="Search petitions…" value="${esc(f.petitionQ)}" data-filter="petitionQ" aria-label="Search petitions" />
      <select data-filter="petitionSort" aria-label="Sort">
        <option value="popular" ${f.petitionSort === 'popular' ? 'selected' : ''}>Most popular</option>
        <option value="recent" ${f.petitionSort === 'recent' ? 'selected' : ''}>Recently published</option>
        <option value="closing" ${f.petitionSort === 'closing' ? 'selected' : ''}>Closing soon</option>
        <option value="oldest" ${f.petitionSort === 'oldest' ? 'selected' : ''}>Oldest first</option>
      </select>
      <select data-filter="petitionStatus" aria-label="Status">
        <option value="">All statuses</option>
        <option value="approved" ${f.petitionStatus === 'approved' ? 'selected' : ''}>Approved</option>
        <option value="under_consideration" ${f.petitionStatus === 'under_consideration' ? 'selected' : ''}>Under consideration</option>
        <option value="closed" ${f.petitionStatus === 'closed' ? 'selected' : ''}>Closed</option>
      </select>
      <select data-filter="petitionCategory" aria-label="Category"><option value="">All categories</option>${cats}</select>
      <select data-filter="petitionYear" aria-label="Year group"><option value="">All year groups</option>${years}</select>
    </div>
    ${d.petitions.length ? `<div class="grid g2">${d.petitions.map(petitionCard).join('')}</div>` : `<div class="card empty">${icon('search')}<p>No petitions match your filters.</p></div>`}`;
}

async function viewPetitionDetail(id) {
  const d = await api(`/api/petitions/${id}`);
  const p = d.petition;
  const canSign = (p.status === 'approved' || p.status === 'under_consideration') && p.eligibleForMe;
  return `
    <a class="small" href="#/petitions" style="display:inline-flex;align-items:center;gap:4px;margin-bottom:14px">${icon('chevron')} Back to petitions</a>
    <div class="grid split">
      <div class="stack">
        <div class="card card-pad">
          <div class="row" style="gap:8px;margin-bottom:10px">
            ${pill(PETITION_STATUS, p.status)}
            <span class="pill neutral">${esc(p.category)}</span>
            ${p.featured ? `<span class="pill warn">${icon('star')} Featured</span>` : ''}
          </div>
          <h1 style="margin-bottom:8px">${esc(p.title)}</h1>
          <div class="small muted">Started by ${esc(p.author)} · Published ${fmtDate(p.createdAt)}${p.closingAt ? ` · Closes ${fmtDate(p.closingAt)}` : ''}</div>
          ${p.image ? `<img src="${p.image}" alt="Supporting image for this petition" style="width:100%;border-radius:12px;margin-top:16px;max-height:340px;object-fit:cover" />` : ''}
          <div class="divider"></div>
          <h3 style="margin-bottom:6px">The proposal</h3>
          <p style="white-space:pre-wrap">${esc(p.description)}</p>
          <h3 style="margin:16px 0 6px">Why this matters</h3>
          <p style="white-space:pre-wrap">${esc(p.reason)}</p>
          <h3 style="margin:16px 0 6px">Who this would affect</h3>
          <p style="white-space:pre-wrap">${esc(p.affected)}</p>
          ${p.moderationNote ? `<div class="notice warn" style="margin-top:14px">${icon('info')}<div><strong>Moderation note.</strong> ${esc(p.moderationNote)}</div></div>` : ''}
          <div class="row" style="margin-top:18px">
            <button class="btn ghost sm" data-action="report-petition" data-id="${p.id}">${icon('flag')} Report this petition</button>
          </div>
        </div>

        <div class="card card-pad">
          <h2 style="margin-bottom:12px">Official school response</h2>
          ${
            d.responses.length
              ? d.responses
                  .map(
                    (r) => `<div style="padding:14px 0;border-bottom:1px solid var(--line)">
                      <div class="row" style="margin-bottom:6px">${pill(RESPONSE_STATUS, r.status)}<span class="tiny muted">${fmtDate(r.createdAt)} · ${esc(r.department)}</span></div>
                      <p class="small" style="white-space:pre-wrap;margin:0">${esc(r.message)}</p>
                    </div>`
                  )
                  .join('')
              : `<p class="small muted">No official response has been published yet. Reaching the signature target does not mean a petition has been accepted — it prompts the school to review it.</p>`
          }
          ${
            d.updates.length
              ? `<h3 style="margin:16px 0 8px">Follow-up updates</h3>` +
                d.updates
                  .map((u) => `<div class="small" style="padding:8px 0;border-bottom:1px solid var(--line)"><span class="tiny muted">${fmtDate(u.createdAt)}</span><br/>${esc(u.message)}</div>`)
                  .join('')
              : ''
          }
        </div>
      </div>

      <div class="stack">
        <div class="card card-pad">
          <div class="between" style="margin-bottom:8px">
            <span class="small muted">Signatures</span>
            <span class="pill ${p.progress >= 100 ? 'ok' : ''}">${p.progress}% of target</span>
          </div>
          <div style="font-size:2rem;font-weight:700;letter-spacing:-.03em" class="mono">${fmtNum(p.signatures)}</div>
          <div class="small muted" style="margin-bottom:10px">of ${fmtNum(p.target)} signatures</div>
          <div class="progress"><span style="width:${Math.min(100, p.progress)}%"></span></div>
          <div style="margin-top:16px">
            ${
              canSign
                ? p.signedByMe
                  ? `<button class="btn soft block" disabled>${icon('check')} You have signed</button>
                     <button class="btn ghost sm block" style="margin-top:8px" data-action="withdraw" data-id="${p.id}">Withdraw my signature</button>`
                  : `<button class="btn block" data-action="sign" data-id="${p.id}">Sign this petition</button>`
                : `<div class="notice">${icon('info')}<div>${esc(
                    p.status === 'pending'
                      ? 'This petition is awaiting staff review.'
                      : p.status === 'rejected'
                      ? 'This petition was not approved for publication.'
                      : p.status === 'closed'
                      ? 'This petition is closed and no longer accepting signatures.'
                      : 'This petition is not open to your year group.'
                  )}</div></div>`
            }
          </div>
          <div class="divider"></div>
          <div class="small muted">Eligible year groups</div>
          <div class="row" style="margin-top:6px">${p.eligibleYears.map((y) => `<span class="pill neutral">Year ${y}</span>`).join('')}</div>
        </div>
        <div class="card card-pad">
          <h3 style="margin-bottom:10px">Recent signatures</h3>
          ${
            d.recentSigners.length
              ? d.recentSigners
                  .map((s) => `<div class="between small" style="padding:6px 0"><span>${esc(s.name)}</span><span class="muted tiny">Year ${s.year} · ${fmtDate(s.at)}</span></div>`)
                  .join('')
              : '<p class="small muted">No signatures yet. Be the first.</p>'
          }
        </div>
      </div>
    </div>`;
}

async function viewPolls() {
  const d = await api('/api/polls');
  const open = d.polls.filter((p) => p.status === 'open');
  const other = d.polls.filter((p) => p.status !== 'open');
  return `
    <div class="page-head"><div><h1>Polls</h1><div class="sub">School-approved consultations. One vote per eligible student — enforced on the server.</div></div></div>
    <h2 style="margin-bottom:12px">Open now</h2>
    ${open.length ? `<div class="grid g2">${open.map(pollCard).join('')}</div>` : `<div class="card empty">${icon('poll')}<p>No polls are open right now.</p></div>`}
    ${other.length ? `<h2 style="margin:24px 0 12px">Recently closed</h2><div class="grid g2">${other.map(pollCard).join('')}</div>` : ''}`;
}

function resultsBlock(results, poll) {
  if (!results) return '';
  return `
    <div class="stack">
      <div class="grid g3">
        <div class="card stat"><div class="label">Total votes</div><div class="value">${fmtNum(results.totalVotes)}</div></div>
        <div class="card stat"><div class="label">Eligible voters</div><div class="value">${fmtNum(results.eligibleVoters)}</div></div>
        <div class="card stat"><div class="label">Participation</div><div class="value">${results.participationRate}%</div></div>
      </div>
      <div class="card card-pad">
        <h3 style="margin-bottom:12px">Result by option</h3>
        <div class="bars">
          ${results.options
            .map(
              (o) => `<div class="bar-row">
                <span>${esc(o.label)}</span>
                <span class="mono muted">${fmtNum(o.votes)} · ${o.percent}%</span>
                <div class="bar-track"><div class="bar-fill" style="width:${o.percent}%"></div></div>
              </div>`
            )
            .join('')}
        </div>
      </div>
      ${
        results.byYear.length
          ? `<div class="card card-pad"><h3 style="margin-bottom:12px">Participation by year group</h3>${barList(
              results.byYear.map((y) => ({ label: `Year ${y.year}`, value: y.votes })),
              { suffix: ' votes' }
            )}</div>`
          : ''
      }
      <p class="tiny muted">${poll.votingMode === 'anonymous' ? 'This was an anonymous poll: ballots are stored separately from voter identity, so individual choices cannot be linked to a student.' : 'This was an identified poll: authorised staff can audit voting eligibility. Results shown are aggregate.'}</p>
    </div>`;
}

async function viewPollDetail(id) {
  const d = await api(`/api/polls/${id}`);
  const p = d.poll;
  const canVote = p.status === 'open' && p.eligibleForMe && !p.votedByMe;
  const inputType = p.type === 'multi' ? 'checkbox' : 'radio';
  return `
    <a class="small" href="#/polls" style="display:inline-flex;align-items:center;gap:4px;margin-bottom:14px">${icon('chevron')} Back to polls</a>
    <div class="grid split">
      <div class="stack">
        <div class="card card-pad">
          <div class="row" style="gap:8px;margin-bottom:10px">
            ${pill(POLL_STATUS, p.status)}
            <span class="pill neutral">${p.votingMode === 'anonymous' ? 'Anonymous voting' : 'Identified voting'}</span>
            <span class="pill neutral">${p.type === 'multi' ? `Select up to ${p.maxChoices}` : 'Single answer'}</span>
          </div>
          <h1 style="margin-bottom:6px">${esc(p.title)}</h1>
          <p class="muted">${esc(p.description)}</p>
          <div class="divider"></div>
          <h3 style="margin-bottom:12px">${esc(p.question)}</h3>
          ${
            canVote
              ? `<form data-form="vote" data-id="${p.id}">
                  <div class="stack">
                    ${p.options
                      .map(
                        (o, i) => `<label class="check"><input type="${inputType}" name="selection" value="${i}" />
                          <span>${esc(o)}</span></label>`
                      )
                      .join('')}
                  </div>
                  <div class="notice" style="margin-top:14px">${icon(p.votingMode === 'anonymous' ? 'lock' : 'eye')}<div>${
                    p.votingMode === 'anonymous'
                      ? 'This poll is anonymous. Your vote is stored separately from your account, so nobody — including staff — can see how you voted. Your participation is recorded only to prevent duplicate voting.'
                      : 'This poll is identified. Authorised staff can audit who has voted for eligibility purposes. Aggregate results are shown to everyone.'
                  }</div></div>
                  <button class="btn" type="submit" style="margin-top:14px">Submit my vote</button>
                </form>`
              : `<div class="stack">
                  ${p.options.map((o) => `<div class="check" style="cursor:default"><span>${esc(o)}</span></div>`).join('')}
                </div>
                <div class="notice" style="margin-top:14px">${icon('info')}<div>${
                  p.votedByMe
                    ? 'You have already voted in this poll. Thank you for taking part.'
                    : p.status !== 'open'
                    ? 'This poll is closed and no longer accepting votes.'
                    : 'This poll is not open to your year group.'
                }</div></div>`
          }
        </div>
        ${d.results ? resultsBlock(d.results, p) : `<div class="card card-pad"><div class="notice">${icon('lock')}<div>Results for this poll will be published ${p.resultsVisibility === 'after_release' ? `on ${fmtDateTime(p.resultsReleaseAt)}` : 'when the poll closes'}.</div></div></div>`}
      </div>
      <div class="stack">
        <div class="card card-pad">
          <h3 style="margin-bottom:10px">Poll details</h3>
          <div class="between small" style="padding:5px 0"><span class="muted">Opens</span><span>${fmtDateTime(p.opensAt)}</span></div>
          <div class="between small" style="padding:5px 0"><span class="muted">Closes</span><span>${fmtDateTime(p.closesAt)}</span></div>
          <div class="between small" style="padding:5px 0"><span class="muted">Votes cast</span><span class="mono">${fmtNum(p.totalVotes)}</span></div>
          <div class="between small" style="padding:5px 0"><span class="muted">Voting mode</span><span>${p.votingMode === 'anonymous' ? 'Anonymous' : 'Identified'}</span></div>
          <div class="divider"></div>
          <div class="small muted" style="margin-bottom:6px">Eligible year groups</div>
          <div class="row">${p.eligibleYears.map((y) => `<span class="pill neutral">Year ${y}</span>`).join('')}</div>
        </div>
        <div class="card card-pad">
          <h3 style="margin-bottom:8px">Voting rules</h3>
          <ul class="small muted" style="padding-left:18px;margin:0">
            <li>One vote per eligible student.</li>
            <li>Duplicate votes are blocked on the server.</li>
            <li>Votes cannot be changed after submission.</li>
            <li>Polls close automatically at the published time.</li>
            <li>Results are aggregate only — never individual choices.</li>
          </ul>
        </div>
      </div>
    </div>`;
}

async function viewResults() {
  const d = await api('/api/results');
  return `
    <div class="page-head"><div><h1>Results</h1><div class="sub">Published outcomes from closed school polls.</div></div>
      <div class="actions"><button class="btn ghost" data-action="print">${icon('printer')} Print / Save as PDF</button></div></div>
    ${
      d.polls.length
        ? d.polls
            .map(
              ({ poll, results }) => `<div class="card card-pad" style="margin-bottom:16px">
                <div class="between" style="margin-bottom:4px">
                  <h2>${esc(poll.title)}</h2>
                  <span class="pill neutral">Closed ${fmtDate(poll.closesAt)}</span>
                </div>
                <p class="small muted">${esc(poll.question)}</p>
                ${results ? resultsBlock(results, poll) : `<div class="notice">${icon('lock')}<div>Results for this poll have not been released yet.</div></div>`}
              </div>`
            )
            .join('')
        : `<div class="card empty">${icon('results')}<p>No polls have closed yet.</p></div>`
    }`;
}

async function viewActivity() {
  const d = await api('/api/activity');
  return `
    <div class="page-head"><div><h1>My activity</h1><div class="sub">Everything you have started, signed or voted in.</div></div></div>
    <div class="tabs" role="tablist">
      <button class="tab active" data-tab="tab-petitions">My petitions (${d.petitions.length})</button>
      <button class="tab" data-tab="tab-signed">Signed (${d.signed.length})</button>
      <button class="tab" data-tab="tab-votes">Polls (${d.votes.length})</button>
    </div>
    <div id="tab-petitions" class="tab-panel">
      ${d.petitions.length ? `<div class="grid g2">${d.petitions.map(petitionCard).join('')}</div>` : `<div class="card empty">${icon('petition')}<p>You have not started a petition yet.</p><button class="btn" data-action="new-petition" style="margin-top:12px">Start a petition</button></div>`}
    </div>
    <div id="tab-signed" class="tab-panel" hidden>
      ${d.signed.length ? `<div class="grid g2">${d.signed.map(petitionCard).join('')}</div>` : `<div class="card empty">${icon('check')}<p>You have not signed any petitions yet.</p></div>`}
    </div>
    <div id="tab-votes" class="tab-panel" hidden>
      ${
        d.votes.length
          ? `<div class="table-wrap"><table><thead><tr><th>Poll</th><th>Voting mode</th><th>Status</th><th>Participated</th></tr></thead><tbody>
              ${d.votes
                .map(
                  (v) => `<tr><td><a href="#/polls/${v.id}">${esc(v.title)}</a></td><td>${v.mode === 'anonymous' ? 'Anonymous' : 'Identified'}</td><td>${pill(POLL_STATUS, v.status)}</td><td class="muted">${fmtDate(v.voted_at)}</td></tr>`
                )
                .join('')}
            </tbody></table></div>`
          : `<div class="card empty">${icon('poll')}<p>You have not taken part in any polls yet.</p></div>`
      }
    </div>`;
}

async function viewNotifications() {
  const d = await api('/api/notifications');
  return `
    <div class="page-head"><div><h1>Notifications</h1><div class="sub">Updates about your petitions, polls and official responses.</div></div>
      <div class="actions"><button class="btn ghost" data-action="mark-all-read">${icon('check')} Mark all as read</button></div></div>
    <div class="card">
      ${
        d.notifications.length
          ? d.notifications
              .map(
                (n) => `<div class="list-item ${n.read ? '' : 'unread'}">
                  <div class="ico">${icon(n.type.includes('poll') ? 'poll' : n.type.includes('response') ? 'megaphone' : n.type.includes('target') ? 'target' : 'bell')}</div>
                  <div style="flex:1;min-width:0">
                    <div class="small">${esc(n.message)}</div>
                    <div class="tiny muted">${fmtDateTime(n.createdAt)}</div>
                  </div>
                  ${n.link ? `<a class="btn ghost sm" href="${esc(n.link)}" data-action="read-one" data-id="${n.id}">Open</a>` : ''}
                </div>`
              )
              .join('')
          : `<div class="empty">${icon('bell')}<p>You have no notifications yet.</p></div>`
      }
    </div>`;
}

async function viewProfile() {
  const u = state.me;
  return `
    <div class="page-head"><div><h1>Profile</h1><div class="sub">Your account details and security settings.</div></div></div>
    <div class="grid split">
      <div class="card card-pad">
        <div class="row" style="gap:16px;margin-bottom:18px">
          <div class="avatar-lg">${esc(initials(u.name))}</div>
          <div><h2>${esc(u.name)}</h2><div class="small muted">${esc(u.email)}</div>
          <div class="row" style="margin-top:6px"><span class="pill">${u.role === 'student' ? `Year ${u.yearGroup}` : u.role === 'admin' ? 'Administrator' : 'Teacher'}</span></div></div>
        </div>
        <form data-form="profile">
          <label class="field"><span>Display name</span><input type="text" name="name" value="${esc(u.name)}" required /></label>
          <label class="field"><span>School email</span><input type="text" value="${esc(u.email)}" disabled /><div class="hint">Email addresses are managed by the school and cannot be changed here.</div></label>
          <button class="btn" type="submit">Save changes</button>
        </form>
      </div>
      <div class="stack">
        <div class="card card-pad">
          <h3 style="margin-bottom:12px">Change password</h3>
          <form data-form="password">
            <label class="field"><span>Current password</span><input type="password" name="currentPassword" required autocomplete="current-password" /></label>
            <label class="field"><span>New password</span><input type="password" name="newPassword" required minlength="8" autocomplete="new-password" /></label>
            <button class="btn" type="submit">Update password</button>
          </form>
        </div>
        <div class="card card-pad">
          <h3 style="margin-bottom:10px">Appearance</h3>
          <div class="between"><span class="small">Dark mode</span><button class="btn ghost sm" data-action="toggle-theme">Toggle theme</button></div>
        </div>
        <div class="card card-pad">
          <h3 style="margin-bottom:8px">Privacy</h3>
          <p class="small muted" style="margin:0">Your email address is never shown publicly. Petition authors are displayed as ${esc(state.settings.authorDisplay === 'full' ? 'their full name' : 'first name and surname initial')}, in line with school policy. Anonymous poll ballots are stored separately from your account.</p>
        </div>
      </div>
    </div>`;
}

function viewHelp() {
  const faqs = [
    ['Who can use AMIGS Voice?', 'Every student in Years 7 to 11 with a verified school email address, plus staff and administrators. Accounts are restricted to verified school users.'],
    ['Is my petition published immediately?', 'No. Every petition starts as “Pending review”. A teacher or administrator must approve it before other students can see or sign it.'],
    ['Does reaching the signature target mean the school has accepted my petition?', 'No. Reaching the target notifies the school that the petition needs review. Only an official response from the school indicates an outcome.'],
    ['Can I sign a petition twice?', 'No. One signature per verified student per petition is enforced by the database. Duplicate attempts are rejected on the server.'],
    ['Can I withdraw my signature?', 'If the school has enabled withdrawal, open the petition and choose “Withdraw my signature”. Withdrawal is not possible once a petition closes.'],
    ['How does anonymous voting work?', 'For anonymous polls, your ballot is stored in a separate table with no reference to your account. A participation record proves you have voted so duplicates can be blocked, but it never stores your choice.'],
    ['Can staff see how I voted?', 'Not in anonymous polls. In identified polls, authorised staff can audit who voted for eligibility purposes, but published results are always aggregate.'],
    ['Who can see my email address?', 'Only administrators, and staff explicitly granted the “view identities” permission. It is never shown on petitions or results.'],
    ['What content is not allowed?', 'Anything that identifies or targets individuals, is discriminatory, harassing or factually false. Reported content is reviewed by staff and may be removed.'],
    ['How do I report something?', 'Open the petition and choose “Report this petition”. Reports go straight to the moderation queue.'],
    ['What happens to my data?', 'Data is retained for the period set by the school and used only for student engagement purposes. You can request a copy or deletion through the school office.'],
    ['Is this an official school decision-making tool?', 'AMIGS Voice is a consultation platform. Polls and petitions inform the school’s thinking; they are not legally binding votes or official school decisions unless the school says so in an official response.'],
  ];
  return `
    <div class="page-head"><div><h1>Help &amp; FAQ</h1><div class="sub">How AMIGS Voice works, and the rules that apply to everyone.</div></div></div>
    <div class="grid split">
      <div>
        <h2 style="margin-bottom:12px">Common questions</h2>
        ${faqs.map(([q, a]) => `<details class="faq"><summary>${esc(q)}</summary><div class="faq-body">${esc(a)}</div></details>`).join('')}
      </div>
      <div class="stack">
        <div class="card card-pad">
          <h3 style="margin-bottom:8px">Participation rules</h3>
          <ul class="small muted" style="padding-left:18px;margin:0">
            <li>Be respectful and constructive.</li>
            <li>Do not name or identify individual students or staff.</li>
            <li>One account per student; duplicate accounts are removed.</li>
            <li>One signature and one vote per petition or poll.</li>
            <li>Automated or spam submissions are blocked.</li>
          </ul>
        </div>
        <div class="card card-pad">
          <h3 style="margin-bottom:8px">Safeguarding</h3>
          <p class="small muted" style="margin:0">If a submission raises a safeguarding concern, it is escalated to the ${esc(state.settings.safeguardingContact || 'Designated Safeguarding Lead')} rather than handled through the moderation queue alone. If you are worried about yourself or another student, speak to a trusted adult or your Head of Year.</p>
        </div>
        <div class="card card-pad">
          <h3 style="margin-bottom:8px">Privacy notice</h3>
          <p class="small muted" style="margin:0">AMIGS Voice stores your name, school email, year group and participation records. Petition content and poll results are visible to the school community as described above. Data is retained for ${esc(state.settings.retentionDays || '365')} days unless the school sets a different period.</p>
        </div>
      </div>
    </div>`;
}

/* Admin views live in app-admin.js (loaded before this file) */

/* ------------------------------------------------------------------ */
/* Modals                                                              */
/* ------------------------------------------------------------------ */

function newPetitionModal() {
  const cats = (state.settings.categories || []).map((c) => `<option>${esc(c)}</option>`).join('');
  const years = (state.settings.years || [7, 8, 9, 10, 11])
    .map((y) => `<label class="check"><input type="checkbox" name="years" value="${y}" checked /><span>Year ${y}</span></label>`)
    .join('');
  openModal({
    title: 'Start a petition',
    wide: true,
    submitLabel: 'Submit for review',
    body: `
      <div class="notice" style="margin-bottom:16px">${icon('shield')}<div>Your petition will be reviewed by a member of staff before it is published. You will be notified when it has been reviewed.</div></div>
      <label class="field"><span>Petition title</span><input type="text" name="title" required maxlength="140" placeholder="e.g. Introduce more extracurricular clubs" /></label>
      <label class="field"><span>Detailed explanation</span><textarea name="description" required minlength="40" rows="5" placeholder="Explain your proposal clearly…"></textarea></label>
      <label class="field"><span>Why is this change needed?</span><textarea name="reason" required minlength="20" rows="3"></textarea></label>
      <label class="field"><span>Who would this affect?</span><input type="text" name="affected" required placeholder="e.g. All students in Years 7 to 11" /></label>
      <div class="grid g2">
        <label class="field"><span>Category</span><select name="category">${cats}</select></label>
        <label class="field"><span>Signature target</span><input type="number" name="target" value="100" min="10" max="5000" /></label>
      </div>
      <div class="field"><span>Eligible year groups</span><div class="grid g3">${years}</div></div>
      <label class="field"><span>Supporting image (optional)</span><input type="file" name="imageFile" accept="image/png,image/jpeg,image/webp" /><div class="hint">Images are reviewed with your petition. Maximum 350 KB.</div></label>`,
    onSubmit: async (fd) => {
      const yearsSel = [...fd.getAll('years')].map(Number);
      if (!yearsSel.length) throw new Error('Select at least one eligible year group.');
      let image = null;
      const file = fd.get('imageFile');
      if (file && file.size) {
        if (file.size > 350000) throw new Error('That image is too large. Please use one under 350 KB.');
        image = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      const res = await api('/api/petitions', {
        method: 'POST',
        body: {
          title: fd.get('title'),
          description: fd.get('description'),
          reason: fd.get('reason'),
          affected: fd.get('affected'),
          category: fd.get('category'),
          target: Number(fd.get('target')),
          eligibleYears: yearsSel,
          image,
        },
      });
      toast('Petition submitted for review.', 'ok');
      location.hash = `#/petitions/${res.id}`;
    },
  });
}

function newPollModal() {
  const years = (state.settings.years || [7, 8, 9, 10, 11])
    .map((y) => `<label class="check"><input type="checkbox" name="years" value="${y}" checked /><span>Year ${y}</span></label>`)
    .join('');
  const now = new Date();
  const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  openModal({
    title: 'Create a poll',
    wide: true,
    submitLabel: 'Create poll',
    body: `
      <label class="field"><span>Poll title</span><input type="text" name="title" required maxlength="160" /></label>
      <label class="field"><span>Description</span><textarea name="description" rows="2"></textarea></label>
      <label class="field"><span>Question</span><input type="text" name="question" required maxlength="400" /></label>
      <label class="field"><span>Poll type</span>
        <select name="type" data-poll-type>
          <option value="single">Single answer</option>
          <option value="yesno">Yes / No</option>
          <option value="multi">Multi-select</option>
        </select>
      </label>
      <label class="field" data-options-field><span>Answer options (one per line)</span><textarea name="options" rows="4" placeholder="Option one&#10;Option two&#10;Option three"></textarea></label>
      <label class="field" data-max-field hidden><span>Maximum selections</span><input type="number" name="maxChoices" value="2" min="2" max="10" /></label>
      <div class="grid g2">
        <label class="field"><span>Opens</span><input type="datetime-local" name="opensAt" value="${local(now)}" required /></label>
        <label class="field"><span>Closes</span><input type="datetime-local" name="closesAt" value="${local(new Date(now.getTime() + 7 * 86400000))}" required /></label>
      </div>
      <div class="grid g2">
        <label class="field"><span>Voting mode</span>
          <select name="votingMode">
            <option value="anonymous">Anonymous — ballots not linked to students</option>
            <option value="identified">Identified — auditable eligibility</option>
          </select>
        </label>
        <label class="field"><span>Results visibility</span>
          <select name="resultsVisibility">
            <option value="after_close">After the poll closes</option>
            <option value="after_vote">After a student votes</option>
            <option value="always">Always visible</option>
            <option value="after_release">On a set release date</option>
          </select>
        </label>
      </div>
      <label class="field" data-release-field hidden><span>Results release date</span><input type="datetime-local" name="resultsReleaseAt" /></label>
      <div class="field"><span>Eligible year groups</span><div class="grid g3">${years}</div></div>`,
    onSubmit: async (fd) => {
      const yearsSel = [...fd.getAll('years')].map(Number);
      if (!yearsSel.length) throw new Error('Select at least one eligible year group.');
      const type = fd.get('type');
      const options = type === 'yesno' ? ['Yes', 'No'] : String(fd.get('options') || '').split('\n').map((s) => s.trim()).filter(Boolean);
      if (options.length < 2) throw new Error('Provide at least two answer options.');
      await api('/api/admin/polls', {
        method: 'POST',
        body: {
          title: fd.get('title'),
          description: fd.get('description'),
          question: fd.get('question'),
          type,
          options,
          maxChoices: Number(fd.get('maxChoices') || 2),
          opensAt: new Date(fd.get('opensAt')).toISOString(),
          closesAt: new Date(fd.get('closesAt')).toISOString(),
          votingMode: fd.get('votingMode'),
          resultsVisibility: fd.get('resultsVisibility'),
          resultsReleaseAt: fd.get('resultsReleaseAt') ? new Date(fd.get('resultsReleaseAt')).toISOString() : null,
          eligibleYears: yearsSel,
        },
      });
      toast('Poll created.', 'ok');
      render();
    },
  });
  const form = modalRoot.querySelector('form');
  const typeSel = form.querySelector('[data-poll-type]');
  typeSel.addEventListener('change', () => {
    form.querySelector('[data-options-field]').hidden = typeSel.value === 'yesno';
    form.querySelector('[data-max-field]').hidden = typeSel.value !== 'multi';
  });
  const visSel = form.querySelector('[name=resultsVisibility]');
  visSel.addEventListener('change', () => {
    form.querySelector('[data-release-field]').hidden = visSel.value !== 'after_release';
  });
}

function respondModal(id, title) {
  openModal({
    title: 'Publish official response',
    wide: true,
    submitLabel: 'Publish response',
    body: `
      <p class="small muted">Responding to: <strong>${esc(title)}</strong></p>
      <label class="field"><span>Response type</span>
        <select name="status">
          <option value="accepted">Accepted</option>
          <option value="under_consideration">Under consideration</option>
          <option value="already_planned">Already planned</option>
          <option value="more_info">More information required</option>
          <option value="rejected">Rejected</option>
        </select>
      </label>
      <label class="field"><span>Responsible department or staff role</span><input type="text" name="department" required placeholder="e.g. Deputy Head (Curriculum)" /></label>
      <label class="field"><span>Official response</span><textarea name="message" rows="6" required minlength="20"></textarea></label>
      <div class="notice">${icon('info')}<div>This response is published publicly on the petition and the author is notified. Reaching a signature target does not automatically accept a petition.</div></div>`,
    onSubmit: async (fd) => {
      await api(`/api/admin/petitions/${id}/response`, {
        method: 'POST',
        body: { status: fd.get('status'), department: fd.get('department'), message: fd.get('message') },
      });
      toast('Official response published.', 'ok');
      render();
    },
  });
}

function petitionMoreModal(p) {
  openModal({
    title: 'Manage petition',
    wide: true,
    submitLabel: 'Save changes',
    body: `
      <label class="field"><span>Title</span><input type="text" name="title" value="${esc(p.title)}" /></label>
      <label class="field"><span>Description</span><textarea name="description" rows="4">${esc(p.description)}</textarea></label>
      <div class="grid g2">
        <label class="field"><span>Status</span>
          <select name="status">
            ${Object.entries(PETITION_STATUS).map(([k, v]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>Signature target</span><input type="number" name="target" value="${p.target}" min="10" max="5000" /></label>
      </div>
      <label class="field"><span>Closing date</span><input type="date" name="closingAt" value="${p.closingAt ? p.closingAt.slice(0, 10) : ''}" /></label>
      <label class="check" style="margin-bottom:14px"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''} /><span>Feature this petition on dashboards</span></label>
      <label class="field"><span>Follow-up update (optional)</span><textarea name="update" rows="2" placeholder="Post an update to students…"></textarea></label>
      <div class="divider"></div>
      <button type="button" class="btn danger sm" data-action="delete-petition" data-id="${p.id}">${icon('trash')} Delete petition</button>`,
    onSubmit: async (fd) => {
      await api(`/api/admin/petitions/${p.id}`, {
        method: 'PATCH',
        body: {
          title: fd.get('title'),
          description: fd.get('description'),
          status: fd.get('status'),
          target: Number(fd.get('target')),
          closingAt: fd.get('closingAt') ? new Date(fd.get('closingAt')).toISOString() : null,
          featured: fd.get('featured') === 'on',
        },
      });
      if (fd.get('update')) {
        await api(`/api/admin/petitions/${p.id}/updates`, { method: 'POST', body: { message: fd.get('update') } });
      }
      toast('Petition updated.', 'ok');
      render();
    },
  });
}

function pollMoreModal(p) {
  openModal({
    title: 'Manage poll',
    wide: true,
    submitLabel: 'Save changes',
    body: `
      <label class="field"><span>Title</span><input type="text" name="title" value="${esc(p.title)}" /></label>
      <label class="field"><span>Question</span><input type="text" name="question" value="${esc(p.question)}" /></label>
      <label class="field"><span>Status</span>
        <select name="status">
          ${Object.entries(POLL_STATUS).map(([k, v]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}
        </select>
      </label>
      <label class="field"><span>Closing date</span><input type="datetime-local" name="closesAt" value="${p.closesAt.slice(0, 16)}" /></label>
      <div class="divider"></div>
      <button type="button" class="btn danger sm" data-action="delete-poll" data-id="${p.id}">${icon('trash')} Delete poll</button>`,
    onSubmit: async (fd) => {
      await api(`/api/admin/polls/${p.id}`, {
        method: 'PATCH',
        body: {
          title: fd.get('title'),
          question: fd.get('question'),
          status: fd.get('status'),
          closesAt: fd.get('closesAt') ? new Date(fd.get('closesAt')).toISOString() : null,
        },
      });
      toast('Poll updated.', 'ok');
      render();
    },
  });
}

function editUserModal(u) {
  const perms = ['moderate', 'create_polls', 'view_identities', 'export'];
  openModal({
    title: 'Manage account',
    submitLabel: 'Save changes',
    body: `
      <p class="small muted">${esc(u.name)} · ${esc(u.email)}</p>
      <div class="grid g2">
        <label class="field"><span>Role</span>
          <select name="role">
            <option value="student" ${u.role === 'student' ? 'selected' : ''}>Student</option>
            <option value="teacher" ${u.role === 'teacher' ? 'selected' : ''}>Teacher / Moderator</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrator</option>
          </select>
        </label>
        <label class="field"><span>Account status</span>
          <select name="status">
            <option value="active" ${u.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="suspended" ${u.status === 'suspended' ? 'selected' : ''}>Suspended</option>
          </select>
        </label>
      </div>
      <label class="field"><span>Year group</span>
        <select name="yearGroup">${[7, 8, 9, 10, 11].map((y) => `<option value="${y}" ${u.yearGroup === y ? 'selected' : ''}>Year ${y}</option>`).join('')}</select>
      </label>
      <div class="field"><span>Staff permissions</span>
        ${perms
          .map(
            (p) => `<label class="check" style="margin-bottom:8px"><input type="checkbox" name="permissions" value="${p}" ${u.permissions.includes(p) ? 'checked' : ''} />
            <span class="small">${p.replace(/_/g, ' ')}</span></label>`
          )
          .join('')}
      </div>`,
    onSubmit: async (fd) => {
      await api(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        body: {
          role: fd.get('role'),
          status: fd.get('status'),
          yearGroup: Number(fd.get('yearGroup')),
          permissions: fd.getAll('permissions'),
        },
      });
      toast('Account updated.', 'ok');
      render();
    },
  });
}

function newUserModal() {
  openModal({
    title: 'Add account',
    submitLabel: 'Create account',
    body: `
      <label class="field"><span>Full name</span><input type="text" name="name" required /></label>
      <label class="field"><span>School email</span><input type="email" name="email" required /></label>
      <div class="grid g2">
        <label class="field"><span>Role</span>
          <select name="role"><option value="student">Student</option><option value="teacher">Teacher</option><option value="admin">Administrator</option></select>
        </label>
        <label class="field"><span>Year group (students)</span>
          <select name="yearGroup">${[7, 8, 9, 10, 11].map((y) => `<option value="${y}">Year ${y}</option>`).join('')}</select>
        </label>
      </div>
      <label class="field"><span>Temporary password</span><input type="text" name="password" required minlength="8" value="AmigsVoice2026!" /><div class="hint">Share this securely; the user should change it after signing in.</div></label>`,
    onSubmit: async (fd) => {
      await api('/api/admin/users', {
        method: 'POST',
        body: {
          name: fd.get('name'),
          email: fd.get('email'),
          role: fd.get('role'),
          yearGroup: Number(fd.get('yearGroup')),
          password: fd.get('password'),
        },
      });
      toast('Account created.', 'ok');
      render();
    },
  });
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

const actions = {
  async logout() {
    await api('/api/auth/logout', { method: 'POST' });
    state.me = null;
    location.hash = '#/login';
    render();
  },
  'toggle-theme'() {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('amigs-theme', next);
    render();
  },
  'toggle-sidebar'() {
    document.getElementById('sidebar')?.classList.toggle('open');
  },
  'new-petition'() {
    newPetitionModal();
  },
  'new-poll'() {
    newPollModal();
  },
  'new-user'() {
    newUserModal();
  },
  async sign(el) {
    el.disabled = true;
    try {
      const res = await api(`/api/petitions/${el.dataset.id}/sign`, { method: 'POST' });
      toast(`Signature recorded — ${res.signatures} signatures now.`, 'ok');
      render();
    } catch (err) {
      toast(err.message, 'err');
      el.disabled = false;
    }
  },
  async withdraw(el) {
    if (!(await confirmAction('Withdraw your signature from this petition?', 'Withdraw'))) return;
    try {
      await api(`/api/petitions/${el.dataset.id}/sign`, { method: 'DELETE' });
      toast('Signature withdrawn.', 'ok');
      render();
    } catch (err) {
      toast(err.message, 'err');
    }
  },
  'report-petition'(el) {
    openModal({
      title: 'Report this petition',
      submitLabel: 'Submit report',
      body: `<p class="small muted">Reports go to the moderation team. Tell us what is wrong with this content.</p>
        <label class="field"><span>Reason</span><textarea name="reason" rows="4" required></textarea></label>`,
      onSubmit: async (fd) => {
        await api(`/api/petitions/${el.dataset.id}/report`, { method: 'POST', body: { reason: fd.get('reason') } });
        toast('Report submitted. Thank you.', 'ok');
      },
    });
  },
  async 'petition-status'(el) {
    const status = el.dataset.status;
    if (status === 'rejected') {
      openModal({
        title: 'Reject petition',
        submitLabel: 'Reject petition',
        danger: true,
        body: `<p class="small muted">The student will be notified with your reason.</p>
          <label class="field"><span>Reason for rejection</span><textarea name="note" rows="4" required></textarea></label>`,
        onSubmit: async (fd) => {
          await api(`/api/admin/petitions/${el.dataset.id}`, { method: 'PATCH', body: { status, note: fd.get('note') } });
          toast('Petition rejected and author notified.', 'ok');
          render();
        },
      });
      return;
    }
    try {
      await api(`/api/admin/petitions/${el.dataset.id}`, { method: 'PATCH', body: { status } });
      toast(`Petition ${status === 'approved' ? 'approved and published' : 'updated'}.`, 'ok');
      render();
    } catch (err) {
      toast(err.message, 'err');
    }
  },
  'petition-respond'(el) {
    respondModal(el.dataset.id, el.dataset.title);
  },
  async 'petition-more'(el) {
    const d = await api(`/api/petitions/${el.dataset.id}`);
    petitionMoreModal(d.petition);
  },
  async 'delete-petition'(el) {
    if (!(await confirmAction('Permanently delete this petition and all its signatures?', 'Delete'))) return;
    try {
      await api(`/api/admin/petitions/${el.dataset.id}`, { method: 'DELETE' });
      closeModal();
      toast('Petition deleted.', 'ok');
      render();
    } catch (err) {
      toast(err.message, 'err');
    }
  },
  async 'poll-status'(el) {
    try {
      await api(`/api/admin/polls/${el.dataset.id}`, { method: 'PATCH', body: { status: el.dataset.status } });
      toast('Poll updated.', 'ok');
      render();
    } catch (err) {
      toast(err.message, 'err');
    }
  },
  async 'poll-more'(el) {
    const d = await api(`/api/polls/${el.dataset.id}`);
    pollMoreModal(d.poll);
  },
  async 'delete-poll'(el) {
    if (!(await confirmAction('Permanently delete this poll and all votes?', 'Delete'))) return;
    try {
      await api(`/api/admin/polls/${el.dataset.id}`, { method: 'DELETE' });
      closeModal();
      toast('Poll deleted.', 'ok');
      render();
    } catch (err) {
      toast(err.message, 'err');
    }
  },
  async 'edit-user'(el) {
    const d = await api('/api/admin/users');
    const u = d.users.find((x) => x.id === el.dataset.id);
    if (u) editUserModal(u);
  },
  async 'mark-all-read'() {
    await api('/api/notifications/read', { method: 'POST', body: {} });
    state.unread = 0;
    toast('All notifications marked as read.', 'ok');
    render();
  },
  async 'read-one'(el) {
    await api('/api/notifications/read', { method: 'POST', body: { id: el.dataset.id } });
    state.unread = Math.max(0, state.unread - 1);
    location.hash = el.getAttribute('href') || '#/notifications';
  },
  print() {
    window.print();
  },
  async 'seed-demo'() {
    if (!(await confirmAction('Load sample accounts, petitions and polls into this database?', 'Load sample data'))) return;
    try {
      await api('/api/admin/seed-demo', { method: 'POST' });
      toast('Sample data loaded.', 'ok');
      render();
    } catch (err) {
      toast(err.message, 'err');
    }
  },
};

/* ------------------------------------------------------------------ */
/* Forms                                                               */
/* ------------------------------------------------------------------ */

const forms = {
  async login(fd) {
    const res = await api('/api/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
    state.me = res.user;
    location.hash = '#/home';
    await boot();
  },
  async register(fd) {
    const res = await api('/api/auth/register', {
      method: 'POST',
      body: { name: fd.get('name'), email: fd.get('email'), password: fd.get('password'), yearGroup: Number(fd.get('yearGroup')) },
    });
    state.me = res.user;
    location.hash = '#/home';
    await boot();
  },
  async bootstrap(fd) {
    const res = await api('/api/bootstrap', { method: 'POST', body: { name: fd.get('name'), email: fd.get('email'), password: fd.get('password') } });
    state.me = res.user;
    location.hash = '#/admin';
    await boot();
  },
  async vote(fd, form) {
    const id = form.dataset.id;
    const selections = [...form.querySelectorAll('input[name=selection]:checked')].map((i) => Number(i.value));
    if (!selections.length) throw new Error('Select an option before submitting your vote.');
    const res = await api(`/api/polls/${id}/vote`, { method: 'POST', body: { selections } });
    toast('Your vote has been recorded.', 'ok');
    await render();
    if (res.results) toast('Results are now available.', 'ok');
  },
  async profile(fd) {
    const res = await api('/api/profile', { method: 'PATCH', body: { name: fd.get('name') } });
    state.me = res.user;
    toast('Profile updated.', 'ok');
    render();
  },
  async password(fd) {
    await api('/api/profile', { method: 'PATCH', body: { currentPassword: fd.get('currentPassword'), newPassword: fd.get('newPassword') } });
    toast('Password updated.', 'ok');
    render();
  },
  async settings(fd) {
    const body = {};
    for (const [k, v] of fd.entries()) body[k] = v;
    await api('/api/admin/settings', { method: 'PATCH', body });
    toast('Settings saved.', 'ok');
    await boot();
  },
};

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

const ROUTES = [
  ['/home', viewHome, 'home', true],
  ['/petitions', viewPetitions, 'petitions', true],
  ['/petitions/:id', viewPetitionDetail, 'petitions', true],
  ['/polls', viewPolls, 'polls', true],
  ['/polls/:id', viewPollDetail, 'polls', true],
  ['/results', viewResults, 'results', true],
  ['/activity', viewActivity, 'activity', true],
  ['/notifications', viewNotifications, 'notifications', true],
  ['/profile', viewProfile, 'profile', true],
  ['/help', viewHelp, 'help', true],
  ['/admin', viewAdminOverview, 'admin', 'staff'],
  ['/admin/petitions', viewAdminPetitions, 'admin-petitions', 'staff'],
  ['/admin/polls', viewAdminPolls, 'admin-polls', 'staff'],
  ['/admin/users', viewAdminUsers, 'admin-users', 'staff'],
  ['/admin/analytics', viewAdminAnalytics, 'admin-analytics', 'staff'],
  ['/admin/audit', viewAdminAudit, 'admin-audit', 'staff'],
  ['/admin/settings', viewAdminSettings, 'admin-settings', 'staff'],
];

function parseRoute() {
  const hash = location.hash.replace(/^#/, '') || '/home';
  const [pathPart, queryPart] = hash.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  for (const [pattern, view, nav, auth] of ROUTES) {
    const pp = pattern.split('/').filter(Boolean);
    if (pp.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < pp.length; i++) {
      if (pp[i].startsWith(':')) params[pp[i].slice(1)] = parts[i];
      else if (pp[i] !== parts[i]) { ok = false; break; }
    }
    if (ok) return { view, nav, auth, params, query: new URLSearchParams(queryPart || '') };
  }
  return { view: viewHome, nav: 'home', auth: true, params: {}, query: new URLSearchParams() };
}

async function render() {
  const route = parseRoute();
  const path = location.hash.replace(/^#/, '').split('?')[0] || '/home';

  if (!state.me) {
    if (path === '/signup') app.innerHTML = viewSignup();
    else if (path === '/setup') app.innerHTML = viewSetup();
    else app.innerHTML = viewLogin();
    return;
  }
  if (route.auth === 'staff' && state.me.role === 'student') {
    app.innerHTML = shell(`<div class="card empty">${icon('lock')}<p>You do not have access to the administration area.</p></div>`, 'home');
    return;
  }
  if (path === '/login' || path === '/signup' || path === '/setup') {
    location.hash = '#/home';
    return;
  }

  app.innerHTML = shell(`<div class="stack"><div class="skeleton" style="width:220px;height:26px"></div><div class="card card-pad"><div class="skeleton" style="width:100%;margin-bottom:10px"></div><div class="skeleton" style="width:70%"></div></div></div>`, route.nav);
  try {
    const html = await route.view(route.params.id);
    app.innerHTML = shell(html, route.nav);
    if (route.nav === 'activity') {
      document.querySelectorAll('[data-tab]').forEach((tab) => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('[data-tab]').forEach((t) => t.classList.remove('active'));
          document.querySelectorAll('.tab-panel').forEach((p) => (p.hidden = true));
          tab.classList.add('active');
          document.getElementById(tab.dataset.tab).hidden = false;
        });
      });
    }
  } catch (err) {
    if (err.status === 401) {
      state.me = null;
      app.innerHTML = viewLogin();
      return;
    }
    app.innerHTML = shell(`<div class="card empty">${icon('alert')}<p>${esc(err.message)}</p><a class="btn" href="#/home">Back to dashboard</a></div>`, route.nav);
  }
}

/* ------------------------------------------------------------------ */
/* Global listeners                                                    */
/* ------------------------------------------------------------------ */

document.addEventListener('click', async (e) => {
  if (e.target.classList && e.target.classList.contains('modal-backdrop')) {
    closeModal();
    return;
  }
  const closer = e.target.closest('[data-close-modal]');
  if (closer) {
    closeModal();
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  try {
    await fn(el);
  } catch (err) {
    toast(err.message || 'Something went wrong', 'err');
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = forms[form.dataset.form];
  if (!fn) return;
  const btn = form.querySelector('button[type=submit]');
  const original = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Please wait…';
  }
  try {
    await fn(new FormData(form), form);
  } catch (err) {
    toast(err.message || 'Something went wrong', 'err');
  } finally {
    if (btn && document.body.contains(btn)) {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }
});

document.addEventListener('change', (e) => {
  const f = e.target.closest('[data-filter]');
  if (f) {
    state.filters[f.dataset.filter] = f.value;
    render();
    return;
  }
  const af = e.target.closest('[data-admin-filter]');
  if (af) {
    state.adminFilters[af.dataset.adminFilter] = af.value;
    render();
  }
});

let searchTimer;
document.addEventListener('input', (e) => {
  const f = e.target.closest('[data-filter]');
  const af = e.target.closest('[data-admin-filter]');
  const target = f || af;
  if (!target) return;
  if (target.tagName !== 'INPUT' || target.type !== 'search') return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (f) state.filters[f.dataset.filter] = f.value;
    if (af) state.adminFilters[af.dataset.adminFilter] = af.value;
    render();
    const again = document.querySelector(`[data-filter="${target.dataset.filter || ''}"], [data-admin-filter="${target.dataset.adminFilter || ''}"]`);
    if (again) {
      again.focus();
      again.setSelectionRange(again.value.length, again.value.length);
    }
  }, 320);
});

window.addEventListener('hashchange', render);

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

async function boot() {
  const saved = localStorage.getItem('amigs-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  else if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.setAttribute('data-theme', 'dark');

  try {
    const me = await api('/api/me');
    state.me = me.user;
    state.settings = me.settings || {};
    state.unread = me.unread || 0;
  } catch {
    state.me = null;
  }

  if (!state.me) {
    try {
      const b = await api('/api/bootstrap/status');
      if (b.needsBootstrap && !location.hash.includes('setup')) {
        location.hash = '#/setup';
        app.innerHTML = viewSetup();
        return;
      }
    } catch {
      /* ignore */
    }
  }
  if (!location.hash) location.hash = state.me ? '#/home' : '#/login';
  await render();
}

boot();
