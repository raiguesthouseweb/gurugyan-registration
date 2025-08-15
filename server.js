// Zero-dependency Node server for GuruGyan Registration
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 5510;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'registrations.json');
const CFG_FILE  = path.join(ROOT, 'config.json');

// --- Admin credentials (can override via env)
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'gg@123';

// --- Ensure data files exist
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
if (!fs.existsSync(CFG_FILE))  fs.writeFileSync(CFG_FILE, JSON.stringify({ max: 0, isOpen: true }, null, 2));

function send(res, code, body, headers = {}) {
  const base = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'Set-Cookie': 'gg_admin=ok; Path=/; SameSite=Lax'
  };
  res.writeHead(code, { ...base, ...headers });
  res.end(body);
}

function sendJSON(res, code, obj) {
  send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > 1e6) req.socket.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
  });
}

function parseCookies(req) {
  const raw = req.headers['cookie'] || '';
  return raw.split(';').reduce((acc, p) => {
    const i = p.indexOf('=');
    if (i > 0) acc[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
    return acc;
  }, {});
}

function isAuthorized(req) {
  // A) Cookie-based admin session
  const cookies = parseCookies(req);
  if (cookies.gg_admin === 'ok') return true;

  // B) Basic auth header
  const hdr = req.headers['authorization'] || '';
  if (!hdr.startsWith('Basic ')) return false;
  const token = hdr.slice(6).trim();
  try {
    const dec = Buffer.from(token, 'base64').toString('utf8');
    const idx = dec.indexOf(':');
    const u = idx > -1 ? dec.slice(0, idx) : '';
    const p = idx > -1 ? dec.slice(idx + 1) : '';
    return (u === ADMIN_USER && p === ADMIN_PASS);
  } catch {
    return false;
  }
}

function requireAdminAuth(req, res) {
  if (!isAuthorized(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="GuruGyan Admin"' });
    res.end('Authentication required');
    return false;
  }
  return true;
}

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
function writeJSON(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 2)); }

function serveStatic(req, res) {
  // Map well-known routes to files
  const map = {
    '/': 'index.html',
    // --- Custom pretty path for Registration page (case-insensitive handled below)
    '/Free.Registration': 'index.html',
    '/admin/': 'Admin/index.html'
  };

  let requested = decodeURIComponent(url.parse(req.url).pathname);
  const requestedLower = requested.toLowerCase();

  // Case-insensitive support for /Free.Registration (e.g., /free.registration, /FREE.REGISTRATION, with/without slash)
  if (requestedLower === '/free.registration' || requestedLower === '/free.registration/') {
    requested = '/Free.Registration';
  }

  // Admin static helper (e.g., /admin-styles.css, /admin-script.js)
  if (requested.startsWith('/admin-')) {
    const filePath = path.join(ROOT, 'Admin', requested.substring(1)); // drop leading '/'
    if (fs.existsSync(filePath)) return streamFile(res, filePath);
  }

  // Resolve file path from map or direct path
  let filePath = map[requested] ? path.join(ROOT, map[requested]) : path.join(ROOT, requested);

  // Directory → index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');

  if (!fs.existsSync(filePath)) return false;

  return streamFile(res, filePath);
}

function streamFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html':'text/html; charset=utf-8',
    '.css':'text/css; charset=utf-8',
    '.js':'text/javascript; charset=utf-8',
    '.png':'image/png',
    '.jpg':'image/jpeg',
    '.jpeg':'image/jpeg',
    '.svg':'image/svg+xml',
    '.ico':'image/x-icon'
  };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const { pathname } = parsed;
  const pathnameLower = (pathname || '').toLowerCase();

  // --- Protect admin UI, assets, and admin APIs
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin') || pathname === '/admin-styles.css' || pathname === '/admin-script.js') {
    if (!requireAdminAuth(req, res)) return;
    // auth ok -> set admin cookie (session-style)
    res.setHeader('Set-Cookie', 'gg_admin=ok; Path=/; SameSite=Lax');
  }

  // --- PUBLIC API
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
    try {
      const body = await readBody(req);
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
    } catch (e) { return send(res, 400, 'Bad Request'); }
  }

  // --- ADMIN API
  if (req.method === 'GET' && pathname === '/api/admin/registration/list') {
    const list = readJSON(DATA_FILE);
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // newest first
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
    try {
      const body = await readBody(req);
      const max = Number(body.max || 0);
      const isOpen = !!body.isOpen;
      const cfg = readJSON(CFG_FILE);
      cfg.max = max; cfg.isOpen = isOpen;
      writeJSON(CFG_FILE, cfg);
      return sendJSON(res, 200, cfg);
    } catch (e) { return send(res, 400, 'Bad Request'); }
  }

  // --- Pretty route: /Free.Registration → index.html (case-insensitive handled in serveStatic)
  // (Nothing to do here because serveStatic already maps it.)

  // --- Static files
  if (serveStatic(req, res)) return;

  // Fallback 404
  send(res, 404, 'Not Found');
});

server.listen(PORT, () => {
  console.log(`GuruGyan registration server running http://127.0.0.1:${PORT}`);
});
