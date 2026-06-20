const SUPABASE_URL = 'https://bublcszbqqedcqhbwoak.supabase.co/rest/v1';
const SUPABASE_KEY = 'sb_publishable_Oz_37d1nsj7AeesI9IPC4w_jpGC12QU';

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

// --- Icônes SVG ---
const _S = 'class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ICO_WARN = `<svg ${_S}><path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.4" r="0.6" fill="currentColor" stroke="none"/></svg>`;
const ICO_SCISSORS = `<svg ${_S}><circle cx="6" cy="6" r="2.2"/><circle cx="6" cy="18" r="2.2"/><path d="M8 7.2 20 17M8 16.8 20 7"/></svg>`;
const ICO_SUN = `<svg ${_S}><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5 5l1.6 1.6M17.4 17.4 19 19M19 5l-1.6 1.6M6.6 17.4 5 19"/></svg>`;
const ICO_MOON = `<svg ${_S}><path d="M20 13.5A7.5 7.5 0 1 1 10.5 4 6 6 0 0 0 20 13.5Z"/></svg>`;

let currentUser = null;
let enPoste = false;
let posteId = null;
let refreshInterval = null;

// --- API helpers ---
async function supaGet(table, query = '') {
  const res = await fetch(`${SUPABASE_URL}/${table}?${query}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function supaPost(table, data) {
  const res = await fetch(`${SUPABASE_URL}/${table}`, {
    method: 'POST', headers, body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function supaPatch(table, query, data) {
  const res = await fetch(`${SUPABASE_URL}/${table}?${query}`, {
    method: 'PATCH', headers, body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// --- Simple hash for sceau ---
async function hashSceau(sceau) {
  const data = new TextEncoder().encode(sceau);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- Time logic ---
function isServerOpen() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const totalMin = h * 60 + m;
  // 18h30 (1110) to 3h00 (180) — crosses midnight
  return totalMin >= 1110 || totalMin < 180;
}

function updateClock() {
  const now = new Date();
  const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  document.getElementById('clock').textContent = time;

  const open = isServerOpen();
  const statusCard = document.getElementById('server-status');
  const indicator = statusCard.querySelector('.status-indicator');
  const text = statusCard.querySelector('span:last-child');

  if (open) {
    indicator.className = 'status-indicator online';
    text.textContent = "L'hôpital est ouvert — Service actif";
  } else {
    indicator.className = 'status-indicator offline';
    text.textContent = 'Le village est endormi — Hors horaires de service';
  }

  const btnPoste = document.getElementById('btn-poste');
  const btnUrgence = document.getElementById('btn-urgence');
  const btnChirurgien = document.getElementById('btn-chirurgien');

  if (open && currentUser) {
    btnPoste.disabled = false;
    btnUrgence.disabled = !enPoste;
    btnChirurgien.disabled = !enPoste;
  } else {
    if (!enPoste) btnPoste.disabled = true;
    btnUrgence.disabled = true;
    btnChirurgien.disabled = true;

    // Auto end shift if server closes
    if (enPoste && !open) {
      quitterPoste();
    }
  }
}

// --- Auth ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    document.getElementById('login-form').classList.toggle('hidden', target !== 'login');
    document.getElementById('register-form').classList.toggle('hidden', target !== 'register');
  });
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nom = document.getElementById('reg-nom').value.trim();
  const prenom = document.getElementById('reg-prenom').value.trim();
  const sceau = document.getElementById('reg-sceau').value;
  const sceau2 = document.getElementById('reg-sceau2').value;
  const errEl = document.getElementById('reg-error');
  const sucEl = document.getElementById('reg-success');
  errEl.textContent = '';
  sucEl.textContent = '';

  if (sceau !== sceau2) { errEl.textContent = 'Les sceaux ne correspondent pas.'; return; }
  if (sceau.length < 4) { errEl.textContent = 'Le sceau doit contenir au moins 4 caractères.'; return; }

  try {
    const existing = await supaGet('shinobis', `nom=eq.${encodeURIComponent(nom)}&prenom=eq.${encodeURIComponent(prenom)}`);
    if (existing.length > 0) { errEl.textContent = 'Ce shinobi est déjà enregistré.'; return; }

    const hashed = await hashSceau(sceau);
    await supaPost('shinobis', { nom, prenom, sceau: hashed });
    sucEl.textContent = 'Enregistrement réussi ! Vous pouvez maintenant vous identifier.';
    document.getElementById('register-form').reset();
  } catch (err) {
    errEl.textContent = 'Erreur de connexion au registre. Vérifiez la configuration Supabase.';
    console.error(err);
  }
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nom = document.getElementById('login-nom').value.trim();
  const prenom = document.getElementById('login-prenom').value.trim();
  const sceau = document.getElementById('login-sceau').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';

  try {
    const hashed = await hashSceau(sceau);
    const users = await supaGet('shinobis', `nom=eq.${encodeURIComponent(nom)}&prenom=eq.${encodeURIComponent(prenom)}&sceau=eq.${hashed}`);
    if (users.length === 0) { errEl.textContent = 'Identité ou sceau incorrect.'; return; }

    currentUser = users[0];
    localStorage.setItem('hopital_session', JSON.stringify(currentUser));
    showDashboard();
  } catch (err) {
    errEl.textContent = 'Erreur de connexion au registre.';
    console.error(err);
  }
});

function showDashboard() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('dashboard-screen').classList.remove('hidden');
  document.getElementById('user-name').textContent = `${currentUser.prenom} ${currentUser.nom}`;
  checkExistingPoste();
  loadData();
  showGroup('poste');
  refreshInterval = setInterval(loadData, 10000);
}

// --- Navigation sidebar (groupes) ---
function showGroup(name) {
  document.querySelectorAll('.group-panel').forEach(p => p.classList.toggle('active', p.dataset.group === name));
  document.querySelectorAll('.snav').forEach(b => b.classList.toggle('active', b.dataset.group === name));
}
document.querySelectorAll('.snav').forEach(b => {
  b.addEventListener('click', () => showGroup(b.dataset.group));
});

document.getElementById('logout-btn').addEventListener('click', () => {
  if (enPoste) quitterPoste();
  currentUser = null;
  enPoste = false;
  localStorage.removeItem('hopital_session');
  clearInterval(refreshInterval);
  document.getElementById('dashboard-screen').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('login-form').reset();
});

// --- Poste ---
async function checkExistingPoste() {
  try {
    const postes = await supaGet('postes', `shinobi_id=eq.${currentUser.id}&actif=eq.true`);
    if (postes.length > 0) {
      enPoste = true;
      posteId = postes[0].id;
      updatePosteUI();
    }
  } catch (e) { console.error(e); }
}

function updatePosteUI() {
  const btn = document.getElementById('btn-poste');
  const badge = document.getElementById('poste-status');
  if (enPoste) {
    btn.textContent = 'Quitter son poste';
    btn.classList.add('en-poste');
    badge.textContent = 'En service';
    badge.classList.add('actif');
  } else {
    btn.textContent = 'Prendre son poste';
    btn.classList.remove('en-poste');
    badge.textContent = 'Hors service';
    badge.classList.remove('actif');
  }
}

document.getElementById('btn-poste').addEventListener('click', async () => {
  if (enPoste) {
    await quitterPoste();
  } else {
    await prendrePoste();
  }
});

async function prendrePoste() {
  if (!isServerOpen()) return;
  try {
    const result = await supaPost('postes', {
      shinobi_id: currentUser.id,
      debut: new Date().toISOString(),
      actif: true
    });
    posteId = result[0].id;
    enPoste = true;
    updatePosteUI();
    loadData();
  } catch (e) { console.error(e); }
}

async function quitterPoste() {
  if (!posteId) return;
  try {
    await supaPatch('postes', `id=eq.${posteId}`, { actif: false, fin: new Date().toISOString() });
    enPoste = false;
    posteId = null;
    updatePosteUI();
    loadData();
  } catch (e) { console.error(e); }
}

// --- Sons d'alerte ---
const sonUrgence = new Audio('merle-sonnerie.mp3');
const sonChirurgien = new Audio('pluvier-dore-sonnerie.mp3');
let alertesConnues = new Set();

// --- Data refresh ---
async function loadData() {
  updateClock();
  try {
    // Charger tous les shinobis une seule fois pour les jointures
    const allShinobis = await supaGet('shinobis', 'select=id,prenom,nom');
    const shinobiMap = {};
    allShinobis.forEach(s => { shinobiMap[s.id] = s; });

    // Load active personnel
    const postes = await supaGet('postes', 'actif=eq.true&select=id,debut,shinobi_id');
    const list = document.getElementById('personnel-list');
    list.innerHTML = '';
    if (postes.length === 0) {
      list.innerHTML = '<li style="opacity:.5;list-style:none">Aucun personnel en poste</li>';
    } else {
      postes.forEach(p => {
        const s = shinobiMap[p.shinobi_id];
        if (!s) return;
        const li = document.createElement('li');
        const heure = new Date(p.debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        li.textContent = `${s.prenom} ${s.nom} — en poste depuis ${heure}`;
        list.appendChild(li);
      });
    }

    // Load active alerts
    const alertes = await supaGet('alertes', 'actif=eq.true&select=id,type,message,created_at,shinobi_id&order=created_at.desc');
    const alertesList = document.getElementById('alertes-list');
    const alertesContainer = document.getElementById('alertes-actives');
    alertesList.innerHTML = '';

    // Jouer un son pour les nouvelles alertes
    alertes.forEach(a => {
      if (!alertesConnues.has(a.id)) {
        alertesConnues.add(a.id);
        if (a.type === 'urgence') {
          sonUrgence.currentTime = 0;
          sonUrgence.play().catch(() => {});
        } else {
          sonChirurgien.currentTime = 0;
          sonChirurgien.play().catch(() => {});
        }
      }
    });

    if (alertes.length > 0) {
      alertesContainer.classList.remove('hidden');
      alertes.forEach(a => {
        const s = shinobiMap[a.shinobi_id];
        if (!s) return;
        const li = document.createElement('li');
        li.className = a.type === 'urgence' ? 'urgence-item' : 'chirurgien-item';
        const time = new Date(a.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        li.innerHTML = `
          <div class="alerte-info">
            <div class="alerte-auteur">${a.type === 'urgence' ? ICO_WARN + ' Urgence' : ICO_SCISSORS + ' Chirurgien'} — ${s.prenom} ${s.nom}</div>
            ${a.message ? `<div class="alerte-msg">${escapeHtml(a.message)}</div>` : ''}
          </div>
          <span class="alerte-time">${time}</span>
          ${(currentUser && s.id === currentUser.id) ? `<button class="btn-resolve" onclick="resolveAlerte('${a.id}')">Résoudre</button>` : ''}
        `;
        alertesList.appendChild(li);
      });
    } else {
      alertesContainer.classList.add('hidden');
    }

    // Load cours
    const cours = await supaGet('cours', 'select=id,titre,description,created_at,shinobi_id&order=created_at.desc&limit=40');
    const coursList = document.getElementById('cours-list');
    coursList.innerHTML = '';
    if (cours.length === 0) {
      coursList.innerHTML = '<li style="opacity:.5;list-style:none">Aucun cours pour le moment</li>';
    } else {
      cours.forEach(c => {
        const s = shinobiMap[c.shinobi_id];
        const nom = s ? `${s.prenom} ${s.nom}` : 'Inconnu';
        const date = new Date(c.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        const li = document.createElement('li');
        li.innerHTML = `
          <div class="cours-item">
            <div class="cours-titre">${escapeHtml(c.titre)}${c.description ? ` <span class="cours-desc-text">— ${escapeHtml(c.description)}</span>` : ''}</div>
            <div class="cours-meta">${escapeHtml(nom)} · ${date}</div>
          </div>`;
        coursList.appendChild(li);
      });
    }
  } catch (e) { console.error('Erreur chargement données:', e); }
}

// --- Cours ---
document.getElementById('cours-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUser) return;
  const titre = document.getElementById('cours-titre').value.trim();
  const desc = document.getElementById('cours-desc').value.trim();
  if (!titre) return;
  try {
    await supaPost('cours', { shinobi_id: currentUser.id, titre, description: desc || null });
    document.getElementById('cours-titre').value = '';
    document.getElementById('cours-desc').value = '';
    loadData();
  } catch (err) { console.error(err); alert('Erreur lors de l\'ajout du cours.'); }
});

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// --- Alertes ---
let pendingAlertType = null;

document.getElementById('btn-urgence').addEventListener('click', () => openAlertModal('urgence'));
document.getElementById('btn-chirurgien').addEventListener('click', () => openAlertModal('chirurgien'));

function openAlertModal(type) {
  pendingAlertType = type;
  document.getElementById('modal-title').innerHTML =
    type === 'urgence' ? ICO_WARN + ' Appel d\'Urgence — Renforts Médicaux' : ICO_SCISSORS + ' Demande de Chirurgien';
  document.getElementById('modal-message').value = '';
  document.getElementById('modal-overlay').classList.remove('hidden');
}

document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('modal-overlay').classList.add('hidden');
  pendingAlertType = null;
});

document.getElementById('modal-confirm').addEventListener('click', async () => {
  if (!pendingAlertType || !currentUser) return;
  const message = document.getElementById('modal-message').value.trim();
  try {
    await supaPost('alertes', {
      type: pendingAlertType,
      shinobi_id: currentUser.id,
      message: message || null,
      actif: true
    });
    document.getElementById('modal-overlay').classList.add('hidden');
    pendingAlertType = null;
    loadData();
  } catch (e) {
    console.error(e);
    alert('Erreur lors de l\'envoi de l\'alerte.');
  }
});

window.resolveAlerte = async function(id) {
  try {
    await supaPatch('alertes', `id=eq.${id}`, { actif: false });
    loadData();
  } catch (e) { console.error(e); }
};

// --- Auto-login from session ---
(async function autoLogin() {
  const saved = localStorage.getItem('hopital_session');
  if (!saved) return;
  try {
    const session = JSON.parse(saved);
    const users = await supaGet('shinobis', `id=eq.${session.id}`);
    if (users.length > 0) {
      currentUser = users[0];
      localStorage.setItem('hopital_session', JSON.stringify(currentUser));
      showDashboard();
    } else {
      localStorage.removeItem('hopital_session');
    }
  } catch (e) {
    console.error(e);
    localStorage.removeItem('hopital_session');
  }
})();

// --- Fermeture automatique de tous les postes à 3h00 ---
let lastCheckHour = new Date().getHours();

async function checkAutoClosePostes() {
  const now = new Date();
  const h = now.getHours();

  // Détecter le passage à 3h
  if (h === 3 && lastCheckHour !== 3) {
    try {
      const postesActifs = await supaGet('postes', 'actif=eq.true&select=id');
      for (const p of postesActifs) {
        await supaPatch('postes', `id=eq.${p.id}`, { actif: false, fin: now.toISOString() });
      }
      if (enPoste) {
        enPoste = false;
        posteId = null;
        updatePosteUI();
      }
      loadData();
    } catch (e) { console.error('Erreur fermeture auto:', e); }
  }
  lastCheckHour = h;
}

setInterval(checkAutoClosePostes, 30000);

// --- Init clock ---
setInterval(updateClock, 1000);
updateClock();

// --- Thème clair / sombre ---
if (localStorage.getItem('hopital_theme') === 'dark') document.body.classList.add('dark');
(function () {
  const tbtn = document.getElementById('theme-toggle');
  if (!tbtn) return;
  const sync = () => { tbtn.innerHTML = document.body.classList.contains('dark') ? ICO_SUN : ICO_MOON; };
  sync();
  tbtn.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('hopital_theme', document.body.classList.contains('dark') ? 'dark' : 'light');
    sync();
  });
})();
