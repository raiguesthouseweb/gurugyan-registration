// Zero-dependency Node server for GuruGyan Registration + Form-based Admin Login
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const querystring = require('querystring');

const PORT = process.env.PORT || 5510;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'registrations.json');
const CFG_FILE  = path.join(ROOT, 'config.json');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'gg@123';

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
if (!fs.existsSync(CFG_FILE))  fs.writeFileSync(CFG_FILE, JSON.stringify({ max: 0, isOpen: true }, null, 2));

function send(res, code, body, headers = {}) {
  res.writeHead(code, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(body);
}
function sendJSON(res, code, obj) {
  send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}
function streamFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
    '.js':'text/javascript; charset=utf-8', '.png':'image/png',
    '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon'
  };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}
function parseCookies(req) {
  const raw = req.headers['cookie'] || '';
  return raw.split(';').reduce((acc, p) => {
    const i = p.indexOf('=');
    if (i > 0) acc[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
    return acc;
  }, {});
}
function isAdmin(req) {
  const c = parseCookies(req);
  return c.gg_admin === 'ok';
}
function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  // not logged in → redirect to /admin-login with next
  const next = encodeURIComponent(req.url || '/admin/');
  res.writeHead(302, { Location: `/admin-login?next=${next}` });
  res.end();
  return false;
}
function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
function writeJSON(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 2)); }

function serveStatic(req, res) {
  const map = {
    '/': 'index.html',
    '/Free.Registration': 'index.html',
    '/admin/': 'Admin/index.html'
  };
  let requested = decodeURIComponent(url.parse(req.url).pathname || '/');
  const lower = requested.toLowerCase();
  if (lower === '/free.registration' || lower === '/free.registration/') requested = '/Free.Registration';

  // admin assets served from /Admin/
  if (requested.startsWith('/admin-')) {
    const f = path.join(ROOT, 'Admin', requested.substring(1));
    if (fs.existsSync(f)) return streamFile(res, f), true;
    return false;
  }

  let filePath = map[requested] ? path.join(ROOT, map[requested]) : path.join(ROOT, requested);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
  if (!fs.existsSync(filePath)) return false;
  streamFile(res, filePath);
  return true;
}

// Simple HTML for admin login
const LOGIN_HTML = (msg = '') => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>GuruGyan Admin Login</title>
<style>
body{margin:0;background:#0b1220;color:#e6eaf2;font-family:Inter,system-ui,Segoe UI,Roboto,Arial,sans-serif;display:grid;place-items:center;height:100vh}
.card{background:#10182b;border:1px solid #22304a;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.4);padding:28px;max-width:360px;width:92%}
.h{font-size:20px;margin:0 0 12px}
label{display:block;font-size:13px;color:#9aa4b2;margin:12px 0 6px}
input{width:100%;padding:10px 12px;background:#0e1626;color:#e6eaf2;border:1px solid #2a3b58;border-radius:10px;outline:none}
.btn{margin-top:16px;width:100%;padding:12px 14px;background:#7c3aed;color:#fff;border:0;border-radius:12px;cursor:pointer;font-weight:600}
.msg{color:#ff8b8b;margin:6px 0 0;height:18px;font-size:13px}
.small{margin-top:10px;color:#9aa4b2;font-size:12px}
a{color:#22d3ee;text-decoration:none}
</style></head>
<body>
  <div class="card">
    <h1 class="h">Admin Login</h1>
    <form method="POST" action="/admin-login">
      <label>Username</label><input name="u" autocomplete="username" required />
      <label>Password</label><input name="p" type="password" autocomplete="current-password" required />
      <input type="hidden" name="next" value="/" id="nextInput"/>
      <div class="msg">${msg}</div>
      <button class="btn" type="submit">Login</button>
    </form>
    <div class="small">Back to <a href="/Free.Registration">Registration</a></div>
  </div>
<script>const q=new URLSearchParams(location.search);document.getElementById('nextInput').value=q.get('next')||'/admin/';</script>
</body></html>`;

// ---- Server
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';

  // ---- Admin Login (GET form)
  if (req.method === 'GET' && pathname === '/admin-login') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(LOGIN_HTML());
  }
  // ---- Admin Login (POST submit)
  if (req.method === 'POST' && pathname === '/admin-login') {
    let body = '';
    req.on('data', ch => body += ch);
    req.on('end', () => {
      const f = querystring.parse(body);
      if (String(f.u) === ADMIN_USER && String(f.p) === ADMIN_PASS) {
        const next = typeof f.next === 'string' ? f.next : '/admin/';
        res.writeHead(302, {
          'Set-Cookie': 'gg_admin=ok; Path=/; HttpOnly; SameSite=Lax',
          Location: next
        });
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(LOGIN_HTML('Invalid credentials'));
    });
    return;
  }

  // ---- Public APIs
  if (req.method === 'GET' && pathname === '/api/registration/count') {
    const list = readJSON(DATA_FILE);
    const cfg = readJSON(CFG_FILE);
    return sendJSON(res, 200, { total: list.length, max: Number(cfg.max || 0), isOpen: !!cfg.isOpen });
  }
  if (req.method === 'GET' && pathname === '/api/registration/status') {
    const cfg = readJSON(CFG_FILE);
    return sendJSON(res, 200, { isOpen: !!cfg.isOpen });
  }
  if (req.method === 'POST' && pathname === '/api/registration') {
    let raw = '';
    req.on('data', ch => raw += ch);
    req.on('end', () => {
      try {
        const body = JSON.parse(raw || '{}');
        const { firstName, lastName, mobile, whatsapp, email } = body || {};
        if (!firstName || !lastName || !mobile || !whatsapp || !email) return send(res, 400, 'All fields required');
        if (String(mobile).length !== 10 || String(whatsapp).length !== 10) return send(res, 400, 'Numbers must be exactly 10 digits');

        const cfg = readJSON(CFG_FILE);
        const list = readJSON(DATA_FILE);
        const total = list.length;
        const isClosed = !cfg.isOpen || (Number(cfg.max || 0) > 0 && total >= Number(cfg.max));
        if (isClosed) return send(res, 403, 'Closed');

        if (list.some(r => String(r.mobile) === String(mobile)))
          return send(res, 409, 'you are already registered — SOON YOU CAN PREDICT THE FUTURE');

        const row = {
          id: Date.now().toString(36),
          firstName, lastName, mobile, whatsapp, email,
          createdAt: new Date().toISOString(),
          userAgent: req.headers['user-agent'] || '',
          ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString()
        };
        list.push(row);
        writeJSON(DATA_FILE, list);
        return send(res, 201, 'OK');
      } catch { return send(res, 400, 'Bad Request'); }
    });
    return;
  }

  // ---- Admin APIs (cookie guard)
  if (pathname.startsWith('/api/admin/')) {
    if (!requireAdmin(req, res)) return;
    if (req.method === 'GET' && pathname === '/api/admin/registration/list') {
      const list = readJSON(DATA_FILE);
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return sendJSON(res, 200, list);
    }
    if (req.method === 'GET' && pathname === '/api/admin/registration/export.csv') {
      const list = readJSON(DATA_FILE);
      const header = ['id','firstName','lastName','mobile','whatsapp','email','createdAt','userAgent','ip'];
      const rows = [header.join(',')].concat(
        list.map(r => header.map(h => '"' + String(r[h] ?? '').replaceAll('"','""') + '"').join(','))
      );
      return send(res, 200, rows.join('\n'), {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="registrations.csv"'
      });
    }
    if (req.method === 'POST' && pathname === '/api/admin/registration/config') {
      let raw = '';
      req.on('data', ch => raw += ch);
      req.on('end', () => {
        try {
          const body = JSON.parse(raw || '{}');
          const max = Number(body.max || 0);
          const isOpen = !!body.isOpen;
          const cfg = readJSON(CFG_FILE);
          cfg.max = max; cfg.isOpen = isOpen;
          writeJSON(CFG_FILE, cfg);
          return sendJSON(res, 200, cfg);
        } catch { return send(res, 400, 'Bad Request'); }
      });
      return;
    }
  }

  // ---- Admin static UI (guarded)
  if (pathname === '/admin/' || pathname.startsWith('/admin-')) {
    if (!requireAdmin(req, res)) return;
  }

  // ---- Static routes
  if (serveStatic(req, res)) return;

  // ---- 404
  send(res, 404, 'Not Found');
});

server.listen(PORT, () => {
  console.log(`GuruGyan registration server running http://127.0.0.1:${PORT}`);
});
