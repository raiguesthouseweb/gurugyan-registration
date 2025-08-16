// GuruGyan Registration Server (MongoDB persistent + JSON fallback)
// Hinglish comments for clarity ♥

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const querystring = require('querystring');

// --------- Config ---------
const PORT = process.env.PORT || 5510;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'registrations.json');
const CFG_FILE  = path.join(ROOT, 'config.json');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'gg@123';
const MONGODB_URI = process.env.MONGODB_URI || ''; // set on Render

// --------- Utilities ---------
function parseCookies(req) {
  const raw = req.headers['cookie'] || '';
  return raw.split(';').reduce((acc, p) => {
    const i = p.indexOf('=');
    if (i > 0) acc[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
    return acc;
  }, {});
}
function isAdmin(req) { return parseCookies(req).gg_admin === 'ok'; }
function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  const next = encodeURIComponent(req.url || '/admin/');
  res.writeHead(302, { Location: `/admin-login?next=${next}` });
  res.end(); return false;
}
function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
function sendJSON(res, code, obj) {
  send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}
function readBodyJSON(req, cb) {
  let raw = ''; req.on('data', ch => raw += ch);
  req.on('end', () => { try { cb(null, raw ? JSON.parse(raw) : {}); } catch (e) { cb(e); } });
}
function streamFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}
function ensureLocalFiles() {
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
  if (!fs.existsSync(CFG_FILE))  fs.writeFileSync(CFG_FILE, JSON.stringify({ max: 0, isOpen: true }, null, 2));
}
function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
function writeJSON(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 2)); }

// --------- DB Layer (Mongo preferred) ---------
let db = null, colRegs = null, colCfg = null;
async function initDB() {
  if (!MONGODB_URI) return; // no DB → fallback to JSON
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(process.env.MONGODB_DB || 'gurugyan');
  colRegs = db.collection('registrations');
  colCfg  = db.collection('config');

  // seed default config if missing
  const cfg = await colCfg.findOne({ _id: 'main' });
  if (!cfg) await colCfg.insertOne({ _id: 'main', max: 0, isOpen: true });

  // first-time seed from local JSON if present & collection empty
  const count = await colRegs.estimatedDocumentCount();
  if (count === 0 && fs.existsSync(DATA_FILE)) {
    const arr = readJSON(DATA_FILE);
    if (Array.isArray(arr) && arr.length) {
      await colRegs.insertMany(arr);
    }
  }
}

// Data access helpers with fallback
async function getConfig() {
  if (colCfg) {
    const c = await colCfg.findOne({ _id: 'main' });
    return c || { max: 0, isOpen: true };
  }
  ensureLocalFiles(); return readJSON(CFG_FILE);
}
async function saveConfig(partial) {
  // sanitize: preserve previous if field missing/blank
  const prev = await getConfig();
  const next = {
    max: (partial.max === '' || partial.max === undefined || isNaN(Number(partial.max))) ? prev.max : Math.max(0, Number(partial.max)),
    isOpen: typeof partial.isOpen === 'boolean' ? partial.isOpen : !!prev.isOpen
  };
  if (colCfg) {
    await colCfg.updateOne({ _id: 'main' }, { $set: next }, { upsert: true });
    return next;
  }
  writeJSON(CFG_FILE, next); return next;
}
async function listRegs() {
  if (colRegs) return await colRegs.find({}).sort({ createdAt: -1 }).toArray();
  ensureLocalFiles(); return readJSON(DATA_FILE).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
}
async function addReg(row) {
  if (colRegs) { await colRegs.insertOne(row); return; }
  ensureLocalFiles(); const arr = readJSON(DATA_FILE); arr.push(row); writeJSON(DATA_FILE, arr);
}
async function regsCount() {
  if (colRegs) return await colRegs.estimatedDocumentCount();
  ensureLocalFiles(); return readJSON(DATA_FILE).length;
}

// --------- Static routing ---------
function serveStatic(req, res) {
  const map = { '/':'index.html','/Free.Registration':'index.html','/admin/':'Admin/index.html' };
  let pathname = decodeURIComponent(url.parse(req.url).pathname || '/');
  if (pathname.toLowerCase() === '/free.registration' || pathname.toLowerCase() === '/free.registration/') pathname = '/Free.Registration';

  if (pathname.startsWith('/admin-')) {
    const f = path.join(ROOT, 'Admin', pathname.substring(1));
    if (fs.existsSync(f)) return streamFile(res,f), true; else return false;
  }

  let filePath = map[pathname] ? path.join(ROOT, map[pathname]) : path.join(ROOT, pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
  if (!fs.existsSync(filePath)) return false;
  streamFile(res, filePath); return true;
}

// --------- Login page (form-based) ---------
const LOGIN_HTML = (msg='') => `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>GuruGyan Admin Login</title>
<style>body{margin:0;background:#0b1220;color:#e6eaf2;font-family:Inter,system-ui,Segoe UI,Roboto,Arial,sans-serif;display:grid;place-items:center;height:100vh}
.card{background:#10182b;border:1px solid #22304a;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.4);padding:28px;max-width:360px;width:92%}
label{display:block;font-size:13px;color:#9aa4b2;margin:12px 0 6px}input{width:100%;padding:10px 12px;background:#0e1626;color:#e6eaf2;border:1px solid #2a3b58;border-radius:10px}
.btn{margin-top:16px;width:100%;padding:12px 14px;background:#7c3aed;color:#fff;border:0;border-radius:12px;font-weight:600}.msg{color:#ff8b8b;height:18px;margin-top:8px}</style>
</head><body><div class="card"><h2>Admin Login</h2>
<form method="POST" action="/admin-login"><label>Username</label><input name="u" required /><label>Password</label><input name="p" type="password" required />
<input type="hidden" name="next" id="next"/><div class="msg">${msg}</div><button class="btn" type="submit">Login</button></form>
<div style="margin-top:10px"><a href="/Free.Registration">Back to Registration</a></div></div>
<script>const q=new URLSearchParams(location.search);document.getElementById('next').value=q.get('next')||'/admin/';</script></body></html>`;

// --------- Server ---------
const server = http.createServer(async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);

  // Admin login (GET/POST)
  if (req.method==='GET' && pathname==='/admin-login') {
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); return res.end(LOGIN_HTML());
  }
  if (req.method==='POST' && pathname==='/admin-login') {
    let body=''; req.on('data',ch=>body+=ch); req.on('end',()=>{
      const f=querystring.parse(body);
      if (String(f.u)===ADMIN_USER && String(f.p)===ADMIN_PASS) {
        const next = typeof f.next==='string' ? f.next : '/admin/';
        res.writeHead(302,{ 'Set-Cookie':'gg_admin=ok; Path=/; HttpOnly; SameSite=Lax', Location: next });
        return res.end();
      }
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); return res.end(LOGIN_HTML('Invalid credentials'));
    }); return;
  }

  // Public APIs
  if (req.method==='GET' && pathname==='/api/registration/count') {
    const [total,cfg] = await Promise.all([regsCount(), getConfig()]);
    return sendJSON(res,200,{ total, max:Number(cfg.max||0), isOpen:!!cfg.isOpen });
  }
  if (req.method==='GET' && pathname==='/api/registration/status') {
    const cfg = await getConfig(); return sendJSON(res,200,{ isOpen:!!cfg.isOpen });
  }
  if (req.method==='POST' && pathname==='/api/registration') {
    readBodyJSON(req, async (err, body)=>{
      if (err) return send(res,400,'Bad Request');
      const { firstName,lastName,mobile,whatsapp,email } = body||{};
      if (!firstName||!lastName||!mobile||!whatsapp||!email) return send(res,400,'All fields required');
      if (String(mobile).length!==10 || String(whatsapp).length!==10) return send(res,400,'Numbers must be exactly 10 digits');

      const cfg = await getConfig(); const total = await regsCount();
      const closed = !cfg.isOpen || (Number(cfg.max||0)>0 && total>=Number(cfg.max));
      if (closed) return send(res,403,'Closed');

      // duplicate by mobile
      const existing = colRegs ? await colRegs.findOne({ mobile:String(mobile) }) :
        readJSON(DATA_FILE).find(r=>String(r.mobile)===String(mobile));
      if (existing) return send(res,409,'you are already registered — SOON YOU CAN PREDICT THE FUTURE');

      const row = {
        id: Date.now().toString(36),
        firstName,lastName,mobile:String(mobile),whatsapp:String(whatsapp),email,
        createdAt:new Date().toISOString(),
        userAgent:req.headers['user-agent']||'',
        ip:(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').toString()
      };
      await addReg(row);
      return send(res,201,'OK');
    }); return;
  }

  // Admin APIs (cookie guard)
  if (pathname.startsWith('/api/admin/')) {
    if (!requireAdmin(req,res)) return;
    if (req.method==='GET' && pathname==='/api/admin/registration/list') {
      const list = await listRegs(); return sendJSON(res,200,list);
    }
    if (req.method==='GET' && pathname==='/api/admin/registration/export.csv') {
      const list = await listRegs();
      const header=['id','firstName','lastName','mobile','whatsapp','email','createdAt','userAgent','ip'];
      const rows=[header.join(',')].concat(list.map(r=>header.map(h=>'"'+String(r[h]??'').replaceAll('"','""')+'"').join(',')));
      return send(res,200,rows.join('\n'),{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="registrations.csv"'});
    }
    if (req.method==='POST' && pathname==='/api/admin/registration/config') {
      readBodyJSON(req, async (err, body)=> {
        if (err) return send(res,400,'Bad Request');
        const saved = await saveConfig({ max: body.max, isOpen: body.isOpen });
        return sendJSON(res,200,saved);
      }); return;
    }
  }

  // Guard admin UI/assets
  if (pathname==='/admin/' || pathname.startsWith('/admin-')) { if (!requireAdmin(req,res)) return; }

  // Static files
  if (serveStatic(req,res)) return;

  send(res,404,'Not Found');
});

// Boot
(async () => {
  try {
    await initDB();
    if (!MONGODB_URI) console.log('⚠ Using JSON files (ephemeral on Render). Set MONGODB_URI for persistence.');
    server.listen(PORT, ()=> console.log(`GuruGyan server running http://127.0.0.1:${PORT}`));
  } catch (e) {
    console.error('DB init failed:', e);
    console.log('Falling back to JSON storage.');
    server.listen(PORT, ()=> console.log(`GuruGyan server (fallback) http://127.0.0.1:${PORT}`));
  }
})();
