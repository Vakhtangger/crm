'use strict';

// ── Constants ───────────────────────────────────────────────────────────────
const STATUSES  = ['Research', 'Initial Contact Made', 'Meeting Set', 'Confirmed', 'Rejected'];
const CITIES    = ['Tbilisi', 'Kutaisi', 'Batumi', 'Telavi'];
const PRODUCTS  = ['Alpi', 'ThermoWood', 'All'];
const CHANNELS  = ['', 'Email', 'Phone', 'Instagram', 'Facebook', 'WhatsApp', 'Visit', 'Other'];
const DONE_OPTS = ['', 'Yes', 'No'];
const PAGE_SIZE = 30;

// ── State ───────────────────────────────────────────────────────────────────
let db        = [];   // all companies
let filtered  = [];   // after search + filter
let page      = 1;
let sortKey   = 'ID';
let sortDir   = 1;
let editingId = null;
let activeTab = 'info';

// ── Boot (called by auth.js after login) ────────────────────────────────────
async function bootCRM() {
  // Set date
  const dateEl = document.getElementById('header-date');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'long', year:'numeric' });

  try {
    // Load this user's companies from the server
    const data = await apiFetch('/api/crm', 'GET');
    db = Array.isArray(data) ? data : [];
  } catch {
    // Fall back to local data.json seed if server fails
    try {
      const r = await fetch('data.json');
      db = await r.json();
    } catch { db = []; }
  }

  populateFilterDropdowns();
  applyFilters();
  renderDashboard();
  renderPipeline();
  renderKanban();
  loadActivityFeed();
  if (typeof initTasks === 'function') initTasks();
  startAutoSync();
}
window.bootCRM  = bootCRM;
window.getCRMdb = () => db;   // expose CRM data to tasks.js

function updatePipelineNavBadge() {
  const count = db.filter(c => c['Add to Pipeline'] === 'Yes').length;
  // sidebar badge
  const badge = document.getElementById('pipeline-nav-count');
  if (badge) { badge.textContent = count; badge.classList.toggle('visible', count > 0); }
  // bottom nav badge
  const bottomBadge = document.getElementById('pipeline-bottom-badge');
  if (bottomBadge) { bottomBadge.textContent = count; bottomBadge.classList.toggle('visible', count > 0); }
}

// ── Persist ─────────────────────────────────────────────────────────────────
let _saveTimer = null;
let _lastSave  = Date.now();
function persist() {
  _lastSave = Date.now();
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    try {
      await apiFetch('/api/crm', 'PUT', db);
    } catch(e) {
      console.warn('Auto-save failed:', e.message);
    }
  }, 800);
}

// ── Navigation ───────────────────────────────────────────────────────────────
function navigateTo(view) {
  // sidebar items
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  // bottom nav items
  document.querySelectorAll('.bottom-nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  // views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  // load users panel when navigating to it
  if (view === 'users') loadUsersPanel();
  // close sidebar on mobile
  closeSidebar();
}

document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
  item.addEventListener('click', e => { e.preventDefault(); navigateTo(item.dataset.view); });
});

// ── Hamburger / Sidebar drawer ────────────────────────────────────────────────
const hamburger = document.getElementById('hamburger');
const sidebarEl = document.getElementById('sidebar');
const backdrop  = document.getElementById('sidebar-backdrop');

hamburger.addEventListener('click', () => {
  const open = sidebarEl.classList.toggle('open');
  hamburger.classList.toggle('open', open);
  backdrop.classList.toggle('hidden', !open);
});
backdrop.addEventListener('click', closeSidebar);

function closeSidebar() {
  sidebarEl.classList.remove('open');
  hamburger.classList.remove('open');
  backdrop.classList.add('hidden');
}

// ── Mobile "+" add button ──────────────────────────────────────────────────────
document.getElementById('mobile-add-btn').addEventListener('click', () => {
  // navigate to companies first then open add modal
  navigateTo('companies');
  document.getElementById('btn-add-company').click();
});

// ── Filters ──────────────────────────────────────────────────────────────────
function populateFilterDropdowns() {
  const uniq = (key) => [...new Set(db.map(c => c[key]).filter(Boolean))].sort();
  fillSelect('filter-status',  uniq('Status'));
  fillSelect('filter-city',    uniq('City'));
  fillSelect('filter-product', uniq('Product Line'));
}

function fillSelect(id, vals) {
  const sel = document.getElementById(id);
  // keep first "All" option
  while (sel.options.length > 1) sel.remove(1);
  vals.forEach(v => { const o = new Option(v, v); sel.add(o); });
}

['search','filter-status','filter-city','filter-product','filter-sample','filter-pipeline'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => { page = 1; applyFilters(); });
});

function applyFilters() {
  const q        = document.getElementById('search').value.trim().toLowerCase();
  const status   = document.getElementById('filter-status').value;
  const city     = document.getElementById('filter-city').value;
  const product  = document.getElementById('filter-product').value;
  const sample   = document.getElementById('filter-sample').checked;
  const pipeline = document.getElementById('filter-pipeline').checked;

  filtered = db.filter(c => {
    if (q) {
      const hay = `${c['ID']} ${c['Company Name']} ${c['Email']} ${c['Phone']} ${c['Contact Person']}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (status  && c['Status']        !== status)  return false;
    if (city    && c['City']          !== city)    return false;
    if (product && c['Product Line']  !== product) return false;
    if (sample  && !c['Sample Box'])               return false;
    if (pipeline && c['Add to Pipeline'] !== 'Yes') return false;
    return true;
  });

  sortFiltered();
  renderTable();
  renderPagination();
}

function sortFiltered() {
  filtered.sort((a, b) => {
    const av = (a[sortKey] || '').toString();
    const bv = (b[sortKey] || '').toString();
    return av < bv ? -sortDir : av > bv ? sortDir : 0;
  });
}

// ── Table ────────────────────────────────────────────────────────────────────
document.querySelectorAll('thead th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = 1; }
    document.querySelectorAll('thead th').forEach(t => { t.classList.remove('sorted'); delete t.dataset.dir; });
    th.classList.add('sorted');
    th.dataset.dir = sortDir === 1 ? '↑' : '↓';
    sortFiltered();
    renderTable();
  });
});

// ── Freshness helpers ─────────────────────────────────────────────────────────
function daysSinceContact(c) {
  // Try the pre-calculated field first, then compute from touch dates
  if (c['Days Since Contact'] != null && c['Days Since Contact'] !== '') {
    return +c['Days Since Contact'];
  }
  // Find the most recent date across all 3 touch records
  let latest = null;
  for (let n = 1; n <= 3; n++) {
    const d = c[`Date ${n}`];
    if (d) {
      const t = new Date(d).getTime();
      if (!isNaN(t) && (latest === null || t > latest)) latest = t;
    }
  }
  if (latest === null) return null;
  return Math.floor((Date.now() - latest) / 86400000);
}

function freshnessClass(days) {
  if (days == null) return 'none';
  if (days <= 7)  return 'fresh';
  if (days <= 30) return 'warn';
  return 'stale';
}

// ── Bulk selection state ──────────────────────────────────────────────────────
let selectedIds = new Set();

function updateBulkBar() {
  const bar   = document.getElementById('bulk-bar');
  const count = document.getElementById('bulk-count');
  if (selectedIds.size === 0) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  count.textContent = `${selectedIds.size} selected`;
}

document.getElementById('check-all').addEventListener('change', function () {
  const start = (page - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);
  slice.forEach(c => this.checked ? selectedIds.add(c['ID']) : selectedIds.delete(c['ID']));
  renderTable();
  updateBulkBar();
});

document.getElementById('bulk-cancel').addEventListener('click', () => {
  selectedIds.clear();
  document.getElementById('check-all').checked = false;
  renderTable();
  updateBulkBar();
});

document.getElementById('bulk-status-sel').addEventListener('change', function () {
  const status = this.value;
  if (!status) return;
  this.value = '';
  db.forEach(c => { if (selectedIds.has(c['ID'])) c['Status'] = status; });
  persist();
  applyFilters();
  renderDashboard();
  renderPipeline();
  renderKanban();
  toast(`✅ Status → "${status}" for ${selectedIds.size} companies`);
  selectedIds.clear();
  updateBulkBar();
});

document.getElementById('bulk-pipeline').addEventListener('click', () => {
  db.forEach(c => { if (selectedIds.has(c['ID'])) c['Add to Pipeline'] = 'Yes'; });
  persist();
  renderTable();
  renderPipeline();
  renderDashboard();
  toast(`⭐ Added ${selectedIds.size} to pipeline`);
  selectedIds.clear();
  updateBulkBar();
});

document.getElementById('bulk-export-sel').addEventListener('click', () => {
  const cols = ['ID','Company Name','City','Product Line','Status','Contact Person','Email','Phone'];
  const rows = db.filter(c => selectedIds.has(c['ID']));
  exportXlsx(rows, cols, `CRM_Selection_${selectedIds.size}`);
  toast(`⬇ Exported ${selectedIds.size} companies`);
});

function renderTable() {
  const tbody = document.getElementById('company-tbody');
  const start = (page - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);

  document.getElementById('company-count-label').textContent =
    `${filtered.length} of ${db.length} companies`;

  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:40px;color:var(--text-muted)">No companies match your filters</td></tr>`;
    return;
  }

  const pageIds = slice.map(c => c['ID']);
  const allChecked = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
  document.getElementById('check-all').checked = allChecked;

  tbody.innerHTML = slice.map(c => {
    const statusKey = (c['Status'] || '').split(' ')[0];
    const inPipeline = c['Add to Pipeline'] === 'Yes';
    const days = daysSinceContact(c);
    const daysLabel = days != null ? `${days}d` : '—';
    const fClass  = freshnessClass(days);
    const checked = selectedIds.has(c['ID']) ? 'checked' : '';
    const editedBy = c.lastEditedBy ? `title="Edited by ${esc(c.lastEditedBy)}"` : '';
    return `
      <tr class="${selectedIds.has(c['ID']) ? 'row-selected' : ''}">
        <td class="cb-col"><input type="checkbox" class="row-check" data-cbid="${esc(c['ID'])}" ${checked}></td>
        <td class="td-id" data-label="ID">${esc(c['ID'])}</td>
        <td class="td-name" data-label="Company"><span class="td-name-inner" title="${esc(c['Company Name'])}">${esc(c['Company Name'])}</span></td>
        <td data-label="City">${esc(c['City'])}</td>
        <td data-label="Product">${esc(c['Product Line'])}</td>
        <td data-label="Status"><span class="badge badge-${statusKey}">${esc(c['Status'])}</span></td>
        <td class="td-center" data-label="Sample">${c['Sample Box'] ? '📦' : '—'}</td>
        <td class="td-center" data-label="Pipeline">
          <button class="star-toggle" data-id="${esc(c['ID'])}" title="${inPipeline ? 'Remove from pipeline' : 'Add to pipeline'}">
            ${inPipeline ? '⭐' : '☆'}
          </button>
        </td>
        <td data-label="Contact" style="font-size:12px">${esc(c['Contact Person'])}</td>
        <td class="td-email" data-label="Email">${esc(c['Email'])}</td>
        <td class="td-phone" data-label="Phone">${esc(c['Phone'])}</td>
        <td data-label="Last Touch" style="font-size:11px;color:var(--text-3)">${esc(c['Last Touch Label'])}</td>
        <td data-label="Days">
          <span class="fresh-dot ${fClass}"></span>
          <span style="font-size:12px;color:var(--text-3)" ${editedBy}>${daysLabel}</span>
        </td>
        <td data-label=" ">
          <div class="td-actions">
            <button class="btn-icon" data-edit="${esc(c['ID'])}" title="Edit">✏️</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  // row checkboxes
  tbody.querySelectorAll('.row-check').forEach(cb => {
    cb.addEventListener('change', function () {
      if (this.checked) selectedIds.add(this.dataset.cbid);
      else selectedIds.delete(this.dataset.cbid);
      updateBulkBar();
      const pageIds2 = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE).map(c => c['ID']);
      document.getElementById('check-all').checked = pageIds2.every(id => selectedIds.has(id));
    });
  });
  // star toggle
  tbody.querySelectorAll('.star-toggle').forEach(btn => {
    btn.addEventListener('click', () => togglePipeline(btn.dataset.id));
  });
  // edit
  tbody.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openEdit(btn.dataset.edit));
  });
}

function renderPagination() {
  const total = Math.ceil(filtered.length / PAGE_SIZE);
  document.getElementById('page-info').textContent =
    total > 1 ? `Page ${page} of ${total}` : '';
  const pg = document.getElementById('pagination');
  if (total <= 1) { pg.innerHTML = ''; return; }

  let html = `<button class="page-btn" onclick="goPage(${page-1})" ${page===1?'disabled':''}>‹</button>`;
  for (let i = 1; i <= total; i++) {
    if (total > 9 && i !== 1 && i !== total && Math.abs(i - page) > 2) {
      if (i === 2 || i === total - 1) html += `<span class="page-ellipsis">…</span>`;
      continue;
    }
    html += `<button class="page-btn ${i===page?'active':''}" onclick="goPage(${i})">${i}</button>`;
  }
  html += `<button class="page-btn" onclick="goPage(${page+1})" ${page===total?'disabled':''}>›</button>`;
  pg.innerHTML = html;
}

window.goPage = p => {
  const total = Math.ceil(filtered.length / PAGE_SIZE);
  if (p < 1 || p > total) return;
  page = p;
  renderTable();
  renderPagination();
};

// ── Pipeline toggle ───────────────────────────────────────────────────────────
function togglePipeline(id) {
  const c = db.find(x => x['ID'] === id);
  if (!c) return;
  c['Add to Pipeline'] = c['Add to Pipeline'] === 'Yes' ? null : 'Yes';
  persist();
  renderTable();
  renderPipeline();
  renderDashboard();
  toast(c['Add to Pipeline'] === 'Yes' ? '⭐ Added to Pipeline' : '☆ Removed from Pipeline');
}

// ── Pipeline view ─────────────────────────────────────────────────────────────
function renderPipeline() {
  updatePipelineNavBadge();
  const pipelined = db.filter(c => c['Add to Pipeline'] === 'Yes');
  const emptyEl   = document.getElementById('pipeline-empty');
  const wrapEl    = document.getElementById('pipeline-table-wrap');

  if (!pipelined.length) {
    emptyEl.classList.remove('hidden');
    wrapEl.classList.add('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  wrapEl.classList.remove('hidden');

  // Determine last touch for each company
  document.getElementById('pipeline-tbody').innerHTML = pipelined.map(c => {
    const { responsible, outcome, date, nextAction, nextDate, done } = lastTouch(c);
    const days = c['Days Since Contact'];
    return `
      <tr>
        <td class="td-id" data-label="ID">${esc(c['ID'])}</td>
        <td class="td-name" data-label="Company"><span class="td-name-inner" title="${esc(c['Company Name'])}">${esc(c['Company Name'])}</span></td>
        <td data-label="City">${esc(c['City'])}</td>
        <td data-label="Status"><span class="badge badge-${(c['Status']||'').split(' ')[0]}">${esc(c['Status'])}</span></td>
        <td class="td-center" data-label="Sample">${c['Sample Box'] ? '📦' : '—'}</td>
        <td data-label="Contact" style="font-size:12px">${esc(c['Contact Person'])}</td>
        <td class="td-email" data-label="Email">${esc(c['Email'])}</td>
        <td class="td-phone" data-label="Phone">${esc(c['Phone'])}</td>
        <td data-label="Responsible" style="font-size:12px">${esc(responsible)}</td>
        <td data-label="Last Outcome" style="font-size:12px">${esc(outcome)}</td>
        <td data-label="Last Date" style="font-size:12px">${esc(date)}</td>
        <td data-label="Next Action" style="font-size:12px">${esc(nextAction)}</td>
        <td data-label="Next Date" style="font-size:12px">${esc(nextDate)}</td>
        <td class="td-center" data-label="Done">${done === 'Yes' ? '✅' : '—'}</td>
        <td data-label="Note" style="font-size:12px">${esc(c['Note'])}</td>
        <td data-label="Days" style="font-size:12px;color:var(--text-3)">${days != null ? days+'d' : '—'}</td>
        <td data-label=" "><button class="btn-icon" data-edit="${esc(c['ID'])}" title="Edit">✏️</button></td>
      </tr>`;
  }).join('');

  document.getElementById('pipeline-tbody').querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openEdit(btn.dataset.edit));
  });
}

function lastTouch(c) {
  for (let n = 3; n >= 1; n--) {
    if (c[`Channel ${n}`] || c[`Outcome ${n}`] || c[`Date ${n}`]) {
      return {
        responsible: c[`Responsible ${n}`] || '',
        outcome:     c[`Outcome ${n}`]     || '',
        date:        c[`Date ${n}`]        || '',
        nextAction:  c[`Next Action ${n}`] || '',
        nextDate:    c[`Next Date ${n}`]   || '',
        done:        c[`Done ${n}`]        || '',
      };
    }
  }
  return { responsible:'', outcome:'', date:'', nextAction:'', nextDate:'', done:'' };
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function renderDashboard() {
  const total     = db.length;
  const withEmail = db.filter(c => c['Email']).length;
  const withPhone = db.filter(c => c['Phone']).length;
  const pipeline  = db.filter(c => c['Add to Pipeline'] === 'Yes').length;
  const sample    = db.filter(c => c['Sample Box']).length;
  const confirmed = db.filter(c => c['Status'] === 'Confirmed').length;
  const meeting   = db.filter(c => c['Status'] === 'Meeting Set').length;

  const kpis = [
    { label: 'Total Companies',      value: total,     sub: 'in database',                  filter: null,             color: 'blue',   icon: '🏢' },
    { label: 'Active Pipeline',      value: pipeline,  sub: 'flagged for pipeline',          filter: 'pipeline',       color: 'green',  icon: '⭐' },
    { label: 'Confirmed',            value: confirmed, sub: 'deals closed',                  filter: 'Confirmed',      color: 'teal',   icon: '✅' },
    { label: 'Meeting Set',          value: meeting,   sub: 'meetings scheduled',            filter: 'Meeting Set',    color: 'rose',   icon: '📅' },
    { label: 'Initial Contact',      value: db.filter(c=>c['Status']==='Initial Contact Made').length, sub: 'in contact', filter: 'Initial Contact Made', color: 'amber', icon: '📞' },
    { label: 'Sample Sent',          value: sample,    sub: 'sample boxes delivered',        filter: 'sample',         color: 'violet', icon: '📦' },
    { label: 'With Email',           value: withEmail, sub: pct(withEmail,total)+' coverage',filter: null,             color: 'orange', icon: '✉️' },
    { label: 'With Phone',           value: withPhone, sub: pct(withPhone,total)+' coverage',filter: null,             color: 'orange', icon: '📱' },
  ];

  document.getElementById('kpi-grid').innerHTML = kpis.map((k, i) => `
    <div class="kpi-card kpi-${k.color} ${k.filter ? 'kpi-clickable' : ''}" data-kpi="${i}" title="${k.filter ? 'Click to view list' : ''}">
      <div class="kpi-icon">${k.icon}</div>
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-sub">${k.sub}${k.filter ? ' <span class="kpi-arrow">↗</span>' : ''}</div>
    </div>`).join('');

  document.querySelectorAll('.kpi-card.kpi-clickable').forEach(card => {
    card.addEventListener('click', () => {
      const k = kpis[+card.dataset.kpi];
      openKpiList(k.label, k.filter);
    });
  });

  renderBarChart('status-chart',  countBy('Status'));
  renderBarChart('city-chart',    countBy('City'));
  renderBarChart('product-chart', countBy('Product Line'));

  // Channel mix across all 3 touches
  const channelMap = {};
  db.forEach(c => {
    [1,2,3].forEach(n => {
      const ch = c[`Channel ${n}`];
      if (ch) channelMap[ch] = (channelMap[ch]||0) + 1;
    });
  });
  renderBarChart('channel-chart', Object.entries(channelMap).sort((a,b) => b[1]-a[1]));
}

function pct(a, b) { return b ? Math.round(a/b*100)+'%' : '0%'; }
function countBy(key) {
  const m = {};
  db.forEach(c => { const v = c[key]||'Unknown'; m[v] = (m[v]||0)+1; });
  return Object.entries(m).sort((a,b) => b[1]-a[1]);
}
function renderBarChart(id, entries) {
  const max = entries[0]?.[1] || 1;
  document.getElementById(id).innerHTML = entries.map(([label, count]) => `
    <div class="bar-row">
      <span class="bar-label" title="${esc(label)}">${esc(label)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(count/max*100)}%"></div></div>
      <span class="bar-count">${count}</span>
    </div>`).join('');
}

// ── Add Company ───────────────────────────────────────────────────────────────
document.getElementById('btn-add-company').addEventListener('click', () => {
  const maxNum = Math.max(0, ...db.map(c => parseInt((c['ID']||'').replace('FC-',''))||0));
  const newId  = `FC-${String(maxNum+1).padStart(3,'0')}`;
  openModal({ 'ID': newId, 'Status': 'Research', 'City': 'Tbilisi', 'Product Line': 'Alpi' }, true);
});

// ── Modal ─────────────────────────────────────────────────────────────────────
function openEdit(id) {
  const c = db.find(x => x['ID'] === id);
  if (c) openModal(c, false);
}

function openModal(c, isNew) {
  editingId = isNew ? null : c['ID'];
  activeTab = 'info';
  document.getElementById('modal-title').textContent   = isNew ? 'New Company' : (c['Company Name'] || 'Edit Company');
  document.getElementById('modal-id-badge').textContent = c['ID'] || '';
  document.getElementById('modal-delete').style.display = isNew ? 'none' : '';
  document.getElementById('modal-body').innerHTML = buildModalBody(c);
  switchTab('info');
  document.getElementById('modal-overlay').classList.remove('hidden');
}

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  if (tab === 'notes' && editingId) loadNotes(editingId);
}

function buildModalBody(c) {
  return `
    <div class="tab-content active" data-tab="info">
      <div class="form-section">
        <div class="form-section-title">Company Info</div>
        <div class="form-grid">
          ${fi('ID','ID',c)}
          ${fi('Company Name','Company Name',c)}
          ${fs('City','City',c,CITIES)}
          ${fs('Product Line','Product Line',c,PRODUCTS)}
          ${fs('Status','Status',c,STATUSES)}
          ${fi('Sample Box','Sample Box',c)}
          ${fi('Website / Social','Website / Social',c)}
          ${fi('Address','Address',c)}
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-title">Contact Details</div>
        <div class="form-grid">
          ${fi('Contact Person','Contact Person',c)}
          ${fi('Role / Title','Role / Title',c)}
          ${fi('Email','Email',c,'email')}
          ${fi('Phone','Phone',c)}
          ${fi('2nd Contact','2nd Contact',c)}
          ${fi('Contact Info','Contact Info',c)}
          <div class="form-group full">${fta('Note','Note',c)}</div>
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-title">Pipeline</div>
        <div class="form-grid">
          ${fs('Add to Pipeline','★ Add to Pipeline',c,['','Yes','No'])}
        </div>
      </div>
    </div>
    <div class="tab-content" data-tab="outreach">
      ${[1,2,3].map(n => touchBlock(n, c)).join('')}
    </div>
    <div class="tab-content" data-tab="notes">
      <div class="notes-panel" id="notes-panel">
        <div class="notes-list" id="notes-list">
          <div class="notes-empty">Loading notes…</div>
        </div>
        <div class="notes-add">
          <textarea id="note-input" placeholder="Add a call note, meeting summary, or follow-up…"></textarea>
          <div class="notes-add-actions">
            <button class="btn btn-primary" id="btn-save-note" style="font-size:13px;padding:7px 16px">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Add Note
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

function fi(name, label, c, type='text') {
  return `<div class="form-group"><label>${label}</label>
    <input type="${type}" name="${name}" value="${esc(c[name]||'')}" /></div>`;
}
function fs(name, label, c, opts) {
  const options = opts.map(o => `<option value="${esc(o)}" ${c[name]===o?'selected':''}>${o||'—'}</option>`).join('');
  return `<div class="form-group"><label>${label}</label><select name="${name}">${options}</select></div>`;
}
function fta(name, label, c) {
  return `<div class="form-group"><label>${label}</label>
    <textarea name="${name}">${esc(c[name]||'')}</textarea></div>`;
}
function touchBlock(n, c) {
  return `
    <div class="touch-block">
      <div class="touch-block-title">📞 Touch ${n}</div>
      <div class="form-grid">
        ${fs(`Channel ${n}`,'Channel',c,CHANNELS)}
        ${fi(`Responsible ${n}`,'Responsible',c)}
        ${fi(`Outcome ${n}`,'Outcome',c)}
        ${fi(`Date ${n}`,'Date',c,'date')}
        ${fi(`Next Action ${n}`,'Next Action',c)}
        ${fi(`Next Date ${n}`,'Next Date',c,'date')}
        ${fs(`Done ${n}`,'Done',c,DONE_OPTS)}
      </div>
    </div>`;
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); editingId = null; }

document.getElementById('modal-save').addEventListener('click', () => {
  const body   = document.getElementById('modal-body');
  const inputs = body.querySelectorAll('input, select, textarea');
  const data   = {};
  inputs.forEach(el => { if (el.name) data[el.name] = el.value || null; });

  if (editingId) {
    const idx = db.findIndex(c => c['ID'] === editingId);
    if (idx !== -1) db[idx] = { ...db[idx], ...data };
  } else {
    db.push(data);
  }
  persist();
  closeModal();
  applyFilters();
  renderDashboard();
  renderPipeline();
  renderKanban();
  toast('✅ Saved');
});

document.getElementById('modal-delete').addEventListener('click', () => {
  if (!editingId) return;
  if (!confirm(`Delete ${editingId}? This cannot be undone.`)) return;
  db = db.filter(c => c['ID'] !== editingId);
  persist();
  closeModal();
  applyFilters();
  renderDashboard();
  renderPipeline();
  toast('🗑 Company deleted');
});

// ── Company Lookup ────────────────────────────────────────────────────────────
document.getElementById('lookup-btn').addEventListener('click', doLookup);
document.getElementById('lookup-input').addEventListener('keydown', e => { if (e.key==='Enter') doLookup(); });

function doLookup() {
  const val = document.getElementById('lookup-input').value.trim().toUpperCase();
  const c   = db.find(x => (x['ID']||'').toUpperCase() === val);
  const res = document.getElementById('lookup-result');
  if (!c) { res.innerHTML = `<div class="lookup-card" style="color:var(--text-muted)">No company found for <strong>${esc(val)}</strong></div>`; return; }

  const field = (label, val) =>
    `<div class="lookup-field"><label>${label}</label><span>${esc(val)||'—'}</span></div>`;

  const touchHtml = [1,2,3].map(n => {
    if (!c[`Channel ${n}`] && !c[`Outcome ${n}`] && !c[`Date ${n}`]) return '';
    return `
      <div class="touch-summary">
        <div class="touch-summary-title">Touch ${n}</div>
        <div class="touch-summary-grid">
          <div class="touch-summary-item"><label>Channel</label><span>${esc(c[`Channel ${n}`])}</span></div>
          <div class="touch-summary-item"><label>Responsible</label><span>${esc(c[`Responsible ${n}`])}</span></div>
          <div class="touch-summary-item"><label>Date</label><span>${esc(c[`Date ${n}`])}</span></div>
          <div class="touch-summary-item"><label>Outcome</label><span>${esc(c[`Outcome ${n}`])}</span></div>
          <div class="touch-summary-item"><label>Next Action</label><span>${esc(c[`Next Action ${n}`])}</span></div>
          <div class="touch-summary-item"><label>Done</label><span>${c[`Done ${n}`]==='Yes'?'✅ Yes':esc(c[`Done ${n}`])}</span></div>
        </div>
      </div>`;
  }).join('');

  res.innerHTML = `
    <div class="lookup-card">
      <h2>${esc(c['Company Name'])}</h2>
      <span class="badge badge-${(c['Status']||'').split(' ')[0]}">${esc(c['Status'])}</span>
      ${c['Add to Pipeline']==='Yes' ? ' <span style="font-size:13px">⭐ In Pipeline</span>' : ''}
      <div class="lookup-grid">
        ${field('ID',             c['ID'])}
        ${field('City',           c['City'])}
        ${field('Product Line',   c['Product Line'])}
        ${field('Sample Box',     c['Sample Box'])}
        ${field('Website',        c['Website / Social'])}
        ${field('Address',        c['Address'])}
        ${field('Contact Person', c['Contact Person'])}
        ${field('Role / Title',   c['Role / Title'])}
        ${field('Email',          c['Email'])}
        ${field('Phone',          c['Phone'])}
        ${field('2nd Contact',    c['2nd Contact'])}
        ${field('Contact Info',   c['Contact Info'])}
      </div>
      ${c['Note'] ? `<div style="margin-top:14px;font-size:13px"><strong>Note:</strong> ${esc(c['Note'])}</div>` : ''}
      <div class="lookup-section-title">Outreach Log</div>
      ${touchHtml || '<div style="color:var(--text-muted);font-size:13px">No outreach recorded yet</div>'}
      <div style="margin-top:16px">
        <button class="btn btn-primary" onclick="openEdit('${esc(c['ID'])}')">✏️ Edit this company</button>
      </div>
    </div>`;
}

// ── KPI Drill-down Drawer ─────────────────────────────────────────────────────
function openKpiList(title, filter) {
  let companies;
  if (filter === 'pipeline') {
    companies = db.filter(c => c['Add to Pipeline'] === 'Yes');
  } else if (filter === 'sample') {
    companies = db.filter(c => c['Sample Box']);
  } else {
    companies = db.filter(c => c['Status'] === filter);
  }

  const drawer = document.getElementById('kpi-drawer');
  document.getElementById('kpi-drawer-title').textContent = title;
  document.getElementById('kpi-drawer-count').textContent = `${companies.length} companies`;

  document.getElementById('kpi-drawer-body').innerHTML = companies.length === 0
    ? `<div style="padding:32px;text-align:center;color:var(--text-muted)">No companies in this category</div>`
    : `<table class="kpi-list-table">
        <thead>
          <tr>
            <th>ID</th><th>Company</th><th>City</th><th>Product</th><th>Status</th>
            <th>Contact</th><th>Email</th><th>Phone</th><th>Last Touch</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${companies.map(c => `
            <tr>
              <td class="td-id" data-label="ID">${esc(c['ID'])}</td>
              <td class="td-name" data-label="Company"><span class="td-name-inner" title="${esc(c['Company Name'])}">${esc(c['Company Name'])}</span></td>
              <td data-label="City">${esc(c['City'])}</td>
              <td data-label="Product">${esc(c['Product Line'])}</td>
              <td data-label="Status"><span class="badge badge-${(c['Status']||'').split(' ')[0]}">${esc(c['Status'])}</span></td>
              <td data-label="Contact" style="font-size:12px">${esc(c['Contact Person'])}</td>
              <td class="td-email" data-label="Email">${esc(c['Email'])}</td>
              <td class="td-phone" data-label="Phone">${esc(c['Phone'])}</td>
              <td data-label="Last Touch" style="font-size:11px;color:var(--text-3)">${esc(c['Last Touch Label'])}</td>
              <td data-label=" "><button class="btn-icon" data-edit="${esc(c['ID'])}" title="Edit">✏️</button></td>
            </tr>`).join('')}
        </tbody>
      </table>`;

  drawer.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      closeDrawer();
      openEdit(btn.dataset.edit);
    });
  });

  drawer.classList.remove('hidden');
  document.getElementById('drawer-overlay').classList.remove('hidden');
}

function closeDrawer() {
  document.getElementById('kpi-drawer').classList.add('hidden');
  document.getElementById('drawer-overlay').classList.add('hidden');
}

document.getElementById('drawer-close').addEventListener('click', closeDrawer);
document.getElementById('drawer-overlay').addEventListener('click', closeDrawer);

// ── Import Excel ──────────────────────────────────────────────────────────────
document.getElementById('excel-upload').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const workbook = XLSX.read(e.target.result, { type: 'array', cellDates: true });

      // Find the "Company List" sheet (or fall back to first sheet)
      const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('company list'))
                     || workbook.SheetNames[0];
      const ws = workbook.Sheets[sheetName];

      // Convert to array-of-arrays so we can find the header row
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

      // Find the header row — it contains 'ID' and 'Company Name'
      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(raw.length, 10); i++) {
        const row = raw[i];
        if (row && row.includes('ID') && row.some(c => String(c||'').includes('Company Name'))) {
          headerRowIdx = i;
          break;
        }
      }
      if (headerRowIdx === -1) {
        toast('❌ Could not find header row in "Company List" sheet');
        return;
      }

      const headers = raw[headerRowIdx].map(h => {
        if (h == null) return null;
        const s = String(h).trim();
        // Normalise the "★ Add to Pipeline" header — it might have various prefixes
        if (s.includes('Pipeline')) return 'Add to Pipeline';
        return s;
      });

      const COLS = ['ID','Company Name','City','Product Line','Status','Sample Box',
        'Website / Social','Contact Person','Role / Title','Email','Phone','Address',
        '2nd Contact','Contact Info','Note',
        'Channel 1','Responsible 1','Outcome 1','Date 1','Next Action 1','Next Date 1','Done 1',
        'Channel 2','Responsible 2','Outcome 2','Date 2','Next Action 2','Next Date 2','Done 2',
        'Channel 3','Responsible 3','Outcome 3','Date 3','Next Action 3','Next Date 3','Done 3',
        'Days Since Contact','Last Touch Label','Add to Pipeline'];

      const imported = [];
      for (let i = headerRowIdx + 1; i < raw.length; i++) {
        const row = raw[i];
        if (!row) continue;
        const id = row[headers.indexOf('ID')];
        if (!id || !String(id).match(/^FC-/i)) continue;  // only real data rows

        const rec = {};
        COLS.forEach(col => {
          const idx = headers.indexOf(col);
          if (idx === -1) { rec[col] = null; return; }
          let val = row[idx];
          // Format dates
          if (val instanceof Date) {
            val = val.toISOString().slice(0, 10);
          } else if (val != null) {
            val = String(val).trim() || null;
          }
          rec[col] = val || null;
        });
        imported.push(rec);
      }

      if (!imported.length) {
        toast('❌ No valid company rows found');
        return;
      }

      if (!confirm(`Import ${imported.length} companies from "${file.name}"?\n\nThis will REPLACE all current data.`)) return;

      db = imported;
      persist();
      populateFilterDropdowns();
      page = 1;
      applyFilters();
      renderDashboard();
      renderPipeline();
      toast(`✅ Imported ${imported.length} companies from ${file.name}`);
    } catch (err) {
      console.error(err);
      toast('❌ Failed to parse file: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
  // reset so same file can be re-uploaded
  this.value = '';
});

// ── Export ────────────────────────────────────────────────────────────────────
document.getElementById('btn-export-excel').addEventListener('click', () => {
  const cols = ['ID','Company Name','City','Product Line','Status','Sample Box','Website / Social',
    'Contact Person','Role / Title','Email','Phone','Address','2nd Contact','Contact Info','Note',
    'Channel 1','Responsible 1','Outcome 1','Date 1','Next Action 1','Next Date 1','Done 1',
    'Channel 2','Responsible 2','Outcome 2','Date 2','Next Action 2','Next Date 2','Done 2',
    'Channel 3','Responsible 3','Outcome 3','Date 3','Next Action 3','Next Date 3','Done 3',
    'Days Since Contact','Last Touch Label','Add to Pipeline','lastEditedBy','lastEditedAt'];
  exportXlsx(db, cols, 'Furniture_CRM_Full');
  toast('⬇ Exported as Excel (.xlsx)');
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.classList.add('hidden'), 2800);
}

// expose for inline onclick (lookup edit button)
window.openEdit = openEdit;

// ── Notes ─────────────────────────────────────────────────────────────────────
async function loadNotes(companyId) {
  const list = document.getElementById('notes-list');
  if (!list) return;
  try {
    const notes = await apiFetch(`/api/notes/${companyId}`);
    renderNotes(notes, companyId);
    // update badge
    const badge = document.getElementById('modal-notes-badge');
    if (badge) { badge.textContent = notes.length || ''; badge.style.display = notes.length ? '' : 'none'; }
  } catch(e) {
    if (list) list.innerHTML = `<div class="notes-empty">Could not load notes</div>`;
  }
}

function renderNotes(notes, companyId) {
  const list = document.getElementById('notes-list');
  if (!list) return;
  const me = window.getAuthUser?.();
  if (!notes.length) {
    list.innerHTML = `<div class="notes-empty">No notes yet — add your first call note below</div>`;
  } else {
    list.innerHTML = notes.map(n => {
      const initials = (n.userName || n.userId)[0].toUpperCase();
      const dt = new Date(n.createdAt);
      const timeAgo = formatTimeAgo(dt);
      const isMine = me && n.userId === me.id;
      return `
        <div class="note-item" data-note-id="${n.id}">
          <div class="note-item-header">
            <div class="note-avatar">${initials}</div>
            <span class="note-author">${esc(n.userName)}</span>
            <span class="note-time" title="${dt.toLocaleString()}">${timeAgo}</span>
          </div>
          <div class="note-text">${esc(n.text)}</div>
          ${isMine ? `<button class="note-delete" data-del-note="${n.id}" title="Delete">🗑</button>` : ''}
        </div>`;
    }).join('');
    list.querySelectorAll('[data-del-note]').forEach(btn => {
      btn.addEventListener('click', () => deleteNote(btn.dataset.delNote, companyId));
    });
  }
  // wire save button
  const saveBtn = document.getElementById('btn-save-note');
  if (saveBtn) {
    saveBtn.onclick = () => saveNote(companyId);
  }
  // Ctrl+Enter to save
  const inp = document.getElementById('note-input');
  if (inp) {
    inp.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveNote(companyId); };
  }
}

async function saveNote(companyId) {
  const inp = document.getElementById('note-input');
  const text = inp?.value.trim();
  if (!text) return;
  const btn = document.getElementById('btn-save-note');
  if (btn) btn.disabled = true;
  try {
    await apiFetch(`/api/notes/${companyId}`, 'POST', { text });
    inp.value = '';
    await loadNotes(companyId);
    loadActivityFeed();
    toast('📝 Note saved');
  } catch(e) {
    toast('❌ ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function deleteNote(noteId, companyId) {
  if (!confirm('Delete this note?')) return;
  try {
    await apiFetch(`/api/notes/${noteId}`, 'DELETE');
    await loadNotes(companyId);
    toast('🗑 Note deleted');
  } catch(e) {
    toast('❌ ' + e.message);
  }
}

function formatTimeAgo(date) {
  const sec = Math.floor((Date.now() - date) / 1000);
  if (sec < 60)   return 'just now';
  if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec/3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec/86400)}d ago`;
  return date.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
}

// ── Activity Feed ─────────────────────────────────────────────────────────────
async function loadActivityFeed() {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;
  try {
    const items = await apiFetch('/api/activity?limit=20');
    if (!items.length) {
      feed.innerHTML = `<div class="activity-empty">No activity yet — changes will appear here</div>`;
      return;
    }
    feed.innerHTML = items.map(a => {
      let icon = '📝', cls = 'act-note', text = '';
      if (a.action === 'status_change') {
        icon = '🔄'; cls = 'act-status';
        text = `<strong>${esc(a.userName)}</strong> changed <strong>${esc(a.companyName)}</strong> → <em>${esc(a.to)}</em>`;
      } else if (a.action === 'company_add') {
        icon = '➕'; cls = 'act-add';
        text = `<strong>${esc(a.userName)}</strong> added company <strong>${esc(a.companyName)}</strong>`;
      } else if (a.action === 'note_add') {
        icon = '💬'; cls = 'act-note';
        text = `<strong>${esc(a.userName)}</strong> added a note${a.companyId ? ` on <strong>${esc(a.companyId)}</strong>` : ''}: <em>"${esc((a.preview||'').slice(0,60))}${(a.preview||'').length>60?'…':''}"</em>`;
      } else if (a.action === 'task_assign') {
        icon = '📋'; cls = 'act-task';
        text = `<strong>${esc(a.userName)}</strong> assigned task "<em>${esc(a.taskTitle)}</em>" to ${esc(a.assigneeName)}`;
      }
      return `
        <div class="activity-item">
          <div class="activity-icon ${cls}">${icon}</div>
          <div class="activity-body">
            <div class="activity-text">${text}</div>
            <div class="activity-meta">${formatTimeAgo(new Date(a.createdAt))}</div>
          </div>
        </div>`;
    }).join('');
  } catch(e) { console.warn('Activity feed error:', e); }
}

// ── Auto-sync ─────────────────────────────────────────────────────────────────
let _syncTimer = null;

function startAutoSync() {
  _syncTimer = setInterval(async () => {
    // Don't sync if a save happened in the last 5 seconds
    if (Date.now() - _lastSave < 5000) return;
    try {
      const fresh = await apiFetch('/api/crm');
      if (!Array.isArray(fresh)) return;
      // Only update if data differs
      if (JSON.stringify(fresh.map(c=>c.ID+c.Status+c.lastEditedAt)) !==
          JSON.stringify(db.map(c=>c.ID+c.Status+c.lastEditedAt))) {
        db = fresh;
        applyFilters();
        renderDashboard();
        renderPipeline();
        renderKanban();
        // flash sync dot
        const dot = document.getElementById('sync-dot');
        if (dot) { dot.classList.add('active'); setTimeout(() => dot.classList.remove('active'), 1500); }
      }
      loadActivityFeed();
    } catch(e) { /* silent */ }
  }, 60000);
}

// ── Kanban Board ──────────────────────────────────────────────────────────────
const KANBAN_STATUSES = [
  { key: 'Research',            label: 'Research',             col: 'Research' },
  { key: 'Initial Contact Made',label: 'Initial Contact',      col: 'Initial' },
  { key: 'Meeting Set',         label: 'Meeting Set',          col: 'Meeting' },
  { key: 'Confirmed',           label: 'Confirmed',            col: 'Confirmed' },
  { key: 'Rejected',            label: 'Rejected',             col: 'Rejected' },
];

let _kanbanDragId = null;

function renderKanban() {
  const board = document.getElementById('kanban-board');
  if (!board) return;

  const cityF    = document.getElementById('kanban-filter-city')?.value    || '';
  const productF = document.getElementById('kanban-filter-product')?.value || '';
  let companies  = db.filter(c =>
    (!cityF    || c['City']         === cityF) &&
    (!productF || c['Product Line'] === productF)
  );

  board.innerHTML = KANBAN_STATUSES.map(s => {
    const cards = companies.filter(c => c['Status'] === s.key);
    const cardsHtml = cards.map(c => {
      const days    = daysSinceContact(c);
      const fClass  = freshnessClass(days);
      const daysLbl = days != null ? `${days}d ago` : 'No contact';
      const pip     = c['Add to Pipeline'] === 'Yes' ? '⭐ ' : '';
      return `
        <div class="kanban-card" draggable="true" data-kanban-id="${esc(c['ID'])}">
          <div class="kanban-card-name">${pip}${esc(c['Company Name'])}</div>
          <div class="kanban-card-meta">
            <div class="kanban-card-city">📍 ${esc(c['City'] || '—')}</div>
            ${c['Contact Person'] ? `<div class="kanban-card-contact">👤 ${esc(c['Contact Person'])}</div>` : ''}
          </div>
          <span class="kanban-card-days ${fClass}">⏱ ${daysLbl}</span>
        </div>`;
    }).join('');

    return `
      <div class="kanban-col kanban-col-${s.col}" data-kanban-status="${esc(s.key)}">
        <div class="kanban-col-header">
          <span class="kanban-dot"></span>
          ${s.label}
          <span class="kanban-count-badge">${cards.length}</span>
        </div>
        <div class="kanban-cards">${cardsHtml}</div>
      </div>`;
  }).join('');

  // Populate filter dropdowns once
  const cityEl    = document.getElementById('kanban-filter-city');
  const productEl = document.getElementById('kanban-filter-product');
  if (cityEl && cityEl.options.length === 1) {
    [...new Set(db.map(c=>c['City']).filter(Boolean))].sort().forEach(v => cityEl.add(new Option(v,v)));
  }
  if (productEl && productEl.options.length === 1) {
    [...new Set(db.map(c=>c['Product Line']).filter(Boolean))].sort().forEach(v => productEl.add(new Option(v,v)));
  }

  // Drag & drop
  board.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      _kanbanDragId = card.dataset.kanbanId;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('click', () => openEdit(card.dataset.kanbanId));
  });

  board.querySelectorAll('.kanban-col').forEach(col => {
    col.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      if (!_kanbanDragId) return;
      const newStatus = col.dataset.kanbanStatus;
      const company   = db.find(c => c['ID'] === _kanbanDragId);
      if (company && company['Status'] !== newStatus) {
        company['Status'] = newStatus;
        persist();
        renderKanban();
        renderTable();
        renderDashboard();
        loadActivityFeed();
        toast(`↪ Moved to "${newStatus}"`);
      }
      _kanbanDragId = null;
    });
  });
}

['kanban-filter-city','kanban-filter-product'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', renderKanban);
});

// ── Export as .xlsx ───────────────────────────────────────────────────────────
function exportXlsx(data, cols, filename) {
  const rows = data.map(c => {
    const row = {};
    cols.forEach(k => row[k] = c[k] || '');
    return row;
  });
  const ws  = XLSX.utils.json_to_sheet(rows, { header: cols });
  const wb  = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Companies');
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ── Users Management Panel ────────────────────────────────────────────────────
async function loadUsersPanel() {
  const container = document.getElementById('users-list');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--text-3)">Loading...</p>';
  try {
    const users = await apiFetch('/api/users');
    const me = window.getAuthUser?.();
    container.innerHTML = `
      <table class="users-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td>
                <div class="users-avatar">${(u.displayName||u.email)[0].toUpperCase()}</div>
                ${esc(u.displayName || '—')}
              </td>
              <td>${esc(u.email)}</td>
              <td>
                <span class="role-badge role-${u.role||'member'}">
                  ${u.role === 'admin' ? '★ Admin' : 'Member'}
                </span>
              </td>
              <td>
                ${u.id === me?.id
                  ? '<span style="color:var(--text-3);font-size:12px">You</span>'
                  : u.role === 'admin'
                    ? `<button class="btn-role-change" onclick="changeUserRole('${u.id}','member','${esc(u.email)}')">Remove Admin</button>`
                    : `<button class="btn-role-change btn-make-admin" onclick="changeUserRole('${u.id}','admin','${esc(u.email)}')">Make Admin</button>`
                }
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch(e) {
    container.innerHTML = `<p style="color:red">Failed to load users: ${e.message}</p>`;
  }
}

async function changeUserRole(userId, newRole, email) {
  const action = newRole === 'admin' ? 'make admin' : 'remove admin from';
  if (!confirm(`Are you sure you want to ${action} ${email}?`)) return;
  try {
    await apiFetch(`/api/users/${userId}/role`, 'PATCH', { role: newRole });
    toast(`✅ ${email} is now ${newRole === 'admin' ? 'an Admin' : 'a Member'}`);
    loadUsersPanel();
  } catch(e) {
    toast(`❌ Failed: ${e.message}`);
  }
}
