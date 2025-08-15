const $ = (s)=>document.querySelector(s);
const toast = (msg)=>{ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2600); };

async function refreshCount(){
  try{
    const r = await fetch('/api/registration/count');
    const { total, max, isOpen } = await r.json();
    $('#totalCount').textContent = total;
    const b = $('#stateBanner');
    b.classList.remove('hidden','open','closed');
    if(isOpen && (max===0 || total < max)){
      b.textContent = 'Now Accepting Early Registrations';
      b.classList.add('open');
    } else {
      b.textContent = 'Registrations Closed — Next Drop Coming Soon';
      b.classList.add('closed');
    }
  }catch(e){ /* ignore */ }
}

async function submitForm(){
  const data = {
    firstName: $('#firstName').value.trim(),
    lastName:  $('#lastName').value.trim(),
    mobile:    $('#mobile').value.trim(),
    whatsapp:  $('#whatsapp').value.trim(),
    email:     $('#email').value.trim()
  };

  if(!data.firstName || !data.lastName || !data.mobile || !data.whatsapp || !data.email){
    toast('All fields are required');
    return;
  }
  if(data.mobile.length!==10 || data.whatsapp.length!==10){
    toast('Enter 10-digit numbers');
    return;
  }

  const btn = $('#submitBtn');
  btn.disabled = true; btn.textContent = 'Submitting…';
  try{
    const r = await fetch('/api/registration',{
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data)
    });
    if(r.status===201){ toast("You’re on the list! We’ll notify you before launch."); await refreshCount(); }
    else if(r.status===409){ toast('you are already registered — SOON YOU CAN PREDICT THE FUTURE'); }
    else if(r.status===403){ toast('Registrations are closed right now'); }
    else { const t = await r.text(); toast(t || 'Something went wrong'); }
  }catch(e){ toast('Network error'); }
  finally{ btn.disabled = false; btn.textContent = 'Submit Registration'; }
}

$('#submitBtn').addEventListener('click', submitForm);

// Read More functionality
function toggleReadMore() {
  const expandedContent = $('#expandedContent');
  const readMoreBtn = $('#readMoreBtn');
  
  if (expandedContent.classList.contains('hidden')) {
    expandedContent.classList.remove('hidden');
    readMoreBtn.textContent = 'Read Less';
  } else {
    expandedContent.classList.add('hidden');
    readMoreBtn.textContent = 'Read More';
  }
}

$('#readMoreBtn').addEventListener('click', toggleReadMore);
window.addEventListener('DOMContentLoaded', refreshCount); // on page load only (NO websockets/no interval)