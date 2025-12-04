// js/app.js
import { b64Encode, b64Decode, rndBytes, deriveKey, encryptJson, decryptJson, randomPassword, uuid, nowIso } from './crypto.js';

const STORAGE_ACCOUNTS_KEY = 'pm:accounts';

const ui = {
  accountsList: document.getElementById('accountsList'),
  mainTitle: document.getElementById('mainTitle'),
  accountSubtitle: document.getElementById('accountSubtitle'),
  entriesContainer: document.getElementById('entriesContainer'),
  btnCreateAccount: document.getElementById('btnCreateAccount'),
  btnAddEntry: document.getElementById('btnAddEntry'),
  btnLogout: document.getElementById('btnLogout'),
  btnImport: document.getElementById('btnImport'),
  btnDocs: document.getElementById('btnDocs'),
  btnClearAll: document.getElementById('btnClearAll'),
  searchInput: document.getElementById('searchInput'),
  modal: document.getElementById('modal'),
  modalContent: document.getElementById('modalContent')
};

let APP = { currentAccount: null, currentKey: null, currentVault: null, sessionTimer: null };

/* ---------- Storage helpers ---------- */
function listAccounts(){
  try{ const raw = localStorage.getItem(STORAGE_ACCOUNTS_KEY); return raw ? JSON.parse(raw) : []; }catch(e){ return []; }
}
function saveAccounts(list){ localStorage.setItem(STORAGE_ACCOUNTS_KEY, JSON.stringify(list)); }
function saveAccountBlob(name, blob){ localStorage.setItem('pm:account:'+name, JSON.stringify(blob)); const a=listAccounts(); if(!a.includes(name)){a.push(name); saveAccounts(a);} }
function getAccountBlob(name){ const raw = localStorage.getItem('pm:account:'+name); return raw ? JSON.parse(raw) : null; }
function deleteAccount(name){ localStorage.removeItem('pm:account:'+name); const accounts = listAccounts().filter(a=>a!==name); saveAccounts(accounts); }

/* ---------- UI ---------- */
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

function flash(msg){
  const el = document.createElement('div');
  el.style.position='fixed'; el.style.right='18px'; el.style.bottom='18px'; el.style.background='rgba(255,255,255,0.04)';
  el.style.padding='10px 14px'; el.style.borderRadius='10px'; el.style.color='#e6eef6'; el.style.boxShadow='0 10px 30px rgba(2,6,20,0.7)';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(()=>document.body.removeChild(el), 2400);
}

/* ---------- Render list ---------- */
function renderAccountsList(){
  const accounts = listAccounts();
  ui.accountsList.innerHTML = '';
  if(accounts.length === 0){
    ui.accountsList.innerHTML = '<div class="empty">No accounts yet. Create one.</div>';
    return;
  }
  accounts.forEach(name=>{
    const blob = getAccountBlob(name);
    const item = document.createElement('div');
    item.className = 'account-item' + (APP.currentAccount===name ? ' active' : '');
    item.innerHTML = `<div>
        <div style="font-weight:600">${escapeHtml(name)}</div>
        <div class="foot">${blob?.createdAt ? 'Created: '+blob.createdAt.split('T')[0] : ''}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="ghost btn-open" data-name="${escapeHtml(name)}">Open</button>
        <button class="ghost btn-del" data-name="${escapeHtml(name)}">Del</button>
      </div>`;
    ui.accountsList.appendChild(item);
  });

  ui.accountsList.querySelectorAll('.btn-open').forEach(btn=> btn.addEventListener('click', ()=> showOpenAccountModal(btn.dataset.name)));
  ui.accountsList.querySelectorAll('.btn-del').forEach(btn=> btn.addEventListener('click', ()=> {
    const nm = btn.dataset.name;
    if(confirm(`Delete account "${nm}" and its data from this browser? This cannot be undone.`)){
      if(APP.currentAccount===nm) logout();
      deleteAccount(nm);
      renderAccountsList();
    }
  }));
}

/* ---------- Vault rendering ---------- */
function renderVault(){
  if(!APP.currentAccount){
    ui.mainTitle.textContent = 'Please select an account';
    ui.accountSubtitle.textContent = 'No account selected';
    ui.entriesContainer.innerHTML = '<div class="empty">No account open. Create or select an account to get started.</div>';
    ui.btnAddEntry.disabled = true;
    ui.btnLogout.disabled = true;
    return;
  }
  ui.mainTitle.textContent = APP.currentAccount;
  ui.accountSubtitle.textContent = 'Vault unlocked — entries stored locally (encrypted)';
  ui.btnAddEntry.disabled = false;
  ui.btnLogout.disabled = false;

  const q = ui.searchInput.value.trim().toLowerCase();
  const entries = (APP.currentVault && APP.currentVault.entries) ? APP.currentVault.entries : [];
  const filtered = entries.filter(e=>{
    if(!q) return true;
    return (e.title||'').toLowerCase().includes(q) || (e.username||'').toLowerCase().includes(q);
  });

  if(filtered.length===0){
    ui.entriesContainer.innerHTML = '<div class="empty">No entries yet for this account.</div>';
    return;
  }
  const grid = document.createElement('div'); grid.className='entries';
  filtered.forEach(entry=>{
    const card = document.createElement('div'); card.className='entry panel';
    const shortUser = entry.username ? escapeHtml(entry.username) : '<span class="foot">no username</span>';
    const created = new Date(entry.createdAt).toLocaleString();
    card.innerHTML = `
      <h4>${escapeHtml(entry.title)}</h4>
      <div class="meta">${shortUser} • <span class="foot">created ${created}</span></div>
      <div style="margin-top:6px">${escapeHtml(entry.notes || '')}</div>
      <div class="actions">
        <button class="small view" data-id="${entry.id}">View</button>
        <button class="small copy" data-id="${entry.id}">Copy</button>
        <button class="small edit" data-id="${entry.id}">Edit</button>
        <button class="small del" data-id="${entry.id}">Delete</button>
      </div>
    `;
    grid.appendChild(card);
  });
  ui.entriesContainer.innerHTML=''; ui.entriesContainer.appendChild(grid);

  grid.querySelectorAll('button').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const id = b.dataset.id; const action = b.classList[1];
      const entry = APP.currentVault.entries.find(x=>x.id===id);
      if(!entry) return alert('Entry not found');
      if(action==='view') showViewEntryModal(entry);
      if(action==='copy') { await copyToClipboard(entry.password || ''); flash('Password copied to clipboard'); setTimeout(()=>clearClipboard(),4200); }
      if(action==='edit') showEditEntryModal(entry);
      if(action==='del'){
        if(confirm('Delete entry "'+entry.title+'"?')){ APP.currentVault.entries = APP.currentVault.entries.filter(x=>x.id!==id); await persistVault(); renderVault(); }
      }
    });
  });
}

/* ---------- Modal helpers ---------- */
function showModal(html){
  ui.modalContent.innerHTML = html;
  ui.modal.style.display = 'flex';
  ui.modal.setAttribute('aria-hidden','false');
  ui.modalContent.focus();
  // close on outside click
  ui.modal.onclick = (ev)=>{ if(ev.target===ui.modal) closeModal(); };
}
function closeModal(){ ui.modal.style.display = 'none'; ui.modalContent.innerHTML = ''; ui.modal.onclick = null; ui.modal.setAttribute('aria-hidden','true'); }

/* ---------- Account flows ---------- */
ui.btnCreateAccount.addEventListener('click', ()=> {
  showModal(`
    <h3>Create new account</h3>
    <label>Account name</label><input id="m_name" type="text" placeholder="e.g. personal, work" />
    <label>Master password</label><input id="m_pw" type="password" placeholder="Strong password" />
    <div class="pw-meter" aria-hidden="true"><i id="pwBar"></i></div>
    <label>Confirm master password</label><input id="m_pw2" type="password" placeholder="Confirm" />
    <div style="display:flex;gap:8px;margin-top:12px">
      <button id="m_create" class="btn">Create</button>
      <button id="m_cancel" class="ghost">Cancel</button>
    </div>
    <div class="foot" style="margin-top:10px">This creates a local encrypted vault in your browser. Keep your master password safe — it cannot be recovered.</div>
  `);

  const m_pw = document.getElementById('m_pw'), m_pw2 = document.getElementById('m_pw2');
  const pwBar = document.getElementById('pwBar');
  function updatePwBar(){
    const val = m_pw.value || '';
    let score = 0;
    if(val.length >= 8) score++;
    if(/[A-Z]/.test(val)) score++;
    if(/[0-9]/.test(val)) score++;
    if(/[^A-Za-z0-9]/.test(val)) score++;
    pwBar.style.width = ((score/4)*100) + '%';
  }
  m_pw.addEventListener('input', updatePwBar);

  document.getElementById('m_cancel').onclick = closeModal;
  document.getElementById('m_create').onclick = async ()=>{
    const name = document.getElementById('m_name').value.trim();
    const pw = m_pw.value;
    const pw2v = m_pw2.value;
    if(!name) return alert('Account name required');
    if(!pw || pw.length<8) return alert('Choose a master password with at least 8 characters');
    if(pw!==pw2v) return alert('Passwords do not match');
    if(listAccounts().includes(name)) { if(!confirm('An account named "'+name+'" exists. Overwrite?')) return; }
    const salt = rndBytes(16);
    const key = await deriveKey(pw, salt);
    const vault = { entries: [] };
    const enc = await encryptJson(key, vault);
    const blob = { salt: b64Encode(salt), vault: enc.cipher, iv: enc.iv, createdAt: nowIso(), updatedAt: nowIso() };
    saveAccountBlob(name, blob);
    closeModal(); renderAccountsList(); flash('Account created');
  };
});

async function showOpenAccountModal(name){
  showModal(`
    <h3>Unlock account: ${escapeHtml(name)}</h3>
    <label>Master password</label><input id="o_pw" type="password" />
    <div style="display:flex;gap:8px;margin-top:12px">
      <button id="o_open" class="btn">Unlock</button>
      <button id="o_cancel" class="ghost">Cancel</button>
    </div>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button id="o_export" class="ghost">Export (encrypted)</button>
      <button id="o_change" class="ghost">Change master password</button>
    </div>
  `);
  document.getElementById('o_cancel').onclick = closeModal;
  document.getElementById('o_export').onclick = ()=> exportAccount(name);
  document.getElementById('o_change').onclick = ()=> showChangeMasterModal(name);

  document.getElementById('o_open').onclick = async ()=>{
    const pw = document.getElementById('o_pw').value;
    const blob = getAccountBlob(name);
    if(!blob) return alert('Account not found');
    try{
      const salt = b64Decode(blob.salt);
      const key = await deriveKey(pw, salt);
      const vault = await decryptJson(key, blob.vault, blob.iv);
      APP.currentAccount = name; APP.currentKey = key; APP.currentVault = vault;
      scheduleAutoLogout();
      closeModal(); renderAccountsList(); renderVault(); flash('Unlocked '+name);
    }catch(e){
      alert('Incorrect password or corrupted vault');
    }
  };
}

async function exportAccount(name){
  const blob = getAccountBlob(name); if(!blob) return alert('Account missing');
  const filename = `localvault-${name}-export-${(new Date()).toISOString().slice(0,19).replace(/:/g,'-')}.json`;
  const data = JSON.stringify({ name, blob }, null, 2);
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([data], {type:'application/json'})); link.download = filename; link.click();
  flash('Exported encrypted vault (file saved)');
}

function showChangeMasterModal(name){
  showModal(`
    <h3>Change master password for ${escapeHtml(name)}</h3>
    <label>Current master password</label><input id="c_old" type="password" />
    <label>New master password</label><input id="c_new" type="password" />
    <label>Confirm new password</label><input id="c_new2" type="password" />
    <div style="display:flex;gap:8px;margin-top:12px">
      <button id="c_do" class="btn">Change</button>
      <button id="c_cancel" class="ghost">Cancel</button>
    </div>
  `);
  document.getElementById('c_cancel').onclick = closeModal;
  document.getElementById('c_do').onclick = async ()=>{
    const oldp = document.getElementById('c_old').value;
    const newp = document.getElementById('c_new').value;
    const newp2 = document.getElementById('c_new2').value;
    if(!newp || newp.length<8) return alert('New password must be at least 8 chars');
    if(newp!==newp2) return alert('New passwords do not match');
    const blob = getAccountBlob(name); if(!blob) return alert('Account missing');
    try{
      const saltOld = b64Decode(blob.salt);
      const keyOld = await deriveKey(oldp, saltOld);
      const vault = await decryptJson(keyOld, blob.vault, blob.iv);
      const saltNew = rndBytes(16);
      const keyNew = await deriveKey(newp, saltNew);
      const enc = await encryptJson(keyNew, vault);
      const newBlob = { salt: b64Encode(saltNew), vault: enc.cipher, iv: enc.iv, createdAt: blob.createdAt, updatedAt: nowIso() };
      saveAccountBlob(name, newBlob);
      closeModal(); flash('Master password updated');
    }catch(e){
      alert('Current master password incorrect or vault corrupted');
    }
  };
}

/* ---------- Entry CRUD ---------- */
ui.btnAddEntry.addEventListener('click', ()=> showAddEntryModal());

function showAddEntryModal(){
  showModal(`
    <h3>New entry in ${escapeHtml(APP.currentAccount)}</h3>
    <label>Title</label><input id="e_title" type="text" placeholder="e.g. Gmail" />
    <label>Username / email</label><input id="e_user" type="text" />
    <label>Password</label>
    <div class="row">
      <input id="e_pass" type="text" />
      <button id="e_gen" class="ghost">Generate</button>
    </div>
    <label>Notes</label><textarea id="e_notes" rows="3"></textarea>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button id="e_save" class="btn">Save</button>
      <button id="e_cancel" class="ghost">Cancel</button>
    </div>
  `);
  document.getElementById('e_cancel').onclick = closeModal;
  document.getElementById('e_gen').onclick = ()=> { document.getElementById('e_pass').value = randomPassword(16); };
  document.getElementById('e_save').onclick = async ()=>{
    const title = document.getElementById('e_title').value.trim();
    const username = document.getElementById('e_user').value.trim();
    const password = document.getElementById('e_pass').value;
    const notes = document.getElementById('e_notes').value.trim();
    if(!title) return alert('Title required');
    const entry = { id: uuid(), title, username, password, notes, createdAt: nowIso(), updatedAt: nowIso() };
    APP.currentVault.entries.push(entry);
    await persistVault();
    closeModal(); renderVault();
  };
}

function showEditEntryModal(entry){
  showModal(`
    <h3>Edit entry</h3>
    <label>Title</label><input id="e_title" type="text" value="${escapeHtml(entry.title)}" />
    <label>Username</label><input id="e_user" type="text" value="${escapeHtml(entry.username)}" />
    <label>Password</label>
    <div class="row">
      <input id="e_pass" type="text" value="${escapeHtml(entry.password)}" />
      <button id="e_gen" class="ghost">Generate</button>
    </div>
    <label>Notes</label><textarea id="e_notes" rows="3">${escapeHtml(entry.notes)}</textarea>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button id="e_save" class="btn">Save</button>
      <button id="e_cancel" class="ghost">Cancel</button>
    </div>
  `);
  document.getElementById('e_cancel').onclick = closeModal;
  document.getElementById('e_gen').onclick = ()=> { document.getElementById('e_pass').value = randomPassword(16); };
  document.getElementById('e_save').onclick = async ()=>{
    entry.title = document.getElementById('e_title').value.trim();
    entry.username = document.getElementById('e_user').value.trim();
    entry.password = document.getElementById('e_pass').value;
    entry.notes = document.getElementById('e_notes').value.trim();
    entry.updatedAt = nowIso();
    await persistVault();
    closeModal(); renderVault();
  };
}

function showViewEntryModal(entry){
  showModal(`
    <h3>${escapeHtml(entry.title)}</h3>
    <div><strong>Username:</strong> ${escapeHtml(entry.username||'')}</div>
    <div style="margin-top:8px"><strong>Password:</strong>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
        <input id="view_pass" type="password" value="${escapeHtml(entry.password||'')}" style="font-family:monospace;flex:1" readonly />
        <button id="v_toggle" class="ghost">Show</button>
      </div>
    </div>
    <div style="margin-top:8px"><strong>Notes:</strong><div style="margin-top:6px">${escapeHtml(entry.notes||'')}</div></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button id="v_copy" class="btn">Copy password</button>
      <button id="v_close" class="ghost">Close</button>
    </div>
  `);
  const input = document.getElementById('view_pass');
  document.getElementById('v_close').onclick = closeModal;
  document.getElementById('v_toggle').onclick = ()=>{
    if(input.type==='password'){ input.type='text'; document.getElementById('v_toggle').textContent='Hide'; setTimeout(()=>{ input.type='password'; document.getElementById('v_toggle').textContent='Show'; }, 8000); }
    else { input.type='password'; document.getElementById('v_toggle').textContent='Show'; }
  };
  document.getElementById('v_copy').onclick = async ()=>{ await copyToClipboard(entry.password || ''); flash('Password copied'); setTimeout(()=>clearClipboard(),4200); };
}

/* ---------- Persist vault ---------- */
async function persistVault(){
  if(!APP.currentAccount || !APP.currentKey || !APP.currentVault) throw new Error('not ready');
  const enc = await encryptJson(APP.currentKey, APP.currentVault);
  const blob = getAccountBlob(APP.currentAccount);
  const newBlob = { salt: blob.salt, vault: enc.cipher, iv: enc.iv, createdAt: blob.createdAt, updatedAt: nowIso() };
  saveAccountBlob(APP.currentAccount, newBlob);
}

/* ---------- Logout & session ---------- */
function logout(){
  APP.currentAccount = null; APP.currentKey = null; APP.currentVault = null;
  if(APP.sessionTimer) clearTimeout(APP.sessionTimer);
  APP.sessionTimer = null;
  renderAccountsList(); renderVault(); flash('Logged out');
}
ui.btnLogout.addEventListener('click', ()=> logout());

function scheduleAutoLogout(timeoutMs = 1000 * 60 * 10){
  if(APP.sessionTimer) clearTimeout(APP.sessionTimer);
  APP.sessionTimer = setTimeout(()=>{ logout(); alert('Session timed out (auto-logout)'); }, timeoutMs);
  // refresh timer on user activity
  ['click','keydown','mousemove','touchstart'].forEach(ev => window.addEventListener(ev, resetTimer));
  function resetTimer(){ if(APP.sessionTimer) clearTimeout(APP.sessionTimer); APP.sessionTimer = setTimeout(()=>{ logout(); alert('Session timed out (auto-logout)'); }, timeoutMs); }
}

/* ---------- Search ---------- */
ui.searchInput.addEventListener('input', ()=> renderVault());

/* ---------- Import ---------- */
ui.btnImport.addEventListener('click', ()=>{
  showModal(`
    <h3>Import account (encrypted)</h3>
    <label>Select JSON file</label>
    <input id="import_file" type="file" accept="application/json" />
    <div style="display:flex;gap:8px;margin-top:12px">
      <button id="import_do" class="btn">Import</button>
      <button id="import_cancel" class="ghost">Cancel</button>
    </div>
  `);
  document.getElementById('import_cancel').onclick = closeModal;
  document.getElementById('import_do').onclick = async ()=>{
    const f = document.getElementById('import_file').files[0]; if(!f) return alert('Choose a file');
    try{
      const txt = await f.text(); const obj = JSON.parse(txt);
      if(!obj.name || !obj.blob) return alert('Invalid file');
      if(listAccounts().includes(obj.name)){ if(!confirm('Account "'+obj.name+'" exists. Overwrite?')) return; }
      saveAccountBlob(obj.name, obj.blob); closeModal(); renderAccountsList(); flash('Imported account '+obj.name);
    }catch(e){ alert('Import failed: '+e.message); }
  };
});

/* ---------- Docs / Clear ---------- */
ui.btnDocs.addEventListener('click', ()=>{
  showModal(`
    <h3>About & Security</h3>
    <p>This is a local, client-side password vault demo. Vaults are encrypted with AES-GCM using a key derived from your master password via PBKDF2 (250k iterations). Data is stored in your browser's <code>localStorage</code>.</p>
    <ul>
      <li><strong>Pros:</strong> Works offline; keys derived locally; no server required.</li>
      <li><strong>Cons:</strong> <em>localStorage</em> is accessible to any script on the same origin (including third-party scripts). Do not store extremely sensitive passwords here if you cannot guarantee the environment.</li>
    </ul>
    <div class="foot">Recommendations: use a strong unique master password, back up encrypted exports to secure storage, and prefer audited password managers for sensitive purposes.</div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button id="doc_close" class="btn">Close</button>
    </div>
  `);
  document.getElementById('doc_close').onclick = closeModal;
});

ui.btnClearAll.addEventListener('click', ()=>{
  if(confirm('Clear ALL LocalVault data from this browser? This will delete all accounts stored here.')){
    Object.keys(localStorage).filter(k=>k.startsWith('pm:')).forEach(k=>localStorage.removeItem(k));
    logout();
    renderAccountsList(); renderVault(); flash('All data cleared');
  }
});

/* ---------- Clipboard helpers ---------- */
async function copyToClipboard(text){
  try{ await navigator.clipboard.writeText(text); }catch(e){
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  }
}
async function clearClipboard(){
  try{ await navigator.clipboard.writeText(''); }catch(e){ /* ignore for browsers without permission */ }
}

/* ---------- Utilities ---------- */
function nowIso(){ return new Date().toISOString(); }

/* ---------- Initialization ---------- */
renderAccountsList();
renderVault();
