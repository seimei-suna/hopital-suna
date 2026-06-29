const SUPABASE_URL = 'https://bublcszbqqedcqhbwoak.supabase.co/rest/v1';
const SUPABASE_KEY = 'sb_publishable_Oz_37d1nsj7AeesI9IPC4w_jpGC12QU';

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

const _S = 'class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ICO_SUN = `<svg ${_S}><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5 5l1.6 1.6M17.4 17.4 19 19M19 5l-1.6 1.6M6.6 17.4 5 19"/></svg>`;
const ICO_MOON = `<svg ${_S}><path d="M20 13.5A7.5 7.5 0 1 1 10.5 4 6 6 0 0 0 20 13.5Z"/></svg>`;

let currentUser = null;
let tauxParGrade = { stagiaire: 0, aspirant: 0, adepte: 0, expert: 0 };
let allShinobis = [];
let shinobiMap = {};
let chatInterval = null;

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

async function supaUpsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/${table}`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function supaDelete(table, query) {
  const res = await fetch(`${SUPABASE_URL}/${table}?${query}`, { method: 'DELETE', headers });
  if (!res.ok) throw new Error(await res.text());
}

async function hashSceau(sceau) {
  const data = new TextEncoder().encode(sceau);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- Charger tous les shinobis (utilisé partout pour les jointures) ---
async function refreshShinobis() {
  allShinobis = await supaGet('shinobis', 'select=id,prenom,nom,role,grade&order=nom.asc,prenom.asc');
  shinobiMap = {};
  allShinobis.forEach(s => { shinobiMap[s.id] = s; });
}

// --- Auth ---
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

    const user = users[0];
    if (user.role !== 'gerant' && user.role !== 'co_gerant') {
      errEl.textContent = 'Accès refusé. Seuls les gérants et co-gérants peuvent accéder à cette page.';
      return;
    }

    currentUser = user;
    localStorage.setItem('hopital_admin_session', JSON.stringify(currentUser));
    showAdmin();
  } catch (err) {
    errEl.textContent = 'Erreur de connexion au registre.';
    console.error(err);
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  currentUser = null;
  localStorage.removeItem('hopital_admin_session');
  if (chatInterval) { clearInterval(chatInterval); chatInterval = null; }
  document.getElementById('admin-screen').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('login-form').reset();
});

async function showAdmin() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('admin-screen').classList.remove('hidden');
  document.getElementById('user-name').textContent = `${currentUser.prenom} ${currentUser.nom}`;

  const badge = document.getElementById('user-role-badge');
  badge.textContent = currentUser.role === 'gerant' ? 'Gérant' : 'Co-Gérant';
  badge.className = `role-badge ${currentUser.role}`;

  await loadTauxHoraire();
  await refreshShinobis();
  populateShinobiSelects();
  await loadAll();

  showGroup('presence');

  // Rafraîchissement du chat toutes les 5 s
  if (chatInterval) clearInterval(chatInterval);
  chatInterval = setInterval(loadChat, 5000);
}

// =====================
// NAVIGATION SIDEBAR (groupes)
// =====================
function showGroup(name) {
  document.querySelectorAll('.group-panel').forEach(p => p.classList.toggle('active', p.dataset.group === name));
  document.querySelectorAll('.snav').forEach(b => b.classList.toggle('active', b.dataset.group === name));
}
document.querySelectorAll('.snav').forEach(b => {
  b.addEventListener('click', () => showGroup(b.dataset.group));
});

// --- Populate selects ---
function populateShinobiSelects() {
  // Filtre principal
  const filterSelect = document.getElementById('filter-shinobi');
  filterSelect.innerHTML = '<option value="all">Tous</option>';
  allShinobis.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.prenom} ${s.nom}`;
    filterSelect.appendChild(opt);
  });

  // Select avertissements
  const avertSelect = document.getElementById('avert-shinobi');
  avertSelect.innerHTML = '';
  allShinobis.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.prenom} ${s.nom}`;
    avertSelect.appendChild(opt);
  });
}

function getDateRange(selectId) {
  const period = document.getElementById(selectId).value;
  const now = new Date();
  let from = null, to = null;

  if (period === 'today') {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === 'week') {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
  } else if (period.startsWith('week-')) {
    const weeksAgo = parseInt(period.split('-')[1]);
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
    from = new Date(thisMonday.getTime() - weeksAgo * 7 * 86400000);
    to = new Date(from.getTime() + 7 * 86400000);
  } else if (period === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return { from: from ? from.toISOString() : null, to: to ? to.toISOString() : null };
}

document.getElementById('btn-refresh').addEventListener('click', loadAll);
document.getElementById('filter-period').addEventListener('change', loadAll);
document.getElementById('filter-shinobi').addEventListener('change', loadAll);
document.getElementById('paye-period').addEventListener('change', loadPaye);

// --- Load all ---
async function loadAll() {
  await refreshShinobis();
  await Promise.all([loadStats(), loadRecap(), loadDetail(), loadGrades(), loadRoles(), loadPostesAdmin(), loadPaye(), loadAvertissements(), loadChat(), loadCoursAdmin()]);
}

// --- Stats ---
async function loadStats() {
  try {
    const postes = await supaGet('postes', 'actif=eq.true&select=id');
    const alertes = await supaGet('alertes', 'actif=eq.true&select=id');
    document.getElementById('stat-inscrits').textContent = allShinobis.length;
    document.getElementById('stat-en-poste').textContent = postes.length;
    document.getElementById('stat-alertes').textContent = alertes.length;
  } catch (e) { console.error(e); }
}

// --- Récapitulatif des heures ---
async function loadRecap() {
  try {
    let query = 'select=id,debut,fin,actif,shinobi_id';
    const range = getDateRange('filter-period');
    if (range.from) query += `&debut=gte.${range.from}`;
    if (range.to) query += `&debut=lt.${range.to}`;

    const shinobiFilter = document.getElementById('filter-shinobi').value;
    if (shinobiFilter !== 'all') query += `&shinobi_id=eq.${shinobiFilter}`;

    query += '&order=debut.desc';
    const postes = await supaGet('postes', query);

    const map = {};
    postes.forEach(p => {
      const s = shinobiMap[p.shinobi_id];
      if (!s) return;
      if (!map[s.id]) {
        map[s.id] = { prenom: s.prenom, nom: s.nom, role: s.role || 'membre', postes: [] };
      }
      map[s.id].postes.push(p);
    });

    const tbody = document.getElementById('recap-body');
    tbody.innerHTML = '';

    const entries = Object.values(map);
    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Aucune donnée pour cette période</td></tr>';
      return;
    }

    entries.sort((a, b) => totalMinutes(b.postes) - totalMinutes(a.postes));

    entries.forEach(e => {
      const nbPostes = e.postes.length;
      const totalMin = totalMinutes(e.postes);
      const avgMin = nbPostes > 0 ? Math.round(totalMin / nbPostes) : 0;
      const lastPoste = e.postes[0];
      const lastDate = new Date(lastPoste.debut).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      const roleLabel = e.role === 'gerant' ? 'Gérant' : e.role === 'co_gerant' ? 'Co-Gérant' : 'Membre';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${esc(e.prenom)} ${esc(e.nom)}</strong></td>
        <td>${roleLabel}</td>
        <td>${nbPostes}</td>
        <td>${formatDuration(totalMin)}</td>
        <td>${formatDuration(avgMin)}</td>
        <td>${lastDate}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) { console.error(e); }
}

// --- Détail des postes ---
async function loadDetail() {
  try {
    let query = 'select=id,debut,fin,actif,shinobi_id';
    const range = getDateRange('filter-period');
    if (range.from) query += `&debut=gte.${range.from}`;
    if (range.to) query += `&debut=lt.${range.to}`;

    const shinobiFilter = document.getElementById('filter-shinobi').value;
    if (shinobiFilter !== 'all') query += `&shinobi_id=eq.${shinobiFilter}`;

    query += '&order=debut.desc&limit=100';
    const postes = await supaGet('postes', query);

    const tbody = document.getElementById('detail-body');
    tbody.innerHTML = '';

    if (postes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Aucun poste enregistré</td></tr>';
      return;
    }

    postes.forEach(p => {
      const s = shinobiMap[p.shinobi_id];
      if (!s) return;
      const debut = new Date(p.debut);
      const fin = p.fin ? new Date(p.fin) : null;
      const date = debut.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
      const heureDebut = debut.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const heureFin = fin ? fin.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';
      const dureeMin = fin ? Math.round((fin - debut) / 60000) : Math.round((new Date() - debut) / 60000);
      const duree = fin ? formatDuration(Math.round((fin - debut) / 60000)) : '—';
      const statut = p.actif
        ? '<span class="badge-actif en-cours">En cours</span>'
        : '<span class="badge-actif termine">Terminé</span>';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(s.prenom)} ${esc(s.nom)}</td>
        <td>${date}</td>
        <td>${heureDebut}</td>
        <td>${heureFin}</td>
        <td>${duree}</td>
        <td>${statut}</td>
        <td><button class="btn-poste-delete" data-id="${p.id}" data-nom="${esc(s.prenom)} ${esc(s.nom)}" data-duree="${formatDuration(dureeMin)}">Supprimer</button></td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-poste-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = confirm(`Supprimer ce poste de ${btn.dataset.nom} (${btn.dataset.duree}) ?\n\nLe temps correspondant sera retiré de son total et de sa paie. Action définitive.`);
        if (!ok) return;
        btn.disabled = true;
        try {
          await supaDelete('postes', `id=eq.${btn.dataset.id}`);
          await loadAll();
        } catch (e) { console.error(e); btn.disabled = false; }
      });
    });
  } catch (e) { console.error(e); }
}

// =====================
// GESTION DES POSTES (ADMIN)
// =====================
async function loadPostesAdmin() {
  try {
    const postesActifs = await supaGet('postes', 'actif=eq.true&select=id,shinobi_id,debut');
    const posteMap = {};
    postesActifs.forEach(p => { posteMap[p.shinobi_id] = p; });

    const tbody = document.getElementById('postes-admin-body');
    tbody.innerHTML = '';

    allShinobis.forEach(s => {
      const poste = posteMap[s.id];
      const enPoste = !!poste;
      const depuis = enPoste ? new Date(poste.debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${esc(s.prenom)} ${esc(s.nom)}</strong></td>
        <td>${enPoste ? '<span class="badge-actif en-cours">En poste</span>' : '<span class="badge-actif termine">Hors poste</span>'}</td>
        <td>${depuis}</td>
        <td>
          ${enPoste
            ? `<button class="btn-action retirer-poste" data-poste-id="${poste.id}">Retirer du poste</button>`
            : `<button class="btn-action mettre-poste" data-shinobi-id="${s.id}">Mettre en poste</button>`
          }
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.retirer-poste').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await supaPatch('postes', `id=eq.${btn.dataset.posteId}`, {
            actif: false,
            fin: new Date().toISOString(),
            force_par: currentUser.id
          });
          await loadAll();
        } catch (e) { console.error(e); btn.disabled = false; }
      });
    });

    tbody.querySelectorAll('.mettre-poste').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await supaPost('postes', {
            shinobi_id: btn.dataset.shinobiId,
            debut: new Date().toISOString(),
            actif: true
          });
          await loadAll();
        } catch (e) { console.error(e); btn.disabled = false; }
      });
    });
  } catch (e) { console.error(e); }
}

// =====================
// GESTION DE LA PAYE
// =====================
async function loadTauxHoraire() {
  try {
    const rows = await supaGet('config', 'select=cle,valeur');
    rows.forEach(r => {
      if (r.cle && r.cle.indexOf('taux_') === 0) {
        const g = r.cle.slice(5);
        if (g in tauxParGrade) tauxParGrade[g] = parseInt(r.valeur) || 0;
      }
    });
    // Reprise de l'ancien taux global éventuel comme valeur par défaut
    const ancien = rows.find(r => r.cle === 'taux_horaire');
    if (ancien) {
      const v = parseInt(ancien.valeur) || 0;
      GRADES.forEach(g => { if (tauxParGrade[g] === 0 && g !== 'aucun') tauxParGrade[g] = v; });
    }
    GRADES.forEach(g => {
      const el = document.getElementById('taux-' + g);
      if (el) el.value = tauxParGrade[g];
    });
  } catch (e) { console.error(e); }
}

document.getElementById('btn-save-taux').addEventListener('click', async () => {
  const btn = document.getElementById('btn-save-taux');
  try {
    for (const g of GRADES) {
      const el = document.getElementById('taux-' + g);
      if (!el) continue;
      const val = Math.max(0, parseInt(el.value) || 0);
      tauxParGrade[g] = val;
      await supaUpsert('config', { cle: 'taux_' + g, valeur: String(val) });
    }
    await loadPaye();
    const old = btn.textContent;
    btn.textContent = '✓ Sauvegardé';
    setTimeout(() => { btn.textContent = old; }, 1500);
  } catch (e) { console.error(e); alert('Erreur lors de la sauvegarde des taux.'); }
});

async function loadPaye() {
  try {
    let query = 'select=id,debut,fin,actif,shinobi_id';
    const range = getDateRange('paye-period');
    if (range.from) query += `&debut=gte.${range.from}`;
    if (range.to) query += `&debut=lt.${range.to}`;
    query += '&order=debut.desc';

    const postes = await supaGet('postes', query);

    const map = {};
    postes.forEach(p => {
      const s = shinobiMap[p.shinobi_id];
      if (!s) return;
      if (!map[s.id]) {
        map[s.id] = { prenom: s.prenom, nom: s.nom, grade: s.grade || 'aucun', postes: [] };
      }
      map[s.id].postes.push(p);
    });

    const tbody = document.getElementById('paye-body');
    tbody.innerHTML = '';

    const entries = Object.values(map);
    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Aucune donnée pour cette période</td></tr>';
      document.getElementById('paye-grand-total').textContent = '0';
      return;
    }

    entries.sort((a, b) => totalMinutes(b.postes) - totalMinutes(a.postes));

    let grandTotal = 0;
    entries.forEach(e => {
      const minutes = totalMinutes(e.postes);
      const heures = Math.floor(minutes / 60);
      const taux = tauxParGrade[e.grade] || 0;
      const paye = heures * taux;
      grandTotal += paye;

      const gradeLabel = GRADE_LABELS[e.grade] || 'Aucun';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${esc(e.prenom)} ${esc(e.nom)}</strong></td>
        <td><span class="grade-badge ${e.grade}">${gradeLabel}</span></td>
        <td>${formatDuration(minutes)}</td>
        <td>${taux} Ryos</td>
        <td class="paye-ryos">${paye.toLocaleString('fr-FR')} Ryos</td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById('paye-grand-total').textContent = grandTotal.toLocaleString('fr-FR');
  } catch (e) { console.error(e); }
}

// =====================
// GRADES
// =====================
const GRADES = ['observateur', 'stagiaire', 'aspirant', 'adepte', 'expert'];
const GRADE_LABELS = { observateur: 'Observateur', stagiaire: 'Stagiaire', aspirant: 'Aspirant', adepte: 'Adepte', expert: 'Expert' };

function nextGrade(current) {
  const i = GRADES.indexOf(current || 'aucun');
  return i < GRADES.length - 1 ? GRADES[i + 1] : null;
}

function prevGrade(current) {
  const i = GRADES.indexOf(current || 'aucun');
  return i > 0 ? GRADES[i - 1] : null;
}

let gradeSortDir = 1;
const GRADE_ORDER = { observateur: 0, stagiaire: 1, aspirant: 2, adepte: 3, expert: 4 };

async function loadGrades() {
  const tbody = document.getElementById('grades-body');
  tbody.innerHTML = '';

  if (allShinobis.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row">Aucun shinobi inscrit</td></tr>';
    return;
  }

  const sorted = allShinobis.slice().sort((a, b) => {
    const ga = a.grade || 'stagiaire';
    const gb = b.grade || 'stagiaire';
    const diff = ((GRADE_ORDER[ga] != null ? GRADE_ORDER[ga] : 0) - (GRADE_ORDER[gb] != null ? GRADE_ORDER[gb] : 0)) * gradeSortDir;
    return diff !== 0 ? diff : (a.nom + a.prenom).localeCompare(b.nom + b.prenom);
  });

  sorted.forEach(s => {
    const grade = s.grade || 'stagiaire';
    const roleLabel = ROLE_LABELS[s.role] || 'Membre';
    const next = nextGrade(grade);
    const prev = prevGrade(grade);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${esc(s.prenom)} ${esc(s.nom)}</strong></td>
      <td>${roleLabel}</td>
      <td><span class="grade-badge ${grade}">${GRADE_LABELS[grade] || grade}</span></td>
      <td>
        ${prev ? `<button class="btn-grade demote" data-id="${s.id}" data-grade="${prev}">↓ ${GRADE_LABELS[prev]}</button>` : ''}
        ${next ? `<button class="btn-grade promote" data-id="${s.id}" data-grade="${next}">↑ ${GRADE_LABELS[next]}</button>` : '<span style="opacity:.4;font-size:12px">Grade max</span>'}
        <button class="btn-licencier" data-id="${s.id}" data-nom="${esc(s.prenom)} ${esc(s.nom)}">Licencier</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-licencier').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Licencier ' + btn.dataset.nom + ' ? Son profil sera supprimé du registre.')) return;
      btn.disabled = true;
      try {
        await supaDelete('shinobis', `id=eq.${btn.dataset.id}`);
        await loadAll();
      } catch (e) { console.error(e); btn.disabled = false; }
    });
  });

  tbody.querySelectorAll('.btn-grade').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const grade = btn.dataset.grade;
      btn.disabled = true;
      try {
        await supaPatch('shinobis', `id=eq.${id}`, { grade });
        await loadAll();
      } catch (e) { console.error(e); btn.disabled = false; }
    });
  });
}

document.getElementById('th-grade').addEventListener('click', () => {
  gradeSortDir *= -1;
  loadGrades();
});

// =====================
// GESTION DES RÔLES
// =====================
const ROLE_LABELS = { gerant: 'Gérant', co_gerant: 'Co-Gérant', membre: 'Membre' };

async function loadRoles() {
  const tbody = document.getElementById('roles-body');
  tbody.innerHTML = '';

  if (allShinobis.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-row">Aucun shinobi inscrit</td></tr>';
    return;
  }

  allShinobis.forEach(s => {
    const role = s.role || 'membre';
    const btn = (r) =>
      `<button class="btn-role ${r}" data-id="${s.id}" data-role="${r}"${role === r ? ' disabled' : ''}>${ROLE_LABELS[r]}</button>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${esc(s.prenom)} ${esc(s.nom)}</strong></td>
      <td><span class="role-badge ${role}">${ROLE_LABELS[role] || role}</span></td>
      <td>${btn('gerant') + btn('co_gerant') + btn('membre')}</td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-role').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const role = btn.dataset.role;
      btn.disabled = true;
      try {
        await supaPatch('shinobis', `id=eq.${id}`, { role });
        if (currentUser && id === currentUser.id && role === 'membre') {
          alert('Vous venez de retirer vos propres droits de gérance. Vous allez être déconnecté.');
          localStorage.removeItem('hopital_admin_session');
          location.reload();
          return;
        }
        if (currentUser && id === currentUser.id) currentUser.role = role;
        await loadAll();
      } catch (e) { console.error(e); btn.disabled = false; }
    });
  });
}

// =====================
// AVERTISSEMENTS
// =====================
document.getElementById('btn-add-avert').addEventListener('click', async () => {
  const shinobiId = document.getElementById('avert-shinobi').value;
  const raison = document.getElementById('avert-raison').value.trim();
  if (!shinobiId || !raison) return;

  try {
    await supaPost('avertissements', {
      shinobi_id: shinobiId,
      par_id: currentUser.id,
      raison,
      actif: true
    });
    document.getElementById('avert-raison').value = '';
    await loadAvertissements();
  } catch (e) { console.error(e); }
});

async function loadAvertissements() {
  try {
    const averts = await supaGet('avertissements', 'select=id,raison,actif,created_at,shinobi_id,par_id&order=created_at.desc&limit=100');

    const tbody = document.getElementById('avert-body');
    tbody.innerHTML = '';

    if (averts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Aucun avertissement</td></tr>';
      return;
    }

    averts.forEach(a => {
      const s = shinobiMap[a.shinobi_id];
      const par = shinobiMap[a.par_id];
      if (!s) return;
      const date = new Date(a.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const heure = new Date(a.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${esc(s.prenom)} ${esc(s.nom)}</strong></td>
        <td>${esc(a.raison)}</td>
        <td>${par ? `${esc(par.prenom)} ${esc(par.nom)}` : '—'}</td>
        <td>${date} à ${heure}</td>
        <td>${a.actif ? '<span class="badge-avert actif">Actif</span>' : '<span class="badge-avert retire">Retiré</span>'}</td>
        <td>${a.actif ? `<button class="btn-avert-remove" data-id="${a.id}">Retirer</button>` : ''}</td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-avert-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await supaPatch('avertissements', `id=eq.${btn.dataset.id}`, { actif: false });
          await loadAvertissements();
        } catch (e) { console.error(e); btn.disabled = false; }
      });
    });
  } catch (e) { console.error(e); }
}

// =====================
// GESTION DES COURS
// =====================
async function loadCoursAdmin() {
  try {
    const cours = await supaGet('cours', 'select=id,titre,description,created_at,shinobi_id&order=created_at.desc&limit=300');

    // Compteur par personne
    const counts = {};
    cours.forEach(c => { counts[c.shinobi_id] = (counts[c.shinobi_id] || 0) + 1; });

    const cb = document.getElementById('cours-count-body');
    cb.innerHTML = '';
    const entries = allShinobis.map(s => ({ s, n: counts[s.id] || 0 })).sort((a, b) => b.n - a.n);
    if (entries.length === 0) {
      cb.innerHTML = '<tr><td colspan="2" class="empty-row">Aucun shinobi inscrit</td></tr>';
    } else {
      entries.forEach(({ s, n }) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${esc(s.prenom)} ${esc(s.nom)}</strong></td><td>${n}</td>`;
        cb.appendChild(tr);
      });
    }

    // Historique complet
    const lb = document.getElementById('cours-list-body');
    lb.innerHTML = '';
    if (cours.length === 0) {
      lb.innerHTML = '<tr><td colspan="4" class="empty-row">Aucun cours enregistré</td></tr>';
      return;
    }
    cours.forEach(c => {
      const s = shinobiMap[c.shinobi_id];
      const nom = s ? `${s.prenom} ${s.nom}` : 'Inconnu';
      const date = new Date(c.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${esc(c.titre)}</strong>${c.description ? `<br><span style="font-size:12px;color:var(--text-light)">${esc(c.description)}</span>` : ''}</td>
        <td>${esc(nom)}</td>
        <td>${date}</td>
        <td><button class="btn-poste-delete" data-id="${c.id}">Supprimer</button></td>
      `;
      lb.appendChild(tr);
    });

    lb.querySelectorAll('.btn-poste-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Supprimer définitivement ce cours ?')) return;
        btn.disabled = true;
        try {
          await supaDelete('cours', `id=eq.${btn.dataset.id}`);
          await loadCoursAdmin();
        } catch (e) { console.error(e); btn.disabled = false; }
      });
    });
  } catch (e) { console.error(e); }
}

// =====================
// CHAT DE GÉRANCE
// =====================
let lastChatCount = -1;

document.getElementById('chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const contenu = input.value.trim();
  if (!contenu || !currentUser) return;
  input.value = '';
  try {
    await supaPost('messages_gerance', { auteur_id: currentUser.id, contenu });
    await loadChat(true);
  } catch (err) { console.error(err); input.value = contenu; }
});

async function loadChat(forceScroll = false) {
  try {
    const msgs = await supaGet('messages_gerance', 'select=id,auteur_id,contenu,created_at&order=created_at.asc&limit=200');
    const box = document.getElementById('chat-messages');
    if (!box) return;

    // Ne re-rendre que s'il y a du nouveau (préserve le scroll de lecture)
    if (!forceScroll && msgs.length === lastChatCount) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    lastChatCount = msgs.length;

    box.innerHTML = '';
    if (msgs.length === 0) {
      box.innerHTML = '<div class="chat-empty">Aucun message. Lance la discussion !</div>';
      return;
    }

    msgs.forEach(m => {
      const s = shinobiMap[m.auteur_id];
      const nom = s ? `${s.prenom} ${s.nom}` : 'Inconnu';
      const mine = currentUser && m.auteur_id === currentUser.id;
      const heure = new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const div = document.createElement('div');
      div.className = `chat-msg ${mine ? 'mine' : 'theirs'}`;
      div.innerHTML = `<div class="meta">${esc(nom)} · ${heure}</div><div class="texte">${esc(m.contenu)}</div>`;
      box.appendChild(div);
    });

    if (forceScroll || nearBottom) box.scrollTop = box.scrollHeight;
  } catch (err) { console.error(err); }
}

// =====================
// AJOUT OBSERVATEUR
// =====================
document.getElementById('btn-add-obs').addEventListener('click', async () => {
  const prenom = document.getElementById('obs-prenom').value.trim();
  const nom = document.getElementById('obs-nom').value.trim();
  const msg = document.getElementById('obs-msg');
  msg.innerHTML = '';

  if (!prenom || !nom) {
    msg.innerHTML = '<span style="color:var(--danger)">Remplis le prénom et le nom.</span>';
    return;
  }

  try {
    await supaPost('shinobis', { prenom, nom, role: 'membre', grade: 'observateur', sceau: '' });
    document.getElementById('obs-prenom').value = '';
    document.getElementById('obs-nom').value = '';
    msg.innerHTML = '<span style="color:var(--success)">' + esc(prenom) + ' ' + esc(nom) + ' ajouté au registre.</span>';
    await loadAll();
    setTimeout(() => { msg.innerHTML = ''; }, 3000);
  } catch (e) {
    console.error(e);
    msg.innerHTML = '<span style="color:var(--danger)">Erreur lors de l\'ajout.</span>';
  }
});

// --- Auto-login from session ---
(async function autoLogin() {
  const saved = localStorage.getItem('hopital_admin_session');
  if (!saved) return;
  try {
    const session = JSON.parse(saved);
    const users = await supaGet('shinobis', `id=eq.${session.id}`);
    if (users.length > 0 && (users[0].role === 'gerant' || users[0].role === 'co_gerant')) {
      currentUser = users[0];
      localStorage.setItem('hopital_admin_session', JSON.stringify(currentUser));
      showAdmin();
    } else {
      localStorage.removeItem('hopital_admin_session');
    }
  } catch (e) {
    console.error(e);
    localStorage.removeItem('hopital_admin_session');
  }
})();

// --- Helpers ---
function totalMinutes(postes) {
  let total = 0;
  postes.forEach(p => {
    const debut = new Date(p.debut);
    const fin = p.fin ? new Date(p.fin) : (p.actif ? new Date() : debut);
    total += (fin - debut) / 60000;
  });
  return Math.round(total);
}

function formatDuration(minutes) {
  if (minutes < 1) return '< 1 min';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

function esc(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

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
