// GuruGyan Registration Server — simple JSON storage + form-based admin login
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

// ---- ensure data files
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
if (!fs.existsSync(CFG_FILE))  fs.writeFileSync(CFG_FILE, JSON.stringify({ isOpen: true }, null, 2));

const readJSON  = (f) => JSON.parse(fs.readFileSync(f, 'utf-8'));
const writeJSON = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2));

function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
function sendJSON(res, code, obj) {
  send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}
function parseCookies(req) {
  const raw = req.headers['cookie'] || '';
  return raw.split(';').reduce((a,p)=>{const i=p.indexOf('='); if(i>0)a[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim()); return a;}, {});
}
function isAdmin(req){ return parseCookies(req).gg_admin === 'ok'; }
function requireAdmin(req,res){
  if (isAdmin(req)) return true;
  const next = encodeURIComponent(req.url || '/admin/');
  res.writeHead(302, { Location: `/admin-login?next=${next}` });
  res.end(); return false;
}
function streamFile(res, filePath){
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};
  res.writeHead(200,{'Content-Type':types[path.extname(filePath).toLowerCase()]||'application/octet-stream'});
  fs.createReadStream(filePath).pipe(res);
}
function serveStatic(req,res){
  const map={'/':'index.html','/Free.Registration':'index.html','/admin/':'Admin/index.html'};
  let p = decodeURIComponent(url.parse(req.url).pathname||'/');
  if (p.toLowerCase()==='/free.registration'||p.toLowerCase()==='/free.registration/') p='/Free.Registration';
  if (p.startsWith('/admin-')){ const f=path.join(ROOT,'Admin',p.substring(1)); if(fs.existsSync(f)) return streamFile(res,f),true; return false; }
  let f = map[p]?path.join(ROOT,map[p]):path.join(ROOT,p);
  if (fs.existsSync(f)&&fs.statSync(f).isDirectory()) f=path.join(f,'index.html');
  if (!fs.existsSync(f)) return false;
  streamFile(res,f); return true;
}

// --- login page
const LOGIN_HTML = (msg='') => `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Admin Login</title>
<style>body{margin:0;background:#0b1220;color:#e6eaf2;font-family:Inter,system-ui,Segoe UI,Roboto,Arial,sans-serif;display:grid;place-items:center;height:100vh}
.card{background:#10182b;border:1px solid #22304a;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.4);padding:28px;max-width:360px;width:92%}
label{display:block;font-size:13px;color:#9aa4b2;margin:12px 0 6px}input{width:100%;padding:10px 12px;background:#0e1626;color:#e6eaf2;border:1px solid #2a3b58;border-radius:10px}
.btn{margin-top:16px;width:100%;padding:12px 14px;background:#7c3aed;color:#fff;border:0;border-radius:12px;font-weight:600}.msg{color:#ff8b8b;height:18px;margin-top:8px}</style>
</head><body><div class="card"><h2>Admin Login</h2>
<form method="POST" action="/admin-login"><label>Username</label><input name="u" required /><label>Password</label><input name="p" type="password" required />
<input type="hidden" name="next" id="next"/><div class="msg">${msg}</div><button class="btn" type="submit">Login</button></form>
<div style="margin-top:10px"><a href="/Free.Registration">Back to Registration</a></div></div>
<script>const q=new URLSearchParams(location.search);document.getElementById('next').value=q.get('next')||'/admin/';</script></body></html>`;

// --- server
const server = http.createServer((req,res)=>{
  const { pathname } = url.parse(req.url,true);

  // login
  if (req.method==='GET' && pathname==='/admin-login'){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); return res.end(LOGIN_HTML());
  }
  if (req.method==='POST' && pathname==='/admin-login'){
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{
      const f=querystring.parse(body);
      if (String(f.u)===ADMIN_USER && String(f.p)===ADMIN_PASS){
        const next = typeof f.next==='string'?f.next:'/admin/';
        res.writeHead(302,{ 'Set-Cookie':'gg_admin=ok; Path=/; HttpOnly; SameSite=Lax', Location: next }); return res.end();
      }
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); return res.end(LOGIN_HTML('Invalid credentials'));
    }); return;
  }

  // public APIs (no max now)
  if (req.method==='GET' && pathname==='/api/registration/count'){
    const total = readJSON(DATA_FILE).length;
    const cfg = readJSON(CFG_FILE);
    return sendJSON(res,200,{ total, isOpen: !!cfg.isOpen });
  }
  if (req.method==='GET' && pathname==='/api/registration/status'){
    const cfg = readJSON(CFG_FILE);
    return sendJSON(res,200,{ isOpen: !!cfg.isOpen });
  }
  if (req.method==='POST' && pathname==='/api/registration'){
    let raw=''; req.on('data',c=>raw+=c); req.on('end',()=>{
      try{
        const { firstName,lastName,mobile,whatsapp,email } = JSON.parse(raw||'{}');
        if (!firstName||!lastName||!mobile||!whatsapp||!email) return send(res,400,'All fields required');
        if (String(mobile).length!==10 || String(whatsapp).length!==10) return send(res,400,'Numbers must be exactly 10 digits');

        const cfg=readJSON(CFG_FILE); if (!cfg.isOpen) return send(res,403,'Closed');

        const list=readJSON(DATA_FILE);
        if (list.some(r=>String(r.mobile)===String(mobile))) return send(res,409,'you are already registered — SOON YOU CAN PREDICT THE FUTURE');

        const row={ id:Date.now().toString(36), firstName,lastName,mobile:String(mobile),whatsapp:String(whatsapp),email,
          createdAt:new Date().toISOString(), userAgent:req.headers['user-agent']||'', ip:(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').toString() };
        list.push(row); writeJSON(DATA_FILE,list);
        return send(res,201,'OK');
      }catch{ return send(res,400,'Bad Request'); }
    }); return;
  }

  // admin APIs (cookie guard)
  if (pathname.startsWith('/api/admin/')){
    if (!requireAdmin(req,res)) return;
    if (req.method==='GET' && pathname==='/api/admin/registration/list'){
      const list = readJSON(DATA_FILE).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
      return sendJSON(res,200,list);
    }
    if (req.method==='GET' && pathname==='/api/admin/registration/export.csv'){
      const list=readJSON(DATA_FILE);
      const header=['id','firstName','lastName','mobile','whatsapp','email','createdAt','userAgent','ip'];
      const rows=[header.join(',')].concat(list.map(r=>header.map(h=>'"'+String(r[h]??'').replaceAll('"','""')+'"').join(',')));
      return send(res,200,rows.join('\n'),{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="registrations.csv"'});
    }
    if (req.method==='POST' && pathname==='/api/admin/registration/config'){
      let raw=''; req.on('data',c=>raw+=c); req.on('end',()=>{
        try{
          const body = JSON.parse(raw||'{}');
          const prev = readJSON(CFG_FILE);
          const next = { isOpen: typeof body.isOpen==='boolean' ? body.isOpen : !!prev.isOpen };
          writeJSON(CFG_FILE,next);
          return sendJSON(res,200,next);
        }catch{ return send(res,400,'Bad Request'); }
      }); return;
    }
  }

  // protect admin UI/assets
  if (pathname==='/admin/' || pathname.startsWith('/admin-')){ if(!requireAdmin(req,res))return; }

  // static
  if (serveStatic(req,res)) return;

  send(res,404,'Not Found');
});

server.listen(process.env.PORT || 5510, '0.0.0.0', () => {
  console.log(`GuruGyan server running http://127.0.0.1:${process.env.PORT || 5510}`);
});
