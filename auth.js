'use strict';

// ── Auth state ────────────────────────────────────────────────────────────────
let currentUser = null;
let authToken   = null;

// ── Boot: check stored token ──────────────────────────────────────────────────
(async function initAuth() {
  const saved = localStorage.getItem('crm_token');
  if (saved) {
    showWakingUp(true);
    try {
      const res = await apiFetch('/api/me', 'GET', null, saved);
      if (res.user) {
        authToken   = saved;
        currentUser = res.user;
        showWakingUp(false);
        showApp();
        return;
      }
    } catch { /* invalid or expired token */ }
    showWakingUp(false);
    localStorage.removeItem('crm_token');
  }
  showAuthScreen('login');
})();

function showWakingUp(show) {
  let el = document.getElementById('wakeup-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'wakeup-banner';
    el.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      background:#1a3530;
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
      font-family:'Inter',-apple-system,sans-serif;
    `;
    el.innerHTML = `
      <img src="logo.svg" style="width:56px;height:56px;border-radius:14px;box-shadow:0 4px 20px rgba(0,0,0,.3)" />
      <div style="color:#f0ede5;font-size:18px;font-weight:800;letter-spacing:-.03em">Zewood CRM</div>
      <div style="color:rgba(240,237,229,.5);font-size:13px">Starting up, please wait…</div>
      <div style="width:40px;height:40px;border:3px solid rgba(240,237,229,.15);border-top-color:#a8d5c8;border-radius:50%;animation:spin .7s linear infinite"></div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    `;
    document.body.appendChild(el);
  }
  el.style.display = show ? 'flex' : 'none';
}

// ── Show/hide ─────────────────────────────────────────────────────────────────
function showAuthScreen(mode) {
  const el = document.getElementById('auth-screen');
  el.classList.remove('hidden');
  el.innerHTML = buildHTML(mode);
  wireForm(mode);
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  // Apply role class to body so CSS can hide admin-only elements
  document.body.classList.remove('role-admin', 'role-member');
  document.body.classList.add('role-' + (currentUser?.role || 'member'));
  renderUserUI();
  if (typeof bootCRM === 'function') bootCRM();
}

// ── Build HTML ────────────────────────────────────────────────────────────────
function buildHTML(mode) {
  const isLogin = mode === 'login';
  return `
    <div class="auth-card">

      <div class="auth-logo">
        <img src="logo.svg" alt="Zewood" class="auth-logo-img" />
        <div>
          <div class="auth-logo-text">Zewood CRM</div>
          <div class="auth-logo-sub">Client Relationship Management</div>
        </div>
      </div>

      <div class="auth-title">${isLogin ? 'Welcome back' : 'Create your account'}</div>
      <div class="auth-subtitle">${isLogin ? 'Sign in with your email to continue' : 'Start managing your clients in seconds'}</div>

      <div id="auth-error" class="auth-error hidden">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span id="auth-error-text"></span>
      </div>

      <form class="auth-form" id="auth-form" novalidate>

        ${!isLogin ? `
        <div class="auth-field">
          <label>Full Name <span class="auth-optional">(optional)</span></label>
          <div class="auth-input-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <input class="auth-input" type="text" name="displayName" placeholder="e.g. Giorgi Beridze" autocomplete="name" />
          </div>
        </div>
        <div class="auth-field">
          <label>Admin Code <span class="auth-optional">(leave blank if you are a regular member)</span></label>
          <div class="auth-input-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <input class="auth-input" type="password" name="adminCode" placeholder="Enter admin code to get admin access" autocomplete="off" />
          </div>
          <div class="auth-hint">Only enter this if you are an admin. Regular members leave this empty.</div>
        </div>` : ''}

        <div class="auth-field">
          <label>Email Address</label>
          <div class="auth-input-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            <input class="auth-input" type="email" name="email"
              placeholder="${isLogin ? 'your@email.com' : 'your@email.com'}"
              autocomplete="email" required />
          </div>
        </div>

        <div class="auth-field">
          <label>Password</label>
          <div class="auth-input-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <input class="auth-input" type="password" name="password" id="auth-pwd"
              placeholder="${isLogin ? 'Enter your password' : 'At least 6 characters'}"
              autocomplete="${isLogin ? 'current-password' : 'new-password'}" required />
            <button type="button" class="pwd-toggle" id="pwd-toggle" title="Show / hide">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" id="eye-icon">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
          ${!isLogin ? `<div class="auth-hint">Minimum 6 characters</div>` : ''}
        </div>

        <button type="submit" class="auth-btn" id="auth-submit">
          ${isLogin ? 'Sign In' : 'Create Account'}
        </button>

      </form>

      <div class="auth-switch">
        ${isLogin
          ? `Don't have an account? <button class="auth-switch-link" id="auth-toggle">Sign up free</button>`
          : `Already have an account? <button class="auth-switch-link" id="auth-toggle">Sign in</button>`}
      </div>

    </div>`;
}

// ── Wire form ─────────────────────────────────────────────────────────────────
function wireForm(mode) {
  const isLogin = mode === 'login';

  // show/hide password
  document.getElementById('pwd-toggle').addEventListener('click', () => {
    const inp  = document.getElementById('auth-pwd');
    const icon = document.getElementById('eye-icon');
    const show = inp.type === 'password';
    inp.type   = show ? 'text' : 'password';
    icon.innerHTML = show
      ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>`
      : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
  });

  // switch login ↔ register
  document.getElementById('auth-toggle').addEventListener('click', () => {
    showAuthScreen(isLogin ? 'register' : 'login');
  });

  // submit
  document.getElementById('auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form   = e.target;
    const btn    = document.getElementById('auth-submit');
    const errBox = document.getElementById('auth-error');
    const errTxt = document.getElementById('auth-error-text');

    // client-side validation
    const email    = form.email.value.trim();
    const password = form.password.value;
    if (!email || !email.includes('@')) {
      return showError(errBox, errTxt, 'Please enter a valid email address');
    }
    if (password.length < 6) {
      return showError(errBox, errTxt, 'Password must be at least 6 characters');
    }

    errBox.classList.add('hidden');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>${isLogin ? 'Signing in…' : 'Creating account…'}`;

    const body = { email, password };
    if (!isLogin) {
      body.displayName = (form.displayName?.value || '').trim();
      body.adminCode   = (form.adminCode?.value || '').trim();
    }

    try {
      const res   = await apiFetch(isLogin ? '/api/login' : '/api/register', 'POST', body);
      authToken   = res.token;
      currentUser = res.user;
      localStorage.setItem('crm_token', authToken);
      showApp();
    } catch (err) {
      const msg = err.message === 'Failed to fetch'
        ? 'Cannot connect to server. Open the app via http://localhost:3456 (not as a file).'
        : (err.message || 'Something went wrong');
      showError(errBox, errTxt, msg);
      btn.disabled = false;
      btn.innerHTML = isLogin ? 'Sign In' : 'Create Account';
    }
  });
}

function showError(box, txt, msg) {
  txt.textContent = msg;
  box.classList.remove('hidden');
  // shake animation
  box.style.animation = 'none';
  box.offsetHeight;
  box.style.animation = 'shake .3s ease';
}

// ── Render user info in sidebar ───────────────────────────────────────────────
function renderUserUI() {
  if (!currentUser) return;
  const name     = currentUser.displayName || currentUser.email;
  const initials = name.split(/[\s@]+/).map(w => w[0]).join('').slice(0,2).toUpperCase();

  // sidebar user block
  const footer = document.querySelector('.sidebar-footer');
  if (footer) {
    let menu = document.getElementById('user-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'user-menu';
      menu.className = 'user-menu';
      footer.parentNode.insertBefore(menu, footer);
    }
    menu.innerHTML = `
      <div class="user-avatar">${initials}</div>
      <div class="user-info">
        <div class="user-name">${esc2(name)}</div>
        <div class="user-role">
          ${esc2(currentUser.email)}
          <span class="role-badge role-${currentUser.role || 'member'}">${currentUser.role === 'admin' ? '★ Admin' : 'Member'}</span>
        </div>
      </div>
      <button class="pwd-change-btn" id="pwd-change-btn" title="Change password">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </button>
      <button class="logout-btn" id="logout-btn" title="Sign out">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </button>`;
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('pwd-change-btn').addEventListener('click', openPasswordModal);
  }

  // mobile topbar avatar
  const topbar = document.querySelector('.mobile-topbar');
  if (topbar && !document.getElementById('topbar-user')) {
    const av = document.createElement('div');
    av.id = 'topbar-user'; av.className = 'topbar-user';
    av.textContent = initials;
    av.title = 'Sign out';
    av.addEventListener('click', logout);
    topbar.appendChild(av);
  }
}

function logout() {
  if (!confirm('Sign out of Zewood CRM?')) return;
  localStorage.removeItem('crm_token');
  authToken = null; currentUser = null;
  showAuthScreen('login');
}

// ── API helper ────────────────────────────────────────────────────────────────
async function apiFetch(url, method = 'GET', body = null, token = null, _retry = 0) {
  const headers = { 'Content-Type': 'application/json' };
  const tok = token || authToken;
  if (tok) headers['Authorization'] = `Bearer ${tok}`;
  try {
    const res  = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    // Server waking up — may return empty or non-JSON response
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch {
      // Empty or non-JSON body — server still waking up, retry
      if (_retry < 3) {
        await new Promise(r => setTimeout(r, 3000));
        return apiFetch(url, method, body, token, _retry + 1);
      }
      throw new Error('Server is starting up. Please wait a moment and try again.');
    }
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  } catch (err) {
    if (err.message === 'Failed to fetch' && _retry < 3) {
      await new Promise(r => setTimeout(r, 3000));
      return apiFetch(url, method, body, token, _retry + 1);
    }
    throw err;
  }
}

function esc2(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

window.apiFetch    = apiFetch;
window.getAuthUser = () => currentUser;
window.getToken    = () => authToken;

// ── Change Password Modal ─────────────────────────────────────────────────────
function openPasswordModal() {
  // Remove existing modal if any
  const existing = document.getElementById('pwd-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'pwd-modal-overlay';
  overlay.className = 'pwd-modal-overlay';
  overlay.innerHTML = `
    <div class="pwd-modal">
      <div class="pwd-modal-header">
        <h3>Change Password</h3>
        <button class="pwd-modal-close" id="pwd-modal-close">✕</button>
      </div>
      <div id="pwd-modal-error" class="pwd-modal-error hidden"></div>
      <div id="pwd-modal-success" class="pwd-modal-success hidden">✅ Password changed successfully!</div>
      <div class="pwd-modal-body">
        <div class="pwd-field">
          <label>Current Password</label>
          <input type="password" id="pwd-current" placeholder="Enter current password" class="pwd-input" />
        </div>
        <div class="pwd-field">
          <label>New Password</label>
          <input type="password" id="pwd-new" placeholder="At least 6 characters" class="pwd-input" />
        </div>
        <div class="pwd-field">
          <label>Confirm New Password</label>
          <input type="password" id="pwd-confirm" placeholder="Repeat new password" class="pwd-input" />
        </div>
        <button class="pwd-submit-btn" id="pwd-submit-btn">Change Password</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('pwd-modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  document.getElementById('pwd-submit-btn').addEventListener('click', async () => {
    const current  = document.getElementById('pwd-current').value;
    const newPwd   = document.getElementById('pwd-new').value;
    const confirm  = document.getElementById('pwd-confirm').value;
    const errEl    = document.getElementById('pwd-modal-error');
    const successEl= document.getElementById('pwd-modal-success');
    const btn      = document.getElementById('pwd-submit-btn');

    errEl.classList.add('hidden');
    successEl.classList.add('hidden');

    if (!current || !newPwd || !confirm) {
      errEl.textContent = 'Please fill in all fields'; errEl.classList.remove('hidden'); return;
    }
    if (newPwd.length < 6) {
      errEl.textContent = 'New password must be at least 6 characters'; errEl.classList.remove('hidden'); return;
    }
    if (newPwd !== confirm) {
      errEl.textContent = 'New passwords do not match'; errEl.classList.remove('hidden'); return;
    }

    btn.disabled = true; btn.textContent = 'Changing...';
    try {
      await apiFetch('/api/me/password', 'POST', { currentPassword: current, newPassword: newPwd });
      successEl.classList.remove('hidden');
      document.getElementById('pwd-current').value = '';
      document.getElementById('pwd-new').value = '';
      document.getElementById('pwd-confirm').value = '';
      setTimeout(() => overlay.remove(), 2000);
    } catch(e) {
      errEl.textContent = e.message || 'Failed to change password';
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false; btn.textContent = 'Change Password';
    }
  });
}
