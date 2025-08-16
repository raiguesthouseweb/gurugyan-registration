async function load() {
  // counts & status
  const c = await (await fetch('/api/registration/count')).json();
  document.getElementById('total').textContent = c.total;
  const status = document.getElementById('status');
  status.checked = !!c.isOpen;
  document.getElementById('statusText').textContent = c.isOpen ? 'OPEN' : 'CLOSED';

  // list
  const listRes = await fetch('/api/admin/registration/list', { credentials: 'include' });
  if (!listRes.ok) {
    document.querySelector('#regs tbody').innerHTML = `<tr><td colspan="5">Auth required. <a href="/admin-login?next=/admin/">Login</a></td></tr>`;
    return;
  }
  const list = await listRes.json();
  const tbody = document.querySelector('#regs tbody');
  tbody.innerHTML = '';
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5">No registrations yet.</td></tr>';
    return;
  }
  for (const r of list) {
    const tr = document.createElement('tr');
    const when = new Date(r.createdAt).toLocaleString();
    tr.innerHTML =
      `<td>${r.firstName} ${r.lastName}</td>` +
      `<td>${r.mobile}</td>` +
      `<td>${r.whatsapp}</td>` +
      `<td>${r.email}</td>` +
      `<td>${when}</td>`;
    tbody.appendChild(tr);
  }
}

async function saveStatus() {
  const isOpen = document.getElementById('status').checked;
  const res = await fetch('/api/admin/registration/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ isOpen })
  });
  if (!res.ok) { alert('Save failed'); return; }
  document.getElementById('statusText').textContent = isOpen ? 'OPEN' : 'CLOSED';
  await load();
  alert('Status saved');
}

function bind() {
  document.getElementById('saveBtn').addEventListener('click', saveStatus);
  document.getElementById('status').addEventListener('change', () => {
    document.getElementById('statusText').textContent = document.getElementById('status').checked ? 'OPEN' : 'CLOSED';
  });
  document.getElementById('exportBtn').addEventListener('click', () => location.href = '/api/admin/registration/export.csv');
}
window.addEventListener('DOMContentLoaded', () => { bind(); load(); });
