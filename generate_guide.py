#!/usr/bin/env python3
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.units import mm, cm
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.platypus.flowables import Flowable
import os

OUT = os.path.join(os.path.dirname(__file__), 'Furniture_CRM_Deployment_Guide.pdf')

# ── Colors ──────────────────────────────────────────────────────────────────────
GREEN      = HexColor('#18a558')
GREEN_DARK = HexColor('#0f7a40')
GREEN_LIGHT= HexColor('#dcfce7')
DARK       = HexColor('#0f0f0e')
GRAY_BG    = HexColor('#f8f7f4')
GRAY_BORDER= HexColor('#e8e6e0')
TEXT_1     = HexColor('#111111')
TEXT_2     = HexColor('#50504a')
TEXT_3     = HexColor('#8a8880')
RED_BG     = HexColor('#fee2e2')
RED_TEXT   = HexColor('#dc2626')
YELLOW_BG  = HexColor('#fef9c3')
YELLOW_TEXT= HexColor('#b45309')
BLUE_BG    = HexColor('#dbeafe')
BLUE_TEXT  = HexColor('#1d4ed8')

W, H = A4

# ── Styles ───────────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

def sty(name, **kw):
    return ParagraphStyle(name, **kw)

S = {
    'h1': sty('H1', fontSize=22, fontName='Helvetica-Bold', textColor=DARK,
              spaceAfter=4, spaceBefore=20, leading=28),
    'h2': sty('H2', fontSize=14, fontName='Helvetica-Bold', textColor=DARK,
              spaceAfter=4, spaceBefore=16, leading=20),
    'h3': sty('H3', fontSize=11, fontName='Helvetica-Bold', textColor=GREEN_DARK,
              spaceAfter=4, spaceBefore=10, leading=16),
    'body': sty('Body', fontSize=10, fontName='Helvetica', textColor=TEXT_2,
                spaceAfter=6, leading=16),
    'code': sty('Code', fontSize=9, fontName='Courier', textColor=TEXT_1,
                backColor=GRAY_BG, spaceAfter=6, leading=14,
                leftIndent=10, rightIndent=10, spaceBefore=4),
    'code_sm': sty('CodeSm', fontSize=8.5, fontName='Courier', textColor=TEXT_1,
                   leading=13),
    'note': sty('Note', fontSize=9.5, fontName='Helvetica', textColor=TEXT_2,
                leading=15),
    'warn': sty('Warn', fontSize=9.5, fontName='Helvetica-Bold', textColor=RED_TEXT),
    'label': sty('Label', fontSize=8.5, fontName='Helvetica-Bold', textColor=TEXT_3,
                 spaceAfter=2),
    'toc': sty('TOC', fontSize=10, fontName='Helvetica', textColor=TEXT_2,
               spaceAfter=3, leading=16),
    'cover_title': sty('CoverTitle', fontSize=32, fontName='Helvetica-Bold',
                       textColor=white, leading=38, alignment=TA_CENTER),
    'cover_sub': sty('CoverSub', fontSize=14, fontName='Helvetica',
                     textColor=HexColor('#86efac'), alignment=TA_CENTER, leading=20),
    'cover_ver': sty('CoverVer', fontSize=11, fontName='Helvetica',
                     textColor=HexColor('#a3e4bc'), alignment=TA_CENTER),
}

# ── Custom flowables ─────────────────────────────────────────────────────────────
class ColorBlock(Flowable):
    def __init__(self, width, height, color):
        super().__init__()
        self.width  = width
        self.height = height
        self.color  = color
    def draw(self):
        self.canv.setFillColor(self.color)
        self.canv.rect(0, 0, self.width, self.height, fill=1, stroke=0)

class Badge(Flowable):
    """Colored badge pill."""
    def __init__(self, text, bg, fg, w=None):
        super().__init__()
        self.text = text
        self.bg   = bg
        self.fg   = fg
        self.w    = w or (len(text) * 6 + 16)
        self.height = 16
        self.width  = self.w
    def draw(self):
        c = self.canv
        c.setFillColor(self.bg)
        c.roundRect(0, 1, self.w, 14, 7, fill=1, stroke=0)
        c.setFillColor(self.fg)
        c.setFont('Helvetica-Bold', 7.5)
        c.drawCentredString(self.w/2, 4, self.text)

def divider(color=GRAY_BORDER, thickness=0.5):
    return HRFlowable(width='100%', thickness=thickness, color=color, spaceAfter=8, spaceBefore=8)

def spacer(h=6):
    return Spacer(1, h)

def code_block(text):
    lines = text.strip().split('\n')
    rows  = [[Paragraph(line, S['code_sm'])] for line in lines]
    t = Table(rows, colWidths=[W - 4*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0),(-1,-1), GRAY_BG),
        ('BOX',        (0,0),(-1,-1), 0.5, GRAY_BORDER),
        ('LEFTPADDING',  (0,0),(-1,-1), 10),
        ('RIGHTPADDING', (0,0),(-1,-1), 10),
        ('TOPPADDING',   (0,0),(-1,-1), 8),
        ('BOTTOMPADDING',(0,0),(-1,-1), 8),
        ('ROWBACKGROUNDS',(0,0),(-1,-1), [GRAY_BG]),
        ('LINEBEFORE', (0,0),(0,-1), 3, GREEN),
    ]))
    return t

def info_box(title, text, bg=BLUE_BG, tc=BLUE_TEXT):
    content = [[
        Paragraph(f'<b>{title}</b>', ParagraphStyle('ib_t', fontSize=9.5, fontName='Helvetica-Bold', textColor=tc, leading=14)),
        Paragraph(text, ParagraphStyle('ib_b', fontSize=9.5, fontName='Helvetica', textColor=TEXT_2, leading=14)),
    ]]
    t = Table(content, colWidths=[3*cm, W - 7*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0),(-1,-1), bg),
        ('BOX',        (0,0),(-1,-1), 0.5, HexColor('#bfdbfe') if bg==BLUE_BG else HexColor('#fca5a5')),
        ('LEFTPADDING',  (0,0),(-1,-1), 12),
        ('RIGHTPADDING', (0,0),(-1,-1), 12),
        ('TOPPADDING',   (0,0),(-1,-1), 8),
        ('BOTTOMPADDING',(0,0),(-1,-1), 8),
        ('VALIGN', (0,0),(-1,-1), 'TOP'),
    ]))
    return t

def step_table(steps):
    """Numbered steps table."""
    rows = []
    for i, (title, desc) in enumerate(steps, 1):
        num = Paragraph(f'<b>{i}</b>', ParagraphStyle('sn', fontSize=13, fontName='Helvetica-Bold',
                        textColor=GREEN, alignment=TA_CENTER))
        body = [
            Paragraph(f'<b>{title}</b>', ParagraphStyle('st', fontSize=10, fontName='Helvetica-Bold',
                      textColor=TEXT_1, leading=14)),
            Paragraph(desc, ParagraphStyle('sd', fontSize=9.5, fontName='Helvetica',
                      textColor=TEXT_2, leading=14, spaceBefore=2)),
        ]
        rows.append([num, body])
    t = Table(rows, colWidths=[1.2*cm, W - 5.2*cm])
    t.setStyle(TableStyle([
        ('VALIGN',        (0,0),(-1,-1), 'TOP'),
        ('LEFTPADDING',   (0,0),(-1,-1), 8),
        ('RIGHTPADDING',  (0,0),(-1,-1), 8),
        ('TOPPADDING',    (0,0),(-1,-1), 10),
        ('BOTTOMPADDING', (0,0),(-1,-1), 10),
        ('LINEBELOW',     (0,0),(-1,-2), 0.5, GRAY_BORDER),
        ('BACKGROUND',    (0,0),(-1,-1), GRAY_BG),
    ]))
    return t

def kv_table(rows, col1=5*cm):
    data = []
    for k, v, *rest in rows:
        bg = rest[0] if rest else white
        data.append([
            Paragraph(k, ParagraphStyle('kvk', fontSize=9.5, fontName='Helvetica-Bold',
                      textColor=TEXT_1, leading=14)),
            Paragraph(v, ParagraphStyle('kvv', fontSize=9.5, fontName='Helvetica',
                      textColor=TEXT_2, leading=14)),
        ])
    t = Table(data, colWidths=[col1, W - col1 - 4*cm])
    style = [
        ('VALIGN',        (0,0),(-1,-1), 'TOP'),
        ('LEFTPADDING',   (0,0),(-1,-1), 10),
        ('RIGHTPADDING',  (0,0),(-1,-1), 10),
        ('TOPPADDING',    (0,0),(-1,-1), 7),
        ('BOTTOMPADDING', (0,0),(-1,-1), 7),
        ('LINEBELOW',     (0,0),(-1,-2), 0.5, GRAY_BORDER),
    ]
    for i, row in enumerate(rows):
        if len(row) > 2:
            style.append(('BACKGROUND', (0,i),(-1,i), row[2]))
    t.setStyle(TableStyle(style))
    return t

def security_row(severity, issue, fix):
    sev_colors = {
        'CRITICAL': (RED_BG,    RED_TEXT),
        'HIGH':     (YELLOW_BG, YELLOW_TEXT),
        'MEDIUM':   (BLUE_BG,   BLUE_TEXT),
        'LOW':      (GREEN_LIGHT, GREEN_DARK),
    }
    bg, fg = sev_colors.get(severity, (GRAY_BG, TEXT_2))
    return [
        Paragraph(f'<b>{severity}</b>',
                  ParagraphStyle('sev', fontSize=8, fontName='Helvetica-Bold',
                                 textColor=fg, leading=12)),
        Paragraph(issue, ParagraphStyle('si', fontSize=9.5, fontName='Helvetica',
                                        textColor=TEXT_1, leading=14)),
        Paragraph(fix, ParagraphStyle('sf', fontSize=9.5, fontName='Helvetica',
                                       textColor=TEXT_2, leading=14)),
    ]

# ── Document setup ───────────────────────────────────────────────────────────────
doc = SimpleDocTemplate(
    OUT,
    pagesize=A4,
    leftMargin=2*cm, rightMargin=2*cm,
    topMargin=2*cm, bottomMargin=2*cm,
    title='Furniture CRM — Deployment Guide',
    author='Furniture CRM v3.1',
)

story = []

# ═══════════════════════════════════════════════════════════════════════════════
# COVER
# ═══════════════════════════════════════════════════════════════════════════════
def cover_page(canvas, doc):
    canvas.saveState()
    # Green gradient background
    canvas.setFillColor(GREEN_DARK)
    canvas.rect(0, 0, W, H, fill=1, stroke=0)
    canvas.setFillColor(GREEN)
    canvas.rect(0, H*0.35, W, H*0.65, fill=1, stroke=0)
    # Bottom stripe
    canvas.setFillColor(DARK)
    canvas.rect(0, 0, W, 2*cm, fill=1, stroke=0)
    # Logo mark
    canvas.setFillColor(white)
    canvas.setFillAlpha(0.15)
    canvas.roundRect(W/2-35, H*0.62, 70, 70, 12, fill=1, stroke=0)
    canvas.setFillAlpha(1)
    canvas.restoreState()

# Insert cover content
story.append(spacer(90))
story.append(Paragraph('Furniture CRM', S['cover_title']))
story.append(spacer(8))
story.append(Paragraph('Deployment &amp; Operations Guide', S['cover_sub']))
story.append(spacer(6))
story.append(Paragraph('Version 3.1  ·  June 2026', S['cover_ver']))
story.append(spacer(220))

# Cover table of contents preview
toc_data = [
    ['01', 'System Requirements'],
    ['02', 'Installation — Step by Step'],
    ['03', 'Environment Configuration'],
    ['04', 'Running the Server'],
    ['05', 'Deploying to a Live VPS'],
    ['06', 'HTTPS / SSL Setup with Nginx'],
    ['07', 'Security Overview'],
    ['08', 'Database &amp; Backups'],
    ['09', 'Email (SMTP) Setup'],
    ['10', 'Troubleshooting'],
]
toc_rows = [[
    Paragraph(f'<b>{n}</b>', ParagraphStyle('tn', fontSize=9, fontName='Helvetica-Bold',
              textColor=GREEN_LIGHT, leading=14)),
    Paragraph(t, ParagraphStyle('tt', fontSize=9, fontName='Helvetica',
              textColor=HexColor('#d1fae5'), leading=14)),
] for n,t in toc_data]
toc_t = Table(toc_rows, colWidths=[1.2*cm, W-5.2*cm])
toc_t.setStyle(TableStyle([
    ('LEFTPADDING',  (0,0),(-1,-1), 0),
    ('RIGHTPADDING', (0,0),(-1,-1), 0),
    ('TOPPADDING',   (0,0),(-1,-1), 3),
    ('BOTTOMPADDING',(0,0),(-1,-1), 3),
    ('LINEBELOW',    (0,0),(-1,-2), 0.3, HexColor('#166534')),
]))
story.append(toc_t)

# ── Force page break after cover ────────────────────────────────────────────────
from reportlab.platypus import PageBreak
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 1 — REQUIREMENTS
# ═══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph('01 — System Requirements', S['h1']))
story.append(divider(GREEN, 1.5))
story.append(spacer(4))

story.append(Paragraph('Software', S['h3']))
story.append(kv_table([
    ('Node.js',     '16 or newer (v18 LTS recommended). Check: node --version'),
    ('npm',         'Comes with Node.js. Check: npm --version'),
    ('OS',          'Linux (Ubuntu 22.04 recommended), macOS 12+, or Windows 10+ with WSL2'),
    ('RAM',         'Minimum 512 MB free. 1 GB+ recommended for production'),
    ('Disk',        'At least 200 MB free for the app, logs, and database backups'),
    ('Port',        '3456 (default). Must be open in firewall for external access'),
], col1=4*cm))

story.append(spacer(10))
story.append(Paragraph('Optional (for production)', S['h3']))
story.append(kv_table([
    ('Nginx',       'Reverse proxy + SSL termination. Install: sudo apt install nginx'),
    ('Certbot',     'Free SSL certificates from Let\'s Encrypt. Install: sudo apt install certbot'),
    ('PM2',         'Process manager — keeps the app running after crashes and reboots'),
    ('UFW Firewall','sudo apt install ufw — block unused ports'),
], col1=4*cm))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — INSTALLATION
# ═══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph('02 — Installation — Step by Step', S['h1']))
story.append(divider(GREEN, 1.5))
story.append(spacer(4))

story.append(info_box('Note', 'These steps assume a fresh Ubuntu 22.04 VPS. Run all commands as a non-root user with sudo access.'))
story.append(spacer(10))

story.append(Paragraph('Install Node.js 18 on Ubuntu', S['h3']))
story.append(code_block('''# Add NodeSource repository for Node 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Install Node.js
sudo apt-get install -y nodejs

# Verify installation
node --version   # should print v18.x.x
npm --version    # should print 9.x.x'''))

story.append(spacer(8))
story.append(Paragraph('Upload the CRM folder to your server', S['h3']))
story.append(code_block('''# From your local Mac — upload the CRM folder to the server
scp -r ~/Desktop/CRM  user@YOUR_SERVER_IP:/home/user/crm

# Or use rsync for large transfers
rsync -avz --exclude node_modules --exclude data/db.json \\
      ~/Desktop/CRM/  user@YOUR_SERVER_IP:/home/user/crm/'''))

story.append(spacer(8))
story.append(Paragraph('Install dependencies on the server', S['h3']))
story.append(code_block('''# SSH into your server
ssh user@YOUR_SERVER_IP

# Go to the CRM folder
cd /home/user/crm

# Install Node.js packages
npm install

# Confirm no critical errors
npm audit --audit-level=critical'''))

story.append(spacer(8))
story.append(Paragraph('Create the data directory', S['h3']))
story.append(code_block('''# The database lives in ./data/ (not served by web)
mkdir -p data
chmod 700 data           # only your user can read it'''))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — ENVIRONMENT CONFIG
# ═══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph('03 — Environment Configuration (.env)', S['h1']))
story.append(divider(GREEN, 1.5))
story.append(spacer(4))

story.append(info_box('Security', 'The .env file contains your secret keys. Never commit it to Git, never share it, and set strict permissions on the server.', RED_BG, RED_TEXT))
story.append(spacer(10))

story.append(Paragraph('Create the .env file', S['h3']))
story.append(code_block('''# On your server, inside /home/user/crm/
nano .env'''))

story.append(spacer(6))
story.append(Paragraph('Contents of .env', S['h3']))
story.append(code_block('''# Server
PORT=3456
NODE_ENV=production

# JWT Secret — generate a new one with the command below
JWT_SECRET=paste_your_generated_secret_here

# Optional: your domain (restricts CORS to your site only)
ALLOWED_ORIGIN=https://yourdomain.com'''))

story.append(spacer(6))
story.append(Paragraph('Generate a strong JWT secret', S['h3']))
story.append(code_block('''# Run this on your server to generate a secure random secret
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# Copy the output and paste it as JWT_SECRET in .env'''))

story.append(spacer(6))
story.append(Paragraph('Protect the .env file', S['h3']))
story.append(code_block('''# Only your user can read it — no one else
chmod 600 .env

# Verify permissions (should show -rw-------)
ls -la .env'''))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 4 — RUNNING THE SERVER
# ═══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph('04 — Running the Server', S['h1']))
story.append(divider(GREEN, 1.5))
story.append(spacer(4))

story.append(Paragraph('Quick test (development only)', S['h3']))
story.append(code_block('''cd /home/user/crm
node server.js

# You should see:
#  ╔══════════════════════════════════════════╗
#  ║   🪵  Furniture CRM  v3.1               ║
#  ║   http://localhost:3456                  ║
#  ╚══════════════════════════════════════════╝'''))

story.append(spacer(8))
story.append(Paragraph('Production — PM2 (recommended)', S['h3']))
story.append(code_block('''# Install PM2 globally
sudo npm install -g pm2

# Start the CRM using the included PM2 config
pm2 start ecosystem.config.js --env production

# Check status
pm2 status

# View live logs
pm2 logs crm

# Restart after code changes
pm2 reload crm'''))

story.append(spacer(8))
story.append(Paragraph('Auto-start on server reboot', S['h3']))
story.append(code_block('''# Generate the startup script (run as your user, not root)
pm2 startup

# PM2 will print a command — copy it and run it with sudo
# It looks like: sudo env PATH=... pm2 startup systemd -u user

# Save the current process list
pm2 save

# Test it works after reboot
sudo reboot
# After reconnecting: pm2 status  → should show "online"'''))

story.append(spacer(8))
story.append(Paragraph('PM2 useful commands', S['h3']))
story.append(kv_table([
    ('pm2 status',          'See all running processes and their CPU/memory'),
    ('pm2 logs crm',        'Live log stream (Ctrl+C to exit)'),
    ('pm2 logs crm --lines 100', 'Last 100 log lines'),
    ('pm2 reload crm',      'Zero-downtime reload after code update'),
    ('pm2 stop crm',        'Stop the server'),
    ('pm2 delete crm',      'Remove from PM2 list'),
    ('pm2 monit',           'Real-time dashboard with CPU, memory, logs'),
], col1=5.5*cm))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 5 — DEPLOYING TO A LIVE VPS
# ═══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph('05 — Deploying to a Live VPS', S['h1']))
story.append(divider(GREEN, 1.5))
story.append(spacer(4))

story.append(Paragraph('Recommended VPS providers', S['h3']))
story.append(kv_table([
    ('DigitalOcean', 'droplets.digitalocean.com — $6/mo Droplet (1GB RAM) is enough'),
    ('Hetzner',      'hetzner.com — cheapest in Europe, €4/mo CX11'),
    ('Vultr',        'vultr.com — $6/mo, many locations worldwide'),
    ('Linode / Akamai', 'linode.com — $5/mo Nanode'),
], col1=4.5*cm))

story.append(spacer(10))
story.append(Paragraph('Firewall setup (UFW)', S['h3']))
story.append(code_block('''sudo ufw allow OpenSSH      # keep SSH open!
sudo ufw allow 80/tcp       # HTTP (for Nginx + Let\'s Encrypt)
sudo ufw allow 443/tcp      # HTTPS
sudo ufw deny 3456/tcp      # block direct Node.js access — use Nginx instead
sudo ufw enable

# Check rules
sudo ufw status verbose'''))

story.append(spacer(8))
story.append(info_box('Important', 'Never expose port 3456 directly to the internet. Always put Nginx in front. Nginx handles HTTPS and forwards traffic to Node.js internally.'))
story.append(spacer(8))

story.append(Paragraph('Point your domain to the server', S['h3']))
story.append(Paragraph(
    'In your domain registrar\'s DNS settings, create an <b>A record</b>:',
    S['body']))
story.append(kv_table([
    ('Type',    'A'),
    ('Name',    '@ (or crm.yourdomain.com for a subdomain)'),
    ('Value',   'YOUR_SERVER_IP_ADDRESS'),
    ('TTL',     '3600 (or Auto)'),
], col1=3*cm))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 6 — NGINX + SSL
# ═══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph('06 — HTTPS / SSL Setup with Nginx', S['h1']))
story.append(divider(GREEN, 1.5))
story.append(spacer(4))

story.append(Paragraph('Install Nginx and Certbot', S['h3']))
story.append(code_block('''sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx'''))

story.append(spacer(8))
story.append(Paragraph('Create Nginx config for the CRM', S['h3']))
story.append(code_block('''sudo nano /etc/nginx/sites-available/crm'''))

story.append(spacer(6))
story.append(Paragraph('Paste this into the file:', S['body']))
story.append(code_block('''server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    # Proxy to Node.js
    location / {
        proxy_pass         http://127.0.0.1:3456;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection \'upgrade\';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
        proxy_send_timeout 30s;
        client_max_body_size 12M;
    }
}'''))

story.append(spacer(8))
story.append(Paragraph('Enable the site and get SSL certificate', S['h3']))
story.append(code_block('''# Enable the site
sudo ln -s /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/

# Test config syntax
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Get free SSL certificate from Let\'s Encrypt
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Certbot automatically:
# 1. Gets the certificate
# 2. Updates your Nginx config for HTTPS
# 3. Sets up auto-renewal (runs every 90 days)

# Verify auto-renewal works
sudo certbot renew --dry-run'''))

story.append(spacer(8))
story.append(info_box('Result', 'Your CRM will be available at https://yourdomain.com with a valid SSL certificate. HTTP requests automatically redirect to HTTPS.'))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 7 — SECURITY
# ═══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph('07 — Security Overview', S['h1']))
story.append(divider(GREEN, 1.5))
story.append(spacer(4))

story.append(Paragraph('What is already protected in your CRM', S['h3']))

sec_rows = [
    ['Severity', 'Threat', 'Protection Applied'],
    *[security_row(*r) for r in [
        ('CRITICAL', 'Database file (db.json) exposed to web',
         'Moved to data/ folder. All .json/.env requests return 403 Forbidden'),
        ('CRITICAL', 'JWT secret hardcoded in source code',
         'Moved to .env file. Server refuses to start without a strong secret'),
        ('HIGH',     'Brute-force login attacks',
         '5 failed logins locks the account for 15 minutes'),
        ('HIGH',     'Rate limiting / DDoS on API',
         'Auth: 20 req/15min · API: 120 req/min · SMTP: 5 req/min'),
        ('HIGH',     'Missing security headers (XSS, Clickjacking)',
         'Helmet.js adds X-Frame-Options, CSP, X-XSS-Protection, HSTS'),
        ('MEDIUM',   'Server error details leaked to client',
         'Production mode returns generic messages. Details only in server logs'),
        ('MEDIUM',   'SMTP password returned in API response',
         'GET /api/smtp strips the password field before sending to browser'),
        ('MEDIUM',   'No input validation — oversized payloads',
         'All inputs: trimmed, length-capped, type-validated. API: 500KB limit'),
        ('MEDIUM',   'Timing attacks on login (user enumeration)',
         'bcrypt runs even for unknown emails to prevent timing-based detection'),
        ('LOW',      'Passwords stored in plaintext',
         'bcrypt with 12 rounds (slow hash, resistant to rainbow tables)'),
        ('LOW',      'Sensitive files indexed by search engines',
         'robots meta tag: noindex, nofollow'),
    ]]
]
sec_t = Table(sec_rows, colWidths=[2.2*cm, 5.8*cm, W - 12*cm])
sec_t.setStyle(TableStyle([
    ('BACKGROUND',   (0,0),(-1,0), DARK),
    ('TEXTCOLOR',    (0,0),(-1,0), white),
    ('FONTNAME',     (0,0),(-1,0), 'Helvetica-Bold'),
    ('FONTSIZE',     (0,0),(-1,0), 9),
    ('TOPPADDING',   (0,0),(-1,-1), 7),
    ('BOTTOMPADDING',(0,0),(-1,-1), 7),
    ('LEFTPADDING',  (0,0),(-1,-1), 8),
    ('RIGHTPADDING', (0,0),(-1,-1), 8),
    ('LINEBELOW',    (0,0),(-1,-2), 0.4, GRAY_BORDER),
    ('VALIGN',       (0,0),(-1,-1), 'TOP'),
    ('ROWBACKGROUNDS',(0,1),(-1,-1), [white, GRAY_BG]),
]))
story.append(sec_t)

story.append(spacer(10))
story.append(Paragraph('Additional hardening recommendations', S['h3']))
story.append(kv_table([
    ('SSH keys only',       'Disable password SSH login: PasswordAuthentication no in /etc/ssh/sshd_config'),
    ('Fail2ban',            'sudo apt install fail2ban — auto-bans IPs with repeated SSH failures'),
    ('Regular updates',     'sudo apt update && sudo apt upgrade — run monthly at minimum'),
    ('2FA for server SSH',  'Use Google Authenticator PAM module for SSH two-factor auth'),
    ('Change SSH port',     'Edit /etc/ssh/sshd_config: Port 2222 — reduces automated attacks'),
], col1=4.5*cm))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 8 — DATABASE & BACKUPS
# ═══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph('08 — Database &amp; Backups', S['h1']))
story.append(divider(GREEN, 1.5))
story.append(spacer(4))

story.append(Paragraph('Database location', S['h3']))
story.append(kv_table([
    ('File',        '/home/user/crm/data/db.json'),
    ('Format',      'JSON (lowdb flat-file database)'),
    ('Contents',    'Users, CRM companies, tasks, notes, activity log, SMTP settings'),
    ('Access',      'chmod 700 data/ — only your server user can read it'),
    ('Web access',  'Blocked — returns 403 Forbidden if requested via browser'),
], col1=3.5*cm))

story.append(spacer(10))
story.append(Paragraph('Manual backup', S['h3']))
story.append(code_block('''cd /home/user/crm
./backup.sh

# Output:
# ✅ Backup saved: backups/db_2026-06-09_03-00.json
# 🧹 Old backups pruned (keeping 30)'''))

story.append(spacer(8))
story.append(Paragraph('Automatic daily backup with cron', S['h3']))
story.append(code_block('''# Open cron editor
crontab -e

# Add this line to run backup every day at 3:00 AM
0 3 * * * /home/user/crm/backup.sh >> /home/user/crm/logs/backup.log 2>&1'''))

story.append(spacer(8))
story.append(Paragraph('Restore from backup', S['h3']))
story.append(code_block('''# Stop the server first
pm2 stop crm

# Replace database with backup
cp backups/db_2026-06-09_03-00.json data/db.json

# Start server again
pm2 start crm

# Verify it loaded correctly
curl http://localhost:3456/api/health'''))

story.append(spacer(8))
story.append(Paragraph('Off-site backup (optional but strongly recommended)', S['h3']))
story.append(code_block('''# Copy latest backup to another server or S3 bucket
scp backups/db_$(date +%Y-%m-%d)*.json backup@BACKUP_SERVER:/backups/crm/

# Or use rclone to sync to Google Drive / Dropbox / S3
# Install: sudo apt install rclone
# Config:  rclone config
rclone copy /home/user/crm/backups remote:crm-backups'''))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 9 — EMAIL
# ═══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph('09 — Email (SMTP) Setup', S['h1']))
story.append(divider(GREEN, 1.5))
story.append(spacer(4))

story.append(Paragraph(
    'Email is used to notify team members when a task is assigned to them. '
    'Configure it inside the CRM under Tasks → Email Settings.',
    S['body']))

story.append(spacer(8))
story.append(Paragraph('Gmail (recommended)', S['h3']))
story.append(step_table([
    ('Enable 2-Step Verification',
     'Go to myaccount.google.com/security → 2-Step Verification → Turn On'),
    ('Create an App Password',
     'Go to myaccount.google.com/apppasswords → Select app: Mail → Generate. Copy the 16-character code.'),
    ('Enter settings in CRM',
     'Tasks → Email Settings:\n• Host: smtp.gmail.com\n• Port: 587\n• Email: yourname@gmail.com\n• Password: paste the App Password (NOT your Gmail password)'),
    ('Click Save & Test',
     'The server sends a test connection. If it shows ✅ Connected, email is working.'),
]))

story.append(spacer(10))
story.append(Paragraph('Other email providers', S['h3']))
story.append(kv_table([
    ('Outlook / Hotmail', 'Host: smtp-mail.outlook.com  Port: 587'),
    ('Yahoo Mail',        'Host: smtp.mail.yahoo.com  Port: 587  (requires App Password)'),
    ('Office 365',        'Host: smtp.office365.com  Port: 587'),
    ('Custom domain',     'Check your hosting provider\'s SMTP documentation'),
    ('SendGrid',          'Host: smtp.sendgrid.net  Port: 587  User: apikey  Pass: your API key'),
], col1=4.5*cm))

story.append(spacer(10))
story.append(info_box('Note', 'SMTP credentials are stored encrypted in data/db.json on the server. The password is never sent back to the browser after saving.'))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 10 — TROUBLESHOOTING
# ═══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph('10 — Troubleshooting', S['h1']))
story.append(divider(GREEN, 1.5))
story.append(spacer(4))

issues = [
    ('Server won\'t start — "JWT_SECRET missing"',
     'Check your .env file exists and contains JWT_SECRET with at least 32 characters.\nRun: cat .env'),
    ('Server won\'t start — "Cannot find module"',
     'Dependencies not installed. Run: npm install'),
    ('"Failed to fetch" in the browser',
     'You opened index.html as a file (file://) instead of through the server.\nOpen http://localhost:3456 or your domain.'),
    ('Port 3456 already in use',
     'Kill the old process:\nlsof -ti:3456 | xargs kill -9\nThen restart: pm2 restart crm'),
    ('503 Bad Gateway in Nginx',
     'Node.js is not running. Check: pm2 status\nStart it: pm2 start ecosystem.config.js'),
    ('SSL certificate error',
     'Certificate may be expired. Renew: sudo certbot renew\nCheck auto-renewal: sudo certbot renew --dry-run'),
    ('Login always says "Incorrect password"',
     'Account may be locked (5 failed attempts). Wait 15 minutes or restart the server to reset.'),
    ('Emails not sending',
     '1. Check Email Settings in the app — should show ✅\n2. For Gmail, confirm App Password is used (not your main password)\n3. Check server logs: pm2 logs crm'),
    ('Data not saving / lost after restart',
     'Check data/ folder exists and is writable:\nls -la data/\nchmod 700 data/ && chmod 600 data/db.json'),
    ('High CPU / memory usage',
     'Check PM2: pm2 monit\nRestart if needed: pm2 reload crm\nConsider upgrading your VPS plan.'),
]

for title, solution in issues:
    story.append(KeepTogether([
        Paragraph(f'&#9654; {title}', ParagraphStyle('it', fontSize=10,
                  fontName='Helvetica-Bold', textColor=TEXT_1, spaceBefore=10, spaceAfter=4, leading=15)),
        code_block(solution),
    ]))

story.append(spacer(10))
story.append(Paragraph('Viewing server logs', S['h3']))
story.append(code_block('''# Live logs (PM2)
pm2 logs crm

# Last 200 lines
pm2 logs crm --lines 200

# Error log only
tail -f /home/user/crm/logs/err.log

# Check if Node process is running
ps aux | grep node'''))

# ── Footer page ──────────────────────────────────────────────────────────────────
def add_page_number(canvas, doc):
    if doc.page == 1:
        cover_page(canvas, doc)
        return
    canvas.saveState()
    canvas.setFillColor(TEXT_3)
    canvas.setFont('Helvetica', 8)
    canvas.drawString(2*cm, 1.2*cm, 'Furniture CRM v3.1 — Deployment Guide')
    canvas.drawRightString(W - 2*cm, 1.2*cm, f'Page {doc.page}')
    canvas.setStrokeColor(GRAY_BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(2*cm, 1.5*cm, W - 2*cm, 1.5*cm)
    canvas.restoreState()

# ── Build ─────────────────────────────────────────────────────────────────────────
doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
print(f'✅ PDF created: {OUT}')
