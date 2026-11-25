/* AMIGS Voice — administration views (loaded before app.js) */
'use strict';

async function viewAdminOverview() {
  const d = await api('/api/admin/overview');
  const s = d.stats;
  const stat = (label, value, foot, ico) => `<div class="card stat">
    <div class="between"><span class="label">${label}</span><span class="ico">${icon(ico)}</span></div>
    <div class="value">${fmtNum(value)}</div><div class="foot">${foot}</div></div>`;
  const trend = d.signupTrend.map((r) => ({ label: r.day.slice(5), value: r.n }));
  return `
    <div class="page-head"><div><h1>Administrator dashboard</h1><div class="sub">Live platform overview for ${esc(state.settings.schoolName || 'the school')}.</div></div>
      <div class="actions"><a class="btn ghost" href="/api/export/petitions.csv">${icon('download')} Export petitions</a></div></div>
    <div class="grid g4" style="margin-bottom:18px">
      ${stat('Registered students', s.totalStudents, `${s.totalStaff} staff accounts`, 'users')}
      ${stat('Total petitions', s.totalPetitions, `${s.pending} awaiting review`, 'petition')}
      ${stat('Active polls', s.activePolls, `${s.closedPolls} closed`, 'poll')}
      ${stat('Total signatures', s.totalSignatures, `${s.signatureParticipation}% of students have signed`, 'check')}
    </div>
    <div class="grid g4" style="margin-bottom:20px">
      ${stat('Pending review', s.pending, 'Requires moderation', 'clock')}
      ${stat('Approved petitions', s.approved, 'Published and open', 'check')}
      ${stat('Rejected petitions', s.rejected, 'Not published', 'x')}
      ${stat('Total votes', s.totalVotes, `${s.votingParticipation}% voting participation`, 'results')}
    </div>
    <div class="grid g2" style="align-items:start">
      <div class="card card-pad">
        <h2 style="margin-bottom:12px">Signatures over the last 14 days</h2>
        ${lineChart(trend)}
      </div>
      <div class="card card-pad">
        <h2 style="margin-bottom:12px">Petitions by status</h2>
        ${barList(d.byStatus.map((r) => ({ label: (PETITION_STATUS[r.status] || [r.status])[0], value: r.n })))}
      </div>
      <div class="card card-pad">
        <h2 style="margin-bottom:12px">Petitions by category</h2>
        ${barList(d.byCategory.map((r) => ({ label: r.category, value: r.n })))}
      </div>
      <div class="card card-pad">
        <h2 style="margin-bottom:12px">Students by year group</h2>
        ${barList(d.byYear.map((r) => ({ label: `Year ${r.year}`, value: r.n })))}
      </div>
    </div>
    <div class="card card-pad" style="margin-top:18px">
      <h2 style="margin-bottom:12px">Recent poll participation</h2>
      ${barList(d.pollParticipation.map((r) => ({ label: r.title, value: r.votes })), { suffix: ' votes' })}
    </div>`;
}

async function viewAdminPetitions() {
  const f = state.adminFilters;
  const qs = new URLSearchParams({ status: f.petitionStatus, q: f.petitionQ });
  const d = await api(`/api/admin/petitions?${qs}`);
  return `
    <div class="page-head"><div><h1>Petition management</h1><div class="sub">Review, approve, edit and respond to student submissions.</div></div>
      <div class="actions"><a class="btn ghost" href="/api/export/petitions.csv">${icon('download')} Export CSV</a></div></div>
    ${d.reports.length ? `<div class="notice warn" style="margin-bottom:16px">${icon('flag')}<div><strong>${d.reports.length} open report${d.reports.length === 1 ? '' : 's'}.</strong> Reported content is flagged below for review.</div></div>` : ''}
    <div class="toolbar">
      <input type="search" placeholder="Search petitions…" value="${esc(f.petitionQ)}" data-admin-filter="petitionQ" aria-label="Search petitions" />
      <select data-admin-filter="petitionStatus" aria-label="Filter by status">
        <option value="">All statuses</option>
        ${Object.entries(PETITION_STATUS).map(([k, v]) => `<option value="${k}" ${f.petitionStatus === k ? 'selected' : ''}>${v[0]}</option>`).join('')}
      </select>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Petition</th><th>Author</th><th>Status</th><th>Signatures</th><th>Created</th><th>Actions</th></tr></thead>
      <tbody>
        ${
          d.petitions.length
            ? d.petitions
                .map(
                  (p) => `<tr>
                    <td style="max-width:320px">
                      <a href="#/petitions/${p.id}" style="font-weight:600">${esc(p.title)}</a>
                      <div class="tiny muted">${esc(p.category)} · Years ${p.eligibleYears.join(', ')}${p.featured ? ' · Featured' : ''}</div>
                    </td>
                    <td class="small">${esc(p.author)}<div class="tiny muted">Year ${p.authorYear}</div></td>
                    <td>${pill(PETITION_STATUS, p.status)}</td>
                    <td class="mono">${fmtNum(p.signatures)} / ${fmtNum(p.target)}</td>
                    <td class="small muted">${fmtDate(p.createdAt)}</td>
                    <td>
                      <div class="row" style="gap:6px;flex-wrap:nowrap">
                        ${p.status === 'pending' ? `<button class="btn sm" data-action="petition-status" data-id="${p.id}" data-status="approved">Approve</button>
                          <button class="btn ghost sm" data-action="petition-status" data-id="${p.id}" data-status="rejected">Reject</button>` : ''}
                        <button class="btn ghost sm" data-action="petition-respond" data-id="${p.id}" data-title="${esc(p.title)}">Respond</button>
                        <button class="btn ghost sm" data-action="petition-more" data-id="${p.id}" aria-label="More actions">${icon('settings')}</button>
                      </div>
                    </td>
                  </tr>`
                )
                .join('')
            : `<tr><td colspan="6"><div class="empty">${icon('petition')}<p>No petitions match your filters.</p></div></td></tr>`
        }
      </tbody>
    </table></div>`;
}

async function viewAdminPolls() {
  const d = await api('/api/admin/polls');
  return `
    <div class="page-head"><div><h1>Poll management</h1><div class="sub">Create, schedule, open and close school polls.</div></div>
      <div class="actions"><button class="btn" data-action="new-poll">${icon('plus')} Create poll</button></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Poll</th><th>Status</th><th>Mode</th><th>Votes</th><th>Participation</th><th>Closes</th><th>Actions</th></tr></thead>
      <tbody>
        ${
          d.polls.length
            ? d.polls
                .map(
                  (p) => `<tr>
                    <td style="max-width:300px"><a href="#/polls/${p.id}" style="font-weight:600">${esc(p.title)}</a>
                      <div class="tiny muted">${esc(p.question)}</div></td>
                    <td>${pill(POLL_STATUS, p.status)}</td>
                    <td class="small">${p.votingMode === 'anonymous' ? 'Anonymous' : 'Identified'}</td>
                    <td class="mono">${fmtNum(p.totalVotes)}</td>
                    <td class="mono">${p.results.participationRate}%</td>
                    <td class="small muted">${fmtDateTime(p.closesAt)}</td>
                    <td>
                      <div class="row" style="gap:6px;flex-wrap:nowrap">
                        ${p.status === 'scheduled' ? `<button class="btn sm" data-action="poll-status" data-id="${p.id}" data-status="open">Open</button>` : ''}
                        ${p.status === 'open' ? `<button class="btn ghost sm" data-action="poll-status" data-id="${p.id}" data-status="closed">Close</button>` : ''}
                        <a class="btn ghost sm" href="/api/export/poll/${p.id}">CSV</a>
                        <button class="btn ghost sm" data-action="poll-more" data-id="${p.id}" aria-label="More actions">${icon('settings')}</button>
                      </div>
                    </td>
                  </tr>`
                )
                .join('')
            : `<tr><td colspan="7"><div class="empty">${icon('poll')}<p>No polls have been created yet.</p></div></td></tr>`
        }
      </tbody>
    </table></div>`;
}

async function viewAdminUsers() {
  const f = state.adminFilters;
  const qs = new URLSearchParams({ q: f.userQ, year: f.userYear, role: f.userRole });
  const d = await api(`/api/admin/users?${qs}`);
  return `
    <div class="page-head"><div><h1>Student accounts</h1><div class="sub">Manage roles, permissions and account status.</div></div>
      <div class="actions">
        ${d.canManage ? `<button class="btn" data-action="new-user">${icon('plus')} Add account</button>
        <a class="btn ghost" href="/api/export/users.csv">${icon('download')} Export CSV</a>` : ''}
      </div></div>
    <div class="toolbar">
      <input type="search" placeholder="Search name or email…" value="${esc(f.userQ)}" data-admin-filter="userQ" aria-label="Search accounts" />
      <select data-admin-filter="userYear" aria-label="Year group"><option value="">All years</option>
        ${[7, 8, 9, 10, 11].map((y) => `<option value="${y}" ${String(f.userYear) === String(y) ? 'selected' : ''}>Year ${y}</option>`).join('')}
      </select>
      <select data-admin-filter="userRole" aria-label="Role"><option value="">All roles</option>
        <option value="student" ${f.userRole === 'student' ? 'selected' : ''}>Students</option>
        <option value="teacher" ${f.userRole === 'teacher' ? 'selected' : ''}>Teachers</option>
        <option value="admin" ${f.userRole === 'admin' ? 'selected' : ''}>Administrators</option>
      </select>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>School email</th><th>Year</th><th>Role</th><th>Permissions</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${d.users
          .map(
            (u) => `<tr>
              <td style="font-weight:600">${esc(u.name)}</td>
              <td class="small muted">${esc(u.email)}</td>
              <td class="small">${u.yearGroup ? 'Year ' + u.yearGroup : '—'}</td>
              <td><span class="pill ${u.role === 'admin' ? '' : u.role === 'teacher' ? 'warn' : 'neutral'}">${u.role}</span></td>
              <td class="tiny muted">${u.permissions.length ? u.permissions.join(', ') : '—'}</td>
              <td><span class="pill ${u.status === 'active' ? 'ok' : 'danger'}">${u.status}</span></td>
              <td>${d.canManage ? `<button class="btn ghost sm" data-action="edit-user" data-id="${u.id}">Manage</button>` : '<span class="tiny muted">View only</span>'}</td>
            </tr>`
          )
          .join('')}
      </tbody>
    </table></div>`;
}

async function viewAdminAnalytics() {
  const d = await api('/api/admin/overview');
  const s = d.stats;
  return `
    <div class="page-head"><div><h1>Analytics</h1><div class="sub">Participation, engagement and exportable reports.</div></div>
      <div class="actions">
        <a class="btn ghost" href="/api/export/petitions.csv">${icon('download')} Petitions CSV</a>
        <a class="btn ghost" href="/api/export/users.csv">${icon('download')} Accounts CSV</a>
        <button class="btn ghost" data-action="print">${icon('printer')} Print report</button>
      </div></div>
    <div class="grid g4" style="margin-bottom:18px">
      <div class="card stat"><div class="label">Signature participation</div><div class="value">${s.signatureParticipation}%</div><div class="foot">of registered students</div></div>
      <div class="card stat"><div class="label">Voting participation</div><div class="value">${s.votingParticipation}%</div><div class="foot">of registered students</div></div>
      <div class="card stat"><div class="label">Total signatures</div><div class="value">${fmtNum(s.totalSignatures)}</div></div>
      <div class="card stat"><div class="label">Total votes</div><div class="value">${fmtNum(s.totalVotes)}</div></div>
    </div>
    <div class="grid g2" style="align-items:start">
      <div class="card card-pad"><h2 style="margin-bottom:12px">Signatures trend</h2>${lineChart(d.signupTrend.map((r) => ({ label: r.day.slice(5), value: r.n })))}</div>
      <div class="card card-pad"><h2 style="margin-bottom:12px">Petitions by category</h2>${barList(d.byCategory.map((r) => ({ label: r.category, value: r.n })))}</div>
      <div class="card card-pad"><h2 style="margin-bottom:12px">Students by year group</h2>${barList(d.byYear.map((r) => ({ label: `Year ${r.year}`, value: r.n })))}</div>
      <div class="card card-pad"><h2 style="margin-bottom:12px">Poll participation</h2>${barList(d.pollParticipation.map((r) => ({ label: r.title, value: r.votes })), { suffix: ' votes' })}</div>
    </div>`;
}

async function viewAdminAudit() {
  const d = await api(`/api/admin/audit?q=${encodeURIComponent(state.adminFilters.auditQ)}`);
  return `
    <div class="page-head"><div><h1>Audit log</h1><div class="sub">Every administrative action, with date, time and responsible administrator.</div></div>
      <div class="actions"><a class="btn ghost" href="/api/export/audit.csv">${icon('download')} Export CSV</a></div></div>
    <div class="toolbar"><input type="search" placeholder="Search actions…" value="${esc(state.adminFilters.auditQ)}" data-admin-filter="auditQ" aria-label="Search audit log" /></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Date &amp; time</th><th>Administrator</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
      <tbody>
        ${
          d.entries.length
            ? d.entries
                .map(
                  (e) => `<tr><td class="small muted" style="white-space:nowrap">${fmtDateTime(e.created_at)}</td>
                    <td class="small">${esc(e.actor_name || 'system')}</td>
                    <td><span class="pill neutral">${esc(e.action)}</span></td>
                    <td class="tiny muted">${esc(e.target_type || '')} ${esc(e.target_id || '')}</td>
                    <td class="small muted" style="max-width:340px">${esc(e.details || '')}</td></tr>`
                )
                .join('')
            : `<tr><td colspan="5"><div class="empty">${icon('list')}<p>No audit entries yet.</p></div></td></tr>`
        }
      </tbody>
    </table></div>`;
}

async function viewAdminSettings() {
  const d = await api('/api/admin/settings');
  const s = d.settings;
  return `
    <div class="page-head"><div><h1>Settings</h1><div class="sub">School-wide configuration for AMIGS Voice.</div></div></div>
    <div class="grid split">
      <div class="card card-pad">
        <h2 style="margin-bottom:14px">Platform</h2>
        <form data-form="settings">
          <label class="field"><span>School name</span><input type="text" name="school_name" value="${esc(s.school_name)}" /></label>
          <label class="field"><span>Platform name</span><input type="text" name="platform_name" value="${esc(s.platform_name)}" /></label>
          <label class="field"><span>Tagline</span><input type="text" name="tagline" value="${esc(s.tagline)}" /></label>
          <label class="field"><span>School announcement</span><textarea name="announcement" rows="3">${esc(s.announcement)}</textarea><div class="hint">Shown on every student dashboard.</div></label>
          <button class="btn" type="submit">Save settings</button>
        </form>
      </div>
      <div class="stack">
        <div class="card card-pad">
          <h2 style="margin-bottom:14px">Accounts &amp; privacy</h2>
          <form data-form="settings">
            <label class="field"><span>Student email domain</span><input type="text" name="student_email_domain" value="${esc(s.student_email_domain)}" /><div class="hint">Only addresses on this domain can register as students.</div></label>
            <label class="field"><span>Staff invite code</span><input type="text" name="staff_invite_code" value="${esc(s.staff_invite_code)}" /><div class="hint">Required for staff self-registration. Leave blank to disable.</div></label>
            <label class="field"><span>Author display</span>
              <select name="author_display">
                <option value="initials" ${s.author_display === 'initials' ? 'selected' : ''}>First name + surname initial</option>
                <option value="full" ${s.author_display === 'full' ? 'selected' : ''}>Full name</option>
                <option value="anonymous" ${s.author_display === 'anonymous' ? 'selected' : ''}>Anonymous student</option>
              </select>
            </label>
            <label class="field"><span>Signature withdrawal</span>
              <select name="allow_signature_withdrawal">
                <option value="1" ${s.allow_signature_withdrawal === '1' ? 'selected' : ''}>Allowed</option>
                <option value="0" ${s.allow_signature_withdrawal === '0' ? 'selected' : ''}>Not allowed</option>
              </select>
            </label>
            <label class="field"><span>Data retention (days)</span><input type="number" name="retention_days" value="${esc(s.retention_days)}" min="30" max="3650" /></label>
            <label class="field"><span>Safeguarding contact</span><input type="text" name="safeguarding_contact" value="${esc(s.safeguarding_contact)}" /></label>
            <button class="btn" type="submit">Save settings</button>
          </form>
        </div>
        <div class="card card-pad">
          <h2 style="margin-bottom:8px">Sample data</h2>
          <p class="small muted">Load a set of real sample accounts, petitions and polls so staff can evaluate the platform. This creates genuine database records and can only be run once.</p>
          <button class="btn ghost" data-action="seed-demo">${icon('refresh')} Load sample data</button>
        </div>
      </div>
    </div>`;
}
