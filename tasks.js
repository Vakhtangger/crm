'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let allTasks  = [];
let allUsers  = [];
let taskActiveTab = 'assigned-to-me';

// ── Init (called by bootCRM after login) ──────────────────────────────────────
async function initTasks() {
  try {
    const [tasks, users] = await Promise.all([
      apiFetch('/api/tasks'),
      apiFetch('/api/users'),
    ]);
    allTasks = Array.isArray(tasks) ? tasks : [];
    allUsers = Array.isArray(users) ? users : [];
  } catch (e) {
    console.error('initTasks error:', e);
    allTasks = []; allUsers = [];
  }
  renderTasks();
  updateTaskBadge();
}
window.initTasks = initTasks;

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.task-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.task-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    taskActiveTab = btn.dataset.ttab;
    renderTasks();
  });
});

// ── Render ────────────────────────────────────────────────────────────────────
function renderTasks() {
  const me   = window.getAuthUser?.();
  const list = document.getElementById('tasks-list');
  if (!list || !me) return;

  const shown = allTasks.filter(t =>
    taskActiveTab === 'assigned-to-me'
      ? t.assigneeId === me.id
      : t.createdBy  === me.id
  );

  if (!shown.length) {
    list.innerHTML = `
      <div class="tasks-empty">
        <div class="tasks-empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
        </div>
        <div class="tasks-empty-title">
          ${taskActiveTab === 'assigned-to-me' ? 'No tasks assigned to you yet' : "You haven't assigned any tasks yet"}
        </div>
        <div class="tasks-empty-sub">
          ${taskActiveTab === 'assigned-to-me'
            ? 'Tasks assigned to you by teammates will appear here'
            : 'Click "Assign Task" to create and send a task to a teammate'}
        </div>
      </div>`;
    return;
  }

  list.innerHTML = shown.map(t => taskCardHTML(t, me)).join('');

  list.querySelectorAll('[data-task-done]').forEach(btn => {
    btn.addEventListener('click', () => markDone(btn.dataset.taskDone));
  });
  list.querySelectorAll('[data-task-delete]').forEach(btn => {
    btn.addEventListener('click', () => deleteTask(btn.dataset.taskDelete));
  });
  list.querySelectorAll('[data-task-ics]').forEach(btn => {
    btn.addEventListener('click', () => window.open(`/api/tasks/${btn.dataset.taskIcs}/invite.ics`, '_blank'));
  });
  list.querySelectorAll('[data-task-gcal]').forEach(btn => {
    btn.addEventListener('click', () => window.open(decodeURIComponent(btn.dataset.taskGcal), '_blank'));
  });
}

function taskCardHTML(t, me) {
  const isDone    = t.status === 'done';
  const isOverdue = t.dueDate && !isDone && new Date(t.dueDate + 'T23:59') < new Date();
  const isMine    = t.assigneeId === me.id;
  const gcalLink  = encodeURIComponent(buildGCalLink(t));
  const dateLabel = t.dueDate ? `${t.dueDate}${t.dueTime ? ' ' + t.dueTime : ''}` : null;

  return `
    <div class="task-card ${isDone ? 'task-done' : ''} ${isOverdue ? 'task-overdue' : ''}">
      <div class="task-card-left">
        <button class="task-check ${isDone ? 'checked' : ''}" data-task-done="${t.id}"
          title="${isDone ? 'Mark as pending' : 'Mark as done'}">
          ${isDone ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12"/></svg>` : ''}
        </button>
      </div>
      <div class="task-card-body">
        <div class="task-card-title">${esc3(t.title)}</div>
        ${t.description ? `<div class="task-card-desc">${esc3(t.description)}</div>` : ''}
        <div class="task-card-meta">
          ${dateLabel ? `<span class="task-meta-chip ${isOverdue ? 'chip-overdue' : ''}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            ${esc3(dateLabel)}${isOverdue ? ' · Overdue' : ''}
          </span>` : ''}
          ${t.companyName ? `<span class="task-meta-chip">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            </svg>
            ${esc3(t.companyName)}
          </span>` : ''}
          <span class="task-meta-chip">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            ${isMine
              ? `From: ${esc3(t.createdByName)}`
              : `To: ${esc3(t.assigneeName)}`}
          </span>
        </div>
      </div>
      <div class="task-card-actions">
        <button class="task-action-btn" data-task-gcal="${gcalLink}" title="Add to Google Calendar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          Google Cal
        </button>
        <button class="task-action-btn" data-task-ics="${t.id}" title="Download .ics calendar file">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          .ics
        </button>
        ${t.createdBy === me.id ? `
          <button class="task-action-btn task-action-danger" data-task-delete="${t.id}" title="Delete task">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            </svg>
          </button>` : ''}
      </div>
    </div>`;
}

function buildGCalLink(t) {
  const p = new URLSearchParams({ text: t.title });
  if (t.dueDate) {
    const [y,m,d] = t.dueDate.split('-').map(Number);
    const [hh,mm] = (t.dueTime || '09:00').split(':').map(Number);
    const start = new Date(y, m-1, d, hh, mm);
    const end   = new Date(start.getTime() + 60*60*1000);
    p.set('dates', `${fmtDT(start)}/${fmtDT(end)}`);
  }
  const details = [
    t.description,
    t.companyName && `Company: ${t.companyName}`,
    `Assigned by: ${t.createdByName} (${t.createdByEmail})`,
  ].filter(Boolean).join('\n');
  p.set('details', details);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&${p.toString()}`;
}

function fmtDT(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// ── Mark done ─────────────────────────────────────────────────────────────────
async function markDone(id) {
  const t = allTasks.find(x => x.id === id);
  if (!t) return;
  try {
    const updated = await apiFetch(`/api/tasks/${id}`, 'PATCH', {
      status: t.status === 'done' ? 'pending' : 'done',
    });
    const idx = allTasks.findIndex(x => x.id === id);
    if (idx !== -1) allTasks[idx] = updated;
    renderTasks();
    updateTaskBadge();
  } catch (e) {
    toast('❌ ' + e.message);
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────
async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  try {
    await apiFetch(`/api/tasks/${id}`, 'DELETE');
    allTasks = allTasks.filter(x => x.id !== id);
    renderTasks();
    updateTaskBadge();
    toast('🗑 Task deleted');
  } catch (e) {
    toast('❌ ' + e.message);
  }
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function updateTaskBadge() {
  const me      = window.getAuthUser?.();
  const pending = me
    ? allTasks.filter(t => t.assigneeId === me.id && t.status === 'pending').length
    : 0;
  ['tasks-nav-count', 'tasks-bottom-badge'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = pending || '';
    el.classList.toggle('visible', pending > 0);
  });
}

// ── Assign Task modal ─────────────────────────────────────────────────────────
window.openTaskModal = openTaskModal;   // expose so HTML onclick can reach it too
document.getElementById('btn-add-task').addEventListener('click', () => openTaskModal());

function openTaskModal() {
  // Build company dropdown from CRM data (exposed by app.js)
  const crmData = window.getCRMdb?.() || [];
  const companyOptions = crmData
    .filter(c => c['Company Name'])
    .map(c => `<option value="${esc3(c['ID'])}" data-name="${esc3(c['Company Name'])}">${esc3(c['Company Name'])}</option>`)
    .join('');

  document.getElementById('task-modal-body').innerHTML = `
    <div class="form-section">
      <div class="form-section-title">Task Details</div>
      <div class="form-grid" style="grid-template-columns:1fr">
        <div class="form-group">
          <label>Task Title *</label>
          <input type="text" id="task-title" placeholder="e.g. Follow up with client about samples" />
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="task-desc" placeholder="Additional notes…" rows="3"></textarea>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Schedule</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Due Date</label>
          <input type="date" id="task-date" min="${new Date().toISOString().slice(0, 10)}" />
        </div>
        <div class="form-group">
          <label>Time</label>
          <input type="time" id="task-time" value="09:00" />
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Assignment</div>
      <div class="form-grid" style="grid-template-columns:1fr">
        <div class="form-group">
          <label>Assign to (email) *</label>
          <div style="position:relative">
            <input type="email" id="task-assignee" placeholder="colleague@email.com" autocomplete="off" />
            <div id="user-suggestions" class="user-suggestions hidden"></div>
          </div>
          <div class="auth-hint">Must be a registered CRM account</div>
        </div>
        ${companyOptions ? `
        <div class="form-group">
          <label>Linked Company (optional)</label>
          <select id="task-company">
            <option value="">— None —</option>
            ${companyOptions}
          </select>
        </div>` : ''}
      </div>
    </div>

    <div id="task-email-notice" class="task-email-notice hidden">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span id="task-email-notice-text"></span>
    </div>`;

  // Live autocomplete for registered users
  const input = document.getElementById('task-assignee');
  const sugg  = document.getElementById('user-suggestions');

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    if (!q || !allUsers.length) { sugg.classList.add('hidden'); return; }
    const me = window.getAuthUser?.();
    const matches = allUsers.filter(u =>
      u.id !== me?.id &&
      (u.email.toLowerCase().includes(q) || (u.displayName||'').toLowerCase().includes(q))
    );
    if (!matches.length) { sugg.classList.add('hidden'); return; }
    sugg.innerHTML = matches.slice(0, 6).map(u => `
      <div class="user-suggestion-item" data-email="${esc3(u.email)}">
        <div class="user-sugg-avatar">${(u.displayName || u.email)[0].toUpperCase()}</div>
        <div>
          <div class="user-sugg-name">${esc3(u.displayName || u.email)}</div>
          <div class="user-sugg-email">${esc3(u.email)}</div>
        </div>
      </div>`).join('');
    sugg.classList.remove('hidden');
    sugg.querySelectorAll('.user-suggestion-item').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault(); // prevent input blur before click
        input.value = el.dataset.email;
        sugg.classList.add('hidden');
      });
    });
  });
  input.addEventListener('blur', () => setTimeout(() => sugg.classList.add('hidden'), 150));

  // SMTP notice
  apiFetch('/api/smtp').then(s => {
    if (s.configured) return;
    const notice = document.getElementById('task-email-notice');
    const txt    = document.getElementById('task-email-notice-text');
    if (!notice || !txt) return;
    txt.innerHTML = `Email not configured — assignee won't receive a notification email.
      <button class="link-btn" id="open-smtp-link">Set up email →</button>`;
    notice.classList.remove('hidden');
    document.getElementById('open-smtp-link')?.addEventListener('click', () => {
      closeTaskModal();
      openSmtpModal();
    });
  }).catch(() => {});

  document.getElementById('task-modal-overlay').classList.remove('hidden');
  // focus title after render
  setTimeout(() => document.getElementById('task-title')?.focus(), 50);
}

function closeTaskModal() {
  document.getElementById('task-modal-overlay').classList.add('hidden');
}

document.getElementById('task-modal-close').addEventListener('click', closeTaskModal);
document.getElementById('task-modal-cancel').addEventListener('click', closeTaskModal);
document.getElementById('task-modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeTaskModal();
});

document.getElementById('task-modal-save').addEventListener('click', async () => {
  const titleEl    = document.getElementById('task-title');
  const descEl     = document.getElementById('task-desc');
  const dateEl     = document.getElementById('task-date');
  const timeEl     = document.getElementById('task-time');
  const assigneeEl = document.getElementById('task-assignee');
  const coSel      = document.getElementById('task-company');

  const title    = titleEl?.value.trim() || '';
  const desc     = descEl?.value.trim()  || '';
  const dueDate  = dateEl?.value         || '';
  const dueTime  = timeEl?.value         || '09:00';
  const assignee = assigneeEl?.value.trim() || '';
  const companyId   = coSel?.value || null;
  const companyName = coSel?.options?.[coSel.selectedIndex]?.dataset.name || null;

  if (!title)    { toast('⚠️ Please enter a task title');    return; }
  if (!assignee) { toast('⚠️ Please enter an assignee email'); return; }

  const btn = document.getElementById('task-modal-save');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Assigning…';

  try {
    const result = await apiFetch('/api/tasks', 'POST', {
      title, description: desc, dueDate, dueTime,
      assigneeEmail: assignee, companyId, companyName,
    });

    allTasks.push(result.task);
    closeTaskModal();
    renderTasks();
    updateTaskBadge();

    if (result.emailSent) {
      toast(`✅ Task assigned — invite sent to ${result.task.assigneeEmail}`);
    } else {
      toast(`✅ Task assigned to ${result.task.assigneeName}`);
    }
  } catch (e) {
    console.error('assign task error:', e);
    toast('❌ ' + (e.message || 'Failed to assign task'));
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Assign &amp; Send Invite`;
  }
});

// ── SMTP modal ────────────────────────────────────────────────────────────────
document.getElementById('btn-smtp-settings').addEventListener('click', () => openSmtpModal());

async function openSmtpModal() {
  let s = {};
  try { s = await apiFetch('/api/smtp'); } catch (e) { console.warn(e); }

  document.getElementById('smtp-modal-body').innerHTML = `
    <p style="font-size:13px;color:var(--text-2);margin-bottom:20px;line-height:1.6">
      Configure an outgoing email account so task invites are sent automatically.
      For Gmail, use an
      <a href="https://myaccount.google.com/apppasswords" target="_blank" style="color:var(--green)">
        App Password
      </a> (requires 2-step verification to be on).
    </p>
    <div class="form-grid" style="grid-template-columns:1fr 110px">
      <div class="form-group">
        <label>SMTP Host</label>
        <input type="text" id="smtp-host" value="${esc3(s.host || 'smtp.gmail.com')}" placeholder="smtp.gmail.com" />
      </div>
      <div class="form-group">
        <label>Port</label>
        <input type="number" id="smtp-port" value="${s.port || 587}" placeholder="587" />
      </div>
    </div>
    <div class="form-grid" style="grid-template-columns:1fr;margin-top:12px">
      <div class="form-group">
        <label>Your Email (sender address)</label>
        <input type="email" id="smtp-user" value="${esc3(s.user || '')}" placeholder="yourname@gmail.com" />
      </div>
      <div class="form-group" style="margin-top:12px">
        <label>Password / App Password</label>
        <input type="password" id="smtp-pass" placeholder="${s.configured ? '••••••• (leave blank to keep current)' : 'Enter password'}" autocomplete="new-password" />
      </div>
    </div>
    <div id="smtp-test-result" class="smtp-test-result hidden"></div>`;

  document.getElementById('smtp-modal-overlay').classList.remove('hidden');
}

document.getElementById('smtp-modal-close').addEventListener('click', () => {
  document.getElementById('smtp-modal-overlay').classList.add('hidden');
});
document.getElementById('smtp-modal-cancel').addEventListener('click', () => {
  document.getElementById('smtp-modal-overlay').classList.add('hidden');
});

document.getElementById('smtp-modal-save').addEventListener('click', async () => {
  const host    = document.getElementById('smtp-host')?.value.trim();
  const port    = document.getElementById('smtp-port')?.value;
  const user    = document.getElementById('smtp-user')?.value.trim();
  const pass    = document.getElementById('smtp-pass')?.value;
  const result  = document.getElementById('smtp-test-result');
  const btn     = document.getElementById('smtp-modal-save');

  if (!host || !user) { toast('⚠️ Fill in SMTP host and email'); return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Testing…';
  result.className = 'smtp-test-result hidden';

  try {
    await apiFetch('/api/smtp', 'PUT', { host, port: +port, user, pass });
    result.className = 'smtp-test-result smtp-ok';
    result.innerHTML = `✅ Connected! Emails will be sent from <strong>${esc3(user)}</strong>.`;
    result.classList.remove('hidden');
    toast('✅ Email settings saved');
    setTimeout(() => document.getElementById('smtp-modal-overlay').classList.add('hidden'), 2200);
  } catch (e) {
    result.className = 'smtp-test-result smtp-err';
    result.innerHTML = `❌ ${esc3(e.message)}`;
    result.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Save &amp; Test';
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc3(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
