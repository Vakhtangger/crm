'use strict';

// ── Load env vars first ───────────────────────────────────────────────────────
require('dotenv').config();

const express      = require('express');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const helmet       = require('helmet');
const compression  = require('compression');
const rateLimit    = require('express-rate-limit');
const nodemailer   = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const low          = require('lowdb');
const FileSync     = require('lowdb/adapters/FileSync');
const path         = require('path');
const fs           = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────
const PORT       = parseInt(process.env.PORT) || 3456;
const NODE_ENV   = process.env.NODE_ENV || 'development';
const IS_PROD    = NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_TTL    = '7d';
const EMAIL_RE   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('❌  JWT_SECRET missing or too short — set it in .env');
  process.exit(1);
}

// ── Database ──────────────────────────────────────────────────────────────────
// db.json lives in ./data/ — NOT served by Express static
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const adapter = new FileSync(path.join(DATA_DIR, 'db.json'));
const db      = low(adapter);
db.defaults({ users: [], crm: [], tasks: [], smtp: {}, notes: [], activity: [] }).write();

// One-time migration: if crm is an object (old per-user format), flatten to shared array
(function migrateCRM() {
  const crm = db.get('crm').value();
  if (crm && !Array.isArray(crm)) {
    const seen = new Set(), merged = [];
    Object.values(crm).forEach(arr => {
      if (!Array.isArray(arr)) return;
      arr.forEach(c => {
        const key = c.ID || c['Company Name'];
        if (key && !seen.has(key)) { seen.add(key); merged.push(c); }
      });
    });
    db.set('crm', merged).write();
    console.log(`  ✅ Migrated CRM: ${merged.length} companies`);
  }
})();

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();

// Security headers via helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", 'cdn.sheetjs.com', 'fonts.googleapis.com'],
      styleSrc:    ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'fonts.gstatic.com'],
      fontSrc:     ["'self'", 'fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:'],
      connectSrc:  ["'self'"],
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,   // needed for SheetJS
}));

// Gzip compression
app.use(compression());

// Trust proxy for rate limiting (needed behind nginx/reverse proxy)
app.set('trust proxy', 1);

// CORS — restrict to same origin in production
const allowedOrigin = process.env.ALLOWED_ORIGIN || `http://localhost:${PORT}`;
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!IS_PROD || !origin || origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Body parsing — tight size limits
app.use(express.json({ limit: '500kb' }));           // API calls
app.use('/api/crm', express.json({ limit: '10mb' })); // allow larger for bulk CRM save

// ── Request logger ────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms  = Date.now() - start;
    const col = res.statusCode >= 400 ? '\x1b[31m' : res.statusCode >= 300 ? '\x1b[33m' : '\x1b[32m';
    console.log(`${col}${res.statusCode}\x1b[0m ${req.method} ${req.path} — ${ms}ms`);
  });
  next();
});

// ── Block direct access to sensitive files ────────────────────────────────────
// data/ is never under __dirname public root so this is belt-and-suspenders
app.use((req, res, next) => {
  const blocked = /\.(json|env|log|sh|md)$/i.test(req.path);
  if (blocked) return res.status(403).json({ error: 'Forbidden' });
  next();
});

// ── Static files (HTML/CSS/JS) ────────────────────────────────────────────────
app.use(express.static(path.join(__dirname), {
  maxAge: IS_PROD ? '1h' : 0,
  etag: true,
  index: 'index.html',
}));

// ── Rate limiters ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 20,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,         // 1 minute
  max: 120,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const smtpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many SMTP tests. Please wait a minute.' },
});

app.use('/api/', apiLimiter);

// ── Brute-force protection (in-memory, resets on restart) ─────────────────────
const loginAttempts = new Map(); // email → { count, lockedUntil }

function checkBruteForce(email) {
  const key  = email.toLowerCase();
  const rec  = loginAttempts.get(key);
  if (!rec) return null;
  if (rec.lockedUntil && Date.now() < rec.lockedUntil) {
    const remaining = Math.ceil((rec.lockedUntil - Date.now()) / 60000);
    return `Too many failed attempts. Account locked for ${remaining} more minute(s).`;
  }
  return null;
}
function recordFailedLogin(email) {
  const key = email.toLowerCase();
  const rec = loginAttempts.get(key) || { count: 0, lockedUntil: null };
  rec.count++;
  if (rec.count >= 5) {
    rec.lockedUntil = Date.now() + 15 * 60 * 1000; // 15 min lock
    rec.count = 0;
  }
  loginAttempts.set(key, rec);
}
function clearLoginAttempts(email) {
  loginAttempts.delete(email.toLowerCase());
}

// ── Auth middleware ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }
}

function makeToken(u) {
  return jwt.sign(
    { id: u.id, email: u.email, displayName: u.displayName, role: u.role || 'member' },
    JWT_SECRET,
    { expiresIn: JWT_TTL }
  );
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

// ── Input helpers ─────────────────────────────────────────────────────────────
function sanitizeStr(s, maxLen = 500) {
  if (s == null) return '';
  return String(s).trim().slice(0, maxLen);
}
function validateEmail(e) {
  return EMAIL_RE.test(String(e || '').toLowerCase().trim());
}

// ── Auth routes ───────────────────────────────────────────────────────────────
app.post('/api/register', authLimiter, async (req, res) => {
  try {
    const email       = sanitizeStr(req.body?.email, 254).toLowerCase();
    const password    = sanitizeStr(req.body?.password, 128);
    const displayName = sanitizeStr(req.body?.displayName, 80);
    const adminCode   = sanitizeStr(req.body?.adminCode, 64);

    if (!email || !password)     return res.status(400).json({ error: 'Email and password are required' });
    if (!validateEmail(email))   return res.status(400).json({ error: 'Please enter a valid email address' });
    if (password.length < 6)     return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (password.length > 128)   return res.status(400).json({ error: 'Password too long' });

    if (db.get('users').find({ email }).value())
      return res.status(409).json({ error: 'An account with this email already exists' });

    // First ever user becomes admin automatically
    const isFirst = db.get('users').value().length === 0;
    const ADMIN_CODE = process.env.ADMIN_CODE || '';
    const role = (isFirst || (ADMIN_CODE && adminCode === ADMIN_CODE)) ? 'admin' : 'member';

    const user = {
      id:          uuidv4(),
      email,
      displayName: displayName || email.split('@')[0],
      hash:        await bcrypt.hash(password, 12),
      role,
      createdAt:   new Date().toISOString(),
    };
    db.get('users').push(user).write();
    console.log(`[register] new user: ${email} role: ${role}`);
    res.json({ token: makeToken(user), user: safeUser(user) });
  } catch (e) {
    console.error('[register] error:', e.message);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// Admin: update user role
app.patch('/api/users/:id/role', auth, requireAdmin, (req, res) => {
  const role = sanitizeStr(req.body?.role, 20);
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const user = db.get('users').find({ id: req.params.id }).value();
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.get('users').find({ id: req.params.id }).assign({ role }).write();
  logActivity('user_role_changed', req.user, { targetEmail: user.email, newRole: role });
  res.json({ ok: true });
});

app.post('/api/login', authLimiter, async (req, res) => {
  try {
    const email    = sanitizeStr(req.body?.email, 254).toLowerCase();
    const password = sanitizeStr(req.body?.password, 128);

    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' });

    const lockMsg = checkBruteForce(email);
    if (lockMsg) return res.status(429).json({ error: lockMsg });

    const user = db.get('users').find({ email }).value();
    // Use constant-time comparison even if user not found (prevent timing attacks)
    const dummyHash = '$2b$12$invalidhashfortimingprotectionxx';
    const hash      = user?.hash || dummyHash;
    const match     = await bcrypt.compare(password, hash);

    if (!user || !match) {
      recordFailedLogin(email);
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    clearLoginAttempts(email);
    console.log(`[login] ${email}`);
    res.json({ token: makeToken(user), user: safeUser(user) });
  } catch (e) {
    console.error('[login] error:', e.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

app.get('/api/me', auth, (req, res) => {
  const user = db.get('users').find({ id: req.user.id }).value();
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ user: safeUser(user) });
});

// Never send hash or internal fields to client
function safeUser(u) {
  return { id: u.id, email: u.email, displayName: u.displayName, role: u.role || 'member' };
}

// ── Users list ────────────────────────────────────────────────────────────────
app.get('/api/users', auth, (req, res) => {
  const users = db.get('users').value().map(safeUser);
  res.json(users);
});

// ── Activity log helper ───────────────────────────────────────────────────────
function logActivity(action, user, extra = {}) {
  const entry = {
    id:        uuidv4(),
    action,
    userId:    user.id,
    userName:  sanitizeStr(user.displayName, 80),
    ...extra,
    createdAt: new Date().toISOString(),
  };
  const list = db.get('activity').value();
  list.push(entry);
  if (list.length > 500) list.splice(0, list.length - 500);
  db.set('activity', list).write();
}

// ── CRM data (shared) ─────────────────────────────────────────────────────────
app.get('/api/crm', auth, (req, res) => {
  res.json(db.get('crm').value() || []);
});

app.put('/api/crm', auth, (req, res) => {
  if (!Array.isArray(req.body))
    return res.status(400).json({ error: 'Body must be an array' });
  if (req.body.length > 10000)
    return res.status(400).json({ error: 'Too many records' });

  const prev    = db.get('crm').value();
  const prevMap = Object.fromEntries(prev.map(c => [c.ID, c]));
  const now     = new Date().toISOString();

  req.body.forEach(c => {
    if (!c || typeof c !== 'object') return;
    c.lastEditedBy = sanitizeStr(req.user.displayName, 80);
    c.lastEditedAt = now;
    const p = prevMap[c.ID];
    if (!p) {
      logActivity('company_add', req.user, {
        companyId: sanitizeStr(c.ID), companyName: sanitizeStr(c['Company Name'], 200),
      });
    } else if (p['Status'] !== c['Status']) {
      logActivity('status_change', req.user, {
        companyId:   sanitizeStr(c.ID),
        companyName: sanitizeStr(c['Company Name'], 200),
        from:        sanitizeStr(p['Status']),
        to:          sanitizeStr(c['Status']),
      });
    }
  });

  db.set('crm', req.body).write();
  res.json({ ok: true, count: req.body.length });
});

// ── Notes ─────────────────────────────────────────────────────────────────────
app.get('/api/notes/:companyId', auth, (req, res) => {
  const companyId = sanitizeStr(req.params.companyId, 20);
  res.json(db.get('notes').filter({ companyId }).value());
});

app.post('/api/notes/:companyId', auth, (req, res) => {
  const companyId = sanitizeStr(req.params.companyId, 20);
  const text      = sanitizeStr(req.body?.text, 2000);
  if (!text) return res.status(400).json({ error: 'Note text required' });

  const note = {
    id:        uuidv4(),
    companyId,
    text,
    userId:    req.user.id,
    userName:  sanitizeStr(req.user.displayName, 80),
    createdAt: new Date().toISOString(),
  };
  db.get('notes').push(note).write();
  logActivity('note_add', req.user, {
    companyId,
    preview: text.slice(0, 80),
  });
  res.json(note);
});

app.delete('/api/notes/:noteId', auth, (req, res) => {
  const note = db.get('notes').find({ id: req.params.noteId }).value();
  if (!note)                        return res.status(404).json({ error: 'Note not found' });
  if (note.userId !== req.user.id)  return res.status(403).json({ error: 'You can only delete your own notes' });
  db.get('notes').remove({ id: req.params.noteId }).write();
  res.json({ ok: true });
});

// ── Activity feed ─────────────────────────────────────────────────────────────
app.get('/api/activity', auth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  const list  = db.get('activity').value();
  res.json(list.slice(-limit).reverse());
});

// ── Tasks ─────────────────────────────────────────────────────────────────────
app.get('/api/tasks', auth, (req, res) => {
  const tasks = db.get('tasks').filter(t =>
    t.createdBy === req.user.id || t.assigneeId === req.user.id
  ).value();
  res.json(tasks);
});

app.post('/api/tasks', auth, async (req, res) => {
  try {
    const title         = sanitizeStr(req.body?.title, 300);
    const description   = sanitizeStr(req.body?.description, 2000);
    const dueDate       = sanitizeStr(req.body?.dueDate, 10);
    const dueTime       = sanitizeStr(req.body?.dueTime, 5) || '09:00';
    const assigneeEmail = sanitizeStr(req.body?.assigneeEmail, 254).toLowerCase();
    const companyId     = sanitizeStr(req.body?.companyId, 20) || null;
    const companyName   = sanitizeStr(req.body?.companyName, 200) || null;

    if (!title)         return res.status(400).json({ error: 'Title is required' });
    if (!assigneeEmail) return res.status(400).json({ error: 'Assignee email is required' });
    if (!validateEmail(assigneeEmail))
      return res.status(400).json({ error: 'Invalid assignee email' });

    // Validate date format (YYYY-MM-DD)
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))
      return res.status(400).json({ error: 'Invalid date format' });

    const assignee = db.get('users').find({ email: assigneeEmail }).value();
    if (!assignee)
      return res.status(404).json({ error: `No registered user found with email: ${assigneeEmail}` });

    const task = {
      id:             uuidv4(),
      title,
      description,
      dueDate:        dueDate || null,
      dueTime,
      companyId,
      companyName,
      assigneeId:     assignee.id,
      assigneeEmail:  assignee.email,
      assigneeName:   assignee.displayName,
      createdBy:      req.user.id,
      createdByEmail: req.user.email,
      createdByName:  req.user.displayName,
      status:         'pending',
      createdAt:      new Date().toISOString(),
    };
    db.get('tasks').push(task).write();
    logActivity('task_assign', req.user, {
      companyId, companyName, taskTitle: title, assigneeName: assignee.displayName,
    });

    const emailSent = await sendTaskInvite(task);
    res.json({ task, emailSent });
  } catch (e) {
    console.error('[create task] error:', e.message);
    res.status(500).json({ error: 'Failed to create task. Please try again.' });
  }
});

app.patch('/api/tasks/:id', auth, (req, res) => {
  const task = db.get('tasks').find({ id: req.params.id }).value();
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.createdBy !== req.user.id && task.assigneeId !== req.user.id)
    return res.status(403).json({ error: 'Not allowed' });
  // Only allow safe fields to be patched
  const allowed = { status: sanitizeStr(req.body?.status, 20) };
  db.get('tasks').find({ id: req.params.id }).assign(allowed).write();
  res.json(db.get('tasks').find({ id: req.params.id }).value());
});

app.delete('/api/tasks/:id', auth, (req, res) => {
  const task = db.get('tasks').find({ id: req.params.id }).value();
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.createdBy !== req.user.id) return res.status(403).json({ error: 'Only the creator can delete a task' });
  db.get('tasks').remove({ id: req.params.id }).write();
  res.json({ ok: true });
});

app.get('/api/tasks/:id/invite.ics', auth, (req, res) => {
  const task = db.get('tasks').find({ id: req.params.id }).value();
  if (!task) return res.status(404).json({ error: 'Not found' });
  if (task.createdBy !== req.user.id && task.assigneeId !== req.user.id)
    return res.status(403).json({ error: 'Not allowed' });
  const ics = buildICS(task);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="task-${task.id.slice(0, 8)}.ics"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(ics);
});

// ── SMTP settings ─────────────────────────────────────────────────────────────
app.get('/api/smtp', auth, (req, res) => {
  const s = db.get('smtp').value() || {};
  // Never send the password back to the client
  res.json({ host: s.host || '', port: s.port || 587, user: s.user || '', configured: !!s.user });
});

app.put('/api/smtp', auth, smtpLimiter, async (req, res) => {
  try {
    const host = sanitizeStr(req.body?.host, 253);
    const port = parseInt(req.body?.port) || 587;
    const user = sanitizeStr(req.body?.user, 254);
    const pass = req.body?.pass; // keep raw, validated by connection test

    if (!host || !user) return res.status(400).json({ error: 'Host and email are required' });
    if (!validateEmail(user)) return res.status(400).json({ error: 'Invalid sender email' });
    if (port < 1 || port > 65535) return res.status(400).json({ error: 'Invalid port' });

    // Only update password if provided; otherwise keep existing
    const existing = db.get('smtp').value() || {};
    const finalPass = pass || existing.pass;

    const transport = nodemailer.createTransport({
      host, port, secure: port === 465,
      auth: { user, pass: finalPass },
      tls: { rejectUnauthorized: IS_PROD },
    });
    await transport.verify();
    db.set('smtp', { host, port, user, pass: finalPass }).write();
    res.json({ ok: true });
  } catch (e) {
    const msg = IS_PROD ? 'SMTP connection failed. Check your credentials.' : `SMTP failed: ${e.message}`;
    res.status(400).json({ error: msg });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status:  'ok',
    uptime:  Math.floor(process.uptime()),
    time:    new Date().toISOString(),
    version: '3.1',
  });
});

// ── Email & calendar helpers ──────────────────────────────────────────────────
async function sendTaskInvite(task) {
  const smtp = db.get('smtp').value() || {};
  if (!smtp.user || !smtp.pass) return false;

  const ics      = buildICS(task);
  const gcalLink = buildGCalLink(task);
  const dateStr  = task.dueDate ? `${task.dueDate} at ${task.dueTime || '09:00'}` : 'No due date set';

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host, port: smtp.port, secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
      tls: { rejectUnauthorized: IS_PROD },
    });
    await transporter.sendMail({
      from:    `"Furniture CRM" <${smtp.user}>`,
      to:      task.assigneeEmail,
      subject: `📋 Task assigned: ${task.title}`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e8e6e0">
          <div style="background:linear-gradient(135deg,#18a558,#0f7a40);padding:28px 32px">
            <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.03em">📋 New Task Assigned</div>
            <div style="color:#86efac;font-size:13px;margin-top:4px">Furniture CRM</div>
          </div>
          <div style="padding:28px 32px">
            <p style="color:#50504a;font-size:13px;margin:0 0 20px">
              Hi <strong>${escHtml(task.assigneeName)}</strong>,
              <strong>${escHtml(task.createdByName)}</strong> assigned you a task:
            </p>
            <div style="background:#f8f7f4;border-radius:10px;padding:18px 20px;margin-bottom:20px">
              <div style="font-size:17px;font-weight:700;color:#111;margin-bottom:8px">${escHtml(task.title)}</div>
              ${task.description ? `<div style="color:#50504a;font-size:13px;margin-bottom:10px">${escHtml(task.description)}</div>` : ''}
              <div style="font-size:12px;color:#8a8880">📅 Due: <strong>${escHtml(dateStr)}</strong></div>
              ${task.companyName ? `<div style="font-size:12px;color:#8a8880;margin-top:4px">🏢 Company: <strong>${escHtml(task.companyName)}</strong></div>` : ''}
            </div>
            <a href="${gcalLink}" target="_blank"
              style="display:inline-block;background:#18a558;color:#fff;padding:12px 22px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;margin-bottom:12px">
              📅 Add to Google Calendar
            </a>
          </div>
        </div>`,
      icalEvent: { method: 'REQUEST', content: ics },
    });
    return true;
  } catch (e) {
    console.error('[email] send failed:', e.message);
    return false;
  }
}

function buildICS(task) {
  const uid = task.id + '@furniture-crm';
  const now = fmtDT(new Date());
  let dtStart, dtEnd;
  if (task.dueDate) {
    const [y, m, d] = task.dueDate.split('-');
    const [hh, mm]  = (task.dueTime || '09:00').split(':');
    const start = new Date(+y, +m - 1, +d, +hh, +mm);
    dtStart = fmtDT(start);
    dtEnd   = fmtDT(new Date(start.getTime() + 3600000));
  } else {
    dtStart = dtEnd = now;
  }
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FurnitureCRM//EN',
    'METHOD:REQUEST', 'BEGIN:VEVENT',
    `UID:${uid}`, `DTSTAMP:${now}`, `DTSTART:${dtStart}`, `DTEND:${dtEnd}`,
    `SUMMARY:${icsEsc(task.title)}`,
    `DESCRIPTION:${icsEsc([task.description, task.companyName && `Company: ${task.companyName}`, `Assigned by: ${task.createdByName} (${task.createdByEmail})`].filter(Boolean).join('\n'))}`,
    `ORGANIZER;CN=${icsEsc(task.createdByName)}:MAILTO:${task.createdByEmail}`,
    `ATTENDEE;CN=${icsEsc(task.assigneeName)};RSVP=TRUE:MAILTO:${task.assigneeEmail}`,
    'STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

function buildGCalLink(task) {
  const p = new URLSearchParams({ text: task.title });
  if (task.dueDate) {
    const [y, m, d] = task.dueDate.split('-');
    const [hh, mm]  = (task.dueTime || '09:00').split(':');
    const start = new Date(+y, +m - 1, +d, +hh, +mm);
    p.set('dates', `${fmtDT(start)}/${fmtDT(new Date(start.getTime() + 3600000))}`);
  }
  p.set('details', [task.description, task.companyName && `Company: ${task.companyName}`,
    `Assigned by: ${task.createdByName} (${task.createdByEmail})`].filter(Boolean).join('\n'));
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&${p}`;
}

function fmtDT(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function icsEsc(s) { return String(s || '').replace(/[\\;,\n]/g, c => '\\' + c); }
function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use('/api/', (req, res) => res.status(404).json({ error: 'API endpoint not found' }));

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[unhandled]', err);
  const msg = IS_PROD ? 'An unexpected error occurred.' : err.message;
  res.status(500).json({ error: msg });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n  ${signal} received — shutting down gracefully…`);
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException', err => {
  console.error('[uncaughtException]', err);
  process.exit(1);
});
process.on('unhandledRejection', err => {
  console.error('[unhandledRejection]', err);
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   🪵  Furniture CRM  v3.1                ║
  ║   http://localhost:${PORT}               ║
  ║   ENV: ${NODE_ENV.padEnd(33)}║
  ╚══════════════════════════════════════════╝
  `);
});
