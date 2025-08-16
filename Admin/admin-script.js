// Admin panel client script (safe config save)
async function load() {
  const c = await (await fetch('/api/registration/count')).json();
  const totalEl = document.getElementById('total');
  const maxEl = document.getElementById('max');
  const statusEl = document.getElementById('status');

  totalEl.textContent = c.total;

  // Show 'Unlimited' when max==0
  maxEl.value = c.max > 0 ? c.max : 0;
  document.getElementById('maxLabel').textContent = c.max > 0 ? c.max : 'Unlimited';

  statusEl.checked = !!c.isOpen;

  // table
  const list = await (await fetch('/api/admin/registration/list')).json();
  const tbody = document.querySelector('#regs tbody');
  tbody.innerHTML = '';
  for (const r of list) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.firstName} ${r.lastName}</td><td>${r.mobile}</td><td>${r.whatsapp}</td><td>${r.email}</td><td>${new Date(r.createdAt).toLocaleString()}</td>`;
    tbody.appendChild(tr);
  }
}

async function saveCfg() {
  const maxRaw = document.getElementById('max').value.trim();
  const isOpen = document.getElementById('status').checked;

  // Preserve previous when empty (do not force 0)
  const payload = {};
  if (maxRaw !== '') payload.max = Number(maxRaw);
  payload.isOpen = isOpen;

  const res = await fetch('/api/admin/registration/config', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  if (!res.ok) { alert('Save failed'); return; }
  await load();
  alert('Saved');
}

function bind() {
  document.getElementById('saveBtn').addEventListener('click', saveCfg);
  document.getElementById('exportBtn').addEventListener('click', ()=> location.href='/api/admin/registration/export.csv');
}
window.addEventListener('DOMContentLoaded', ()=>{ bind(); load(); });
