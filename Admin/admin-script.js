// admin-script.js  (FIXED: credentials + robust error logs)
async function j(url, init = {}) {
  const r = await fetch(url, {
    credentials: "include",              // <-- send cookies for admin auth
    headers: { "Accept": "application/json", ...(init.headers || {}) },
    ...init,
  });
  if (r.ok) {
    const type = r.headers.get("content-type") || "";
    return type.includes("application/json") ? r.json() : r.text();
  }
  // If unauthorized, force re-auth (browser will show Basic Auth prompt)
  if (r.status === 401) {
    console.warn("401 from", url, "→ reloading to trigger auth");
    location.reload();
    throw new Error("Unauthorized");
  }
  throw new Error(await r.text());
}

async function load() {
  try {
    // 1) Count (public) – sets Total/Remaining
    const { total, max, isOpen } = await j("/api/registration/count");
    console.log('Registration count data:', { total, max, isOpen });
    document.getElementById("t").textContent = total;
    document.getElementById("r").textContent = max > 0 ? Math.max(0, max - total) : "∞";

    // 2) List (admin) – needs cookie/basic auth
    const list = await j("/api/admin/registration/list");
    const tbody = document.querySelector("#tbl tbody");
    tbody.innerHTML = "";
    list.forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${i + 1}</td>
        <td>${row.firstName}</td>
        <td>${row.lastName}</td>
        <td>${row.mobile}</td>
        <td>${row.whatsapp}</td>
        <td>${row.email}</td>
        <td>${new Date(row.createdAt).toLocaleString()}</td>`;
      tbody.appendChild(tr);
    });

    // Pre-fill config controls
    document.getElementById("max").value = Number(max || 0);
    document.getElementById("status").value = isOpen ? "open" : "closed";
  } catch (e) {
    console.error("Admin load failed:", e);
    alert("Admin load failed: " + e.message);
  }
}

async function saveCfg() {
  try {
    const max = Number(document.getElementById("max").value || 0);
    const isOpen = document.getElementById("status").value === "open";
    console.log('Saving config:', { max, isOpen });
    const result = await j("/api/admin/registration/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ max, isOpen }),
    });
    console.log('Config saved successfully:', result);
    await load();
    alert('Configuration saved successfully!');
  } catch (e) {
    console.error("Save config failed:", e);
    alert("Save config failed: " + e.message);
  }
}

async function exportCsv() {
  try {
    console.log('Starting CSV download...');
    const r = await fetch("/api/admin/registration/export.csv", { credentials: "include" });
    console.log('CSV response status:', r.status);
    if (!r.ok) throw new Error(await r.text());
    const blob = await r.blob();
    console.log('CSV blob size:', blob.size);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "registrations.csv";
    a.click();
    URL.revokeObjectURL(url);
    console.log('CSV download completed successfully');
  } catch (e) {
    console.error("CSV download failed:", e);
    alert("CSV download failed: " + e.message);
  }
}

document.getElementById("saveCfg").addEventListener("click", saveCfg);
document.getElementById("exportCsv").addEventListener("click", exportCsv);
window.addEventListener("DOMContentLoaded", load);
