/* ==========================================================================
   Page d'accueil : dashboard, emploi du temps, habitudes (accueil.html)
   ========================================================================== */

let currentUser = null;
let timetableSlots = [];
let dailyRoutines = [];
let categories = [];
let editingSlotId = null;       // null = création d'un créneau
let editingCategoryId = null;   // null = création d'une catégorie
let draftColor = '#3b82f6';     // couleur choisie dans le formulaire de catégorie

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const START_HOUR = 7;  // 07h00
const END_HOUR = 22;   // 22h00
const HOUR_HEIGHT = 48; // 48px par heure

// Catégories proposées au départ (les ids sont ceux déjà utilisés par les modèles)
const DEFAULT_CATEGORIES = [
    { id: 'cours',     name: 'Cours / Travail',       color: '#3b82f6' },
    { id: 'revisions', name: 'Révisions / Projets',   color: '#a855f7' },
    { id: 'sport',     name: 'Sport / Santé',         color: '#10b981' },
    { id: 'routine',   name: 'Routine / Temps libre', color: '#f59e0b' }
];

// Catégorie « de secours » pour les créneaux dont la catégorie a été supprimée
const UNCATEGORIZED = { id: '', name: 'Sans catégorie', color: '#71717a' };

const PALETTE = [
    '#3b82f6', '#0ea5e9', '#14b8a6', '#10b981', '#84cc16', '#eab308',
    '#f59e0b', '#ef4444', '#ec4899', '#a855f7', '#6366f1', '#71717a'
];

const situationLabels = {
    'college': 'Étudiant au collège',
    'lycee': 'Étudiant au lycée',
    'superieur': 'Étudiant dans le supérieur',
    'alternance': 'En alternance / Apprentissage',
    'salarie': 'Salarié(e)',
    'independant': 'Indépendant(e) / Entrepreneur',
    'recherche': 'En recherche d\'emploi',
    'autre': 'Autre situation'
};

// Garde : il faut être connecté ET avoir un profil complété
window.addEventListener('DOMContentLoaded', async () => {
    const user = await getCurrentUser();
    if (!user) {
        window.location.replace(PAGES.login);
        return;
    }
    const profile = await getProfile(user.id);
    if (!profile) {
        window.location.replace(PAGES.profile);
        return;
    }
    showDashboardView(user, profile);
    revealPage();
    initMailbox();
});

// --- DASHBOARD & EMPLOI DU TEMPS ---
function showDashboardView(user, profile) {
    currentUser = user;

    const age = calculateAge(profile.birth_date);
    const sitLabel = situationLabels[profile.situation] || profile.situation;
    document.getElementById('dash-welcome').textContent = `Bonjour, ${profile.full_name} 👋`;
    document.getElementById('dash-badge').textContent = `${sitLabel} • ${age} ans`;

    const optionsDate = { weekday: 'short', day: 'numeric', month: 'short' };
    const todayStr = new Date().toLocaleDateString('fr-FR', optionsDate);
    document.getElementById('stat-date').textContent = todayStr.charAt(0).toUpperCase() + todayStr.slice(1);

    // Chargement des créneaux de l'emploi du temps
    const slotsKey = `tempo_slots_${user.id}`;
    const savedSlots = localStorage.getItem(slotsKey);
    if (savedSlots) {
        timetableSlots = JSON.parse(savedSlots);
    } else {
        timetableSlots = [];
        saveSlotsData();
    }

    // Chargement des catégories (personnalisables)
    categories = loadCategories(user.id);

    // Chargement des habitudes du jour
    const routinesKey = `tempo_routines_${user.id}`;
    const savedRoutines = localStorage.getItem(routinesKey);
    if (savedRoutines) {
        dailyRoutines = JSON.parse(savedRoutines);
    } else {
        dailyRoutines = [
            { id: 1, title: 'Préparer mes affaires pour demain', done: false },
            { id: 2, title: '30 minutes de lecture ou révisions', done: false }
        ];
        saveRoutinesData();
    }

    renderTimetable();
    renderRoutines();
}

function loadCategories(userId) {
    const key = `tempo_categories_${userId}`;
    try {
        const saved = JSON.parse(localStorage.getItem(key));
        if (Array.isArray(saved)) {
            return saved
                .filter(c => c && typeof c.id === 'string' && typeof c.name === 'string')
                .map(c => ({ id: c.id, name: c.name.slice(0, 30), color: safeColor(c.color) }));
        }
    } catch (e) { /* données illisibles : on repart des catégories par défaut */ }
    const defaults = DEFAULT_CATEGORIES.map(c => ({ ...c }));
    localStorage.setItem(key, JSON.stringify(defaults));
    return defaults;
}

function saveCategoriesData() {
    if (!currentUser) return;
    localStorage.setItem(`tempo_categories_${currentUser.id}`, JSON.stringify(categories));
}

function saveSlotsData() {
    if (!currentUser) return;
    localStorage.setItem(`tempo_slots_${currentUser.id}`, JSON.stringify(timetableSlots));
}

function saveRoutinesData() {
    if (!currentUser) return;
    localStorage.setItem(`tempo_routines_${currentUser.id}`, JSON.stringify(dailyRoutines));
}

// Convertit "08:30" en minutes depuis 07:00
function timeToOffsetMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return (h - START_HOUR) * 60 + m;
}

// --- COULEURS & CATÉGORIES (utilitaires) ---
function safeColor(c) {
    return (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) ? c.toLowerCase() : UNCATEGORIZED.color;
}

function hexToRgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Éclaircit une couleur (pour garder le texte lisible sur fond sombre)
function lighten(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const mix = v => Math.round(v + (255 - v) * amount);
    return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

function getCategory(id) {
    return categories.find(c => c.id === id) || UNCATEGORIZED;
}

// Légende dynamique, construite depuis les catégories
function renderLegend() {
    const legend = document.getElementById('legend');
    legend.innerHTML = '';
    const items = [...categories];
    if (timetableSlots.some(s => !categories.some(c => c.id === s.category))) items.push(UNCATEGORIZED);
    items.forEach(cat => {
        const item = document.createElement('span');
        item.className = 'legend-item';
        const dot = document.createElement('span');
        dot.className = 'legend-dot';
        dot.style.background = cat.color;
        item.append(dot, cat.name);
        legend.appendChild(item);
    });
}

// Génération de la grille Pronote
function renderTimetable() {
    const grid = document.getElementById('timetable-grid');
    grid.innerHTML = '';

    // Jour actuel (0 = Lundi ... 6 = Dimanche)
    const jsDay = new Date().getDay();
    const todayIndex = jsDay === 0 ? 6 : jsDay - 1;

    // 1. Ligne d'en-tête
    const corner = document.createElement('div');
    corner.className = 'tt-header-corner';
    grid.appendChild(corner);

    DAYS.forEach((dayName, idx) => {
        const header = document.createElement('div');
        header.className = `tt-day-header ${idx === todayIndex ? 'today' : ''}`;
        header.textContent = dayName;
        grid.appendChild(header);
    });

    // 2. Colonne des heures (07h -> 21h)
    const timeCol = document.createElement('div');
    timeCol.className = 'tt-time-col';
    for (let h = START_HOUR; h < END_HOUR; h++) {
        const slot = document.createElement('div');
        slot.className = 'tt-time-slot';
        slot.textContent = `${h.toString().padStart(2, '0')}:00`;
        timeCol.appendChild(slot);
    }
    grid.appendChild(timeCol);

    // 3. Colonnes des 7 jours
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        const dayCol = document.createElement('div');
        dayCol.className = `tt-day-col ${dayIdx === todayIndex ? 'today' : ''}`;

        // Clic rapide dans le vide d'un jour pour pré-remplir la modale
        dayCol.addEventListener('click', (e) => {
            if (e.target === dayCol) {
                const rect = dayCol.getBoundingClientRect();
                const clickY = e.clientY - rect.top;
                const clickedHour = Math.min(20, Math.max(START_HOUR, START_HOUR + Math.floor(clickY / HOUR_HEIGHT)));
                openSlotModal(dayIdx, `${clickedHour.toString().padStart(2, '0')}:00`);
            }
        });

        const dayEvents = timetableSlots.filter(s => s.day === dayIdx);
        dayEvents.forEach(slot => {
            const startMins = Math.max(0, timeToOffsetMinutes(slot.start));
            const endMins = Math.min((END_HOUR - START_HOUR) * 60, timeToOffsetMinutes(slot.end));
            const durationMins = Math.max(30, endMins - startMins);

            const topPx = (startMins / 60) * HOUR_HEIGHT;
            const heightPx = (durationMins / 60) * HOUR_HEIGHT - 2;
            const cat = getCategory(slot.category);

            const evEl = document.createElement('div');
            evEl.className = 'tt-event';
            evEl.style.top = `${topPx}px`;
            evEl.style.height = `${heightPx}px`;
            evEl.style.background = hexToRgba(cat.color, 0.22);
            evEl.style.borderLeftColor = cat.color;
            evEl.style.color = lighten(cat.color, 0.8);
            evEl.tabIndex = 0;
            evEl.setAttribute('role', 'button');
            evEl.setAttribute('aria-label', `Modifier le créneau ${slot.title}`);
            evEl.addEventListener('click', (e) => {
                e.stopPropagation();
                openSlotEditor(slot.id);
            });
            evEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openSlotEditor(slot.id);
                }
            });

            const top = document.createElement('div');
            top.className = 'tt-event-top';
            const titleEl = document.createElement('span');
            titleEl.className = 'tt-event-title';
            titleEl.textContent = slot.title;
            const delBtn = document.createElement('button');
            delBtn.className = 'tt-event-del';
            delBtn.title = 'Supprimer';
            delBtn.textContent = '✕';
            delBtn.addEventListener('click', (e) => deleteSlot(e, slot.id));
            top.append(titleEl, delBtn);

            const meta = document.createElement('div');
            meta.className = 'tt-event-meta';
            meta.textContent = `${slot.start} - ${slot.end}${slot.room ? ' • ' + slot.room : ''}`;

            evEl.append(top, meta);
            dayCol.appendChild(evEl);
        });

        grid.appendChild(dayCol);
    }

    renderLegend();
    updateDashboardStats();
}

// --- MODALE CRÉNEAU (création ET modification) ---
function showSlotModal() {
    document.getElementById('slot-modal').classList.remove('hidden');
    document.getElementById('slot-title').focus();
}

// Nouveau créneau (clic sur « + Ajouter » ou dans une zone vide de la grille)
function openSlotModal(day = 0, startTime = '08:00', prefill = {}) {
    editingSlotId = null;
    document.getElementById('slot-modal-title').textContent = 'Nouveau créneau';
    document.getElementById('slot-submit-btn').textContent = "Ajouter à l'emploi du temps";
    document.getElementById('slot-delete-btn').classList.add('hidden');

    document.getElementById('slot-day').value = day;
    document.getElementById('slot-start').value = startTime;
    const [h, m] = startTime.split(':').map(Number);
    const endH = Math.min(22, h + 1);
    document.getElementById('slot-end').value = `${endH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    document.getElementById('slot-title').value = prefill.title || '';
    document.getElementById('slot-room').value = prefill.room || '';
    setSlotCategory(categories.length ? categories[0].id : '');
    showSlotModal();
}

// Clic sur un créneau existant : même fenêtre, pré-remplie
function openSlotEditor(id) {
    const slot = timetableSlots.find(s => s.id === id);
    if (!slot) return;
    editingSlotId = id;
    document.getElementById('slot-modal-title').textContent = 'Modifier le créneau';
    document.getElementById('slot-submit-btn').textContent = 'Enregistrer les modifications';
    document.getElementById('slot-delete-btn').classList.remove('hidden');

    document.getElementById('slot-title').value = slot.title;
    document.getElementById('slot-room').value = slot.room || '';
    document.getElementById('slot-day').value = slot.day;
    document.getElementById('slot-start').value = slot.start;
    document.getElementById('slot-end').value = slot.end;
    setSlotCategory(slot.category);
    showSlotModal();
}

function closeSlotModal() {
    document.getElementById('slot-modal').classList.add('hidden');
    editingSlotId = null;
}

function closeSlotModalOnBackdrop(e) {
    if (e.target.id === 'slot-modal') closeSlotModal();
}

// Sélecteur de catégorie sous forme de pastilles colorées
function setSlotCategory(categoryId) {
    const valid = categories.some(c => c.id === categoryId);
    const value = valid ? categoryId : '';
    document.getElementById('slot-category').value = value;

    const box = document.getElementById('slot-category-chips');
    box.innerHTML = '';
    [...categories, UNCATEGORIZED].forEach(cat => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'cat-chip';
        chip.setAttribute('aria-pressed', String(cat.id === value));
        if (cat.id === value) {
            chip.style.borderColor = cat.color;
            chip.style.background = hexToRgba(cat.color, 0.2);
        }
        const dot = document.createElement('span');
        dot.className = 'legend-dot';
        dot.style.background = cat.color;
        chip.append(dot, cat.name);
        chip.addEventListener('click', () => setSlotCategory(cat.id));
        box.appendChild(chip);
    });
}

function saveTimetableSlot(event) {
    event.preventDefault();
    const title = document.getElementById('slot-title').value.trim();
    const room = document.getElementById('slot-room').value.trim();
    const day = parseInt(document.getElementById('slot-day').value, 10);
    const start = document.getElementById('slot-start').value;
    const end = document.getElementById('slot-end').value;
    const category = document.getElementById('slot-category').value;

    if (end <= start) {
        alert("L'heure de fin doit être après l'heure de début.");
        return;
    }

    if (editingSlotId !== null) {
        const slot = timetableSlots.find(s => s.id === editingSlotId);
        if (slot) Object.assign(slot, { day, start, end, title, room, category });
    } else {
        timetableSlots.push({ id: Date.now(), day, start, end, title, room, category });
    }

    saveSlotsData();
    renderTimetable();
    closeSlotModal();
}

function deleteSlotFromModal() {
    if (editingSlotId === null) return;
    timetableSlots = timetableSlots.filter(s => s.id !== editingSlotId);
    saveSlotsData();
    renderTimetable();
    closeSlotModal();
}

function deleteSlot(event, id) {
    event.stopPropagation();
    timetableSlots = timetableSlots.filter(s => s.id !== id);
    saveSlotsData();
    renderTimetable();
}

// --- GESTION DES CATÉGORIES ---
function openCategoryModal() {
    resetCategoryForm();
    renderCategoryList();
    document.getElementById('category-modal').classList.remove('hidden');
}

function closeCategoryModal() {
    document.getElementById('category-modal').classList.add('hidden');
}

function closeCategoryModalOnBackdrop(e) {
    if (e.target.id === 'category-modal') closeCategoryModal();
}

function renderCategoryList() {
    const list = document.getElementById('category-list');
    list.innerHTML = '';

    if (categories.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'category-empty';
        empty.textContent = "Aucune catégorie. Crée la première ci-dessous.";
        list.appendChild(empty);
        return;
    }

    categories.forEach(cat => {
        const count = timetableSlots.filter(s => s.category === cat.id).length;
        const row = document.createElement('div');
        row.className = 'category-row';

        const dot = document.createElement('span');
        dot.className = 'category-dot';
        dot.style.background = cat.color;

        const name = document.createElement('span');
        name.className = 'category-name';
        name.textContent = cat.name;

        const countEl = document.createElement('span');
        countEl.className = 'category-count';
        countEl.textContent = `${count} créneau${count > 1 ? 'x' : ''}`;

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'icon-btn';
        editBtn.title = 'Modifier';
        editBtn.setAttribute('aria-label', `Modifier la catégorie ${cat.name}`);
        editBtn.textContent = '✎';
        editBtn.addEventListener('click', () => startEditCategory(cat.id));

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'icon-btn danger';
        delBtn.title = 'Supprimer';
        delBtn.setAttribute('aria-label', `Supprimer la catégorie ${cat.name}`);
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', () => deleteCategory(cat.id));

        row.append(dot, name, countEl, editBtn, delBtn);
        list.appendChild(row);
    });
}

// Palette : 12 couleurs prédéfinies + un sélecteur libre
function renderPalette() {
    const palette = document.getElementById('category-palette');
    palette.innerHTML = '';

    PALETTE.forEach(color => {
        const sw = document.createElement('button');
        sw.type = 'button';
        sw.className = 'swatch';
        sw.style.background = color;
        sw.title = color;
        sw.setAttribute('aria-label', `Couleur ${color}`);
        sw.setAttribute('aria-pressed', String(color === draftColor));
        sw.addEventListener('click', () => {
            draftColor = color;
            renderPalette();
        });
        palette.appendChild(sw);
    });

    const isCustom = !PALETTE.includes(draftColor);
    const custom = document.createElement('label');
    custom.className = 'swatch swatch-custom';
    custom.title = 'Couleur personnalisée';
    custom.setAttribute('aria-pressed', String(isCustom));
    if (isCustom) custom.style.background = draftColor;
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = draftColor;
    picker.setAttribute('aria-label', 'Couleur personnalisée');
    picker.addEventListener('input', () => {
        draftColor = picker.value.toLowerCase();
        custom.style.background = draftColor;
        custom.setAttribute('aria-pressed', 'true');
        palette.querySelectorAll('.swatch:not(.swatch-custom)').forEach(b => b.setAttribute('aria-pressed', 'false'));
    });
    custom.append(isCustom ? '' : '+', picker);
    palette.appendChild(custom);
}

function resetCategoryForm() {
    editingCategoryId = null;
    document.getElementById('category-name').value = '';
    document.getElementById('category-form-title').textContent = 'Nouvelle catégorie';
    document.getElementById('category-submit-btn').textContent = 'Ajouter la catégorie';
    document.getElementById('category-cancel-btn').classList.add('hidden');
    // Propose d'abord une couleur pas encore utilisée
    draftColor = PALETTE.find(c => !categories.some(cat => cat.color === c)) || PALETTE[0];
    renderPalette();
}

function startEditCategory(id) {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    editingCategoryId = id;
    document.getElementById('category-name').value = cat.name;
    document.getElementById('category-form-title').textContent = 'Modifier la catégorie';
    document.getElementById('category-submit-btn').textContent = 'Enregistrer';
    document.getElementById('category-cancel-btn').classList.remove('hidden');
    draftColor = cat.color;
    renderPalette();
    document.getElementById('category-name').focus();
}

function saveCategory(event) {
    event.preventDefault();
    const name = document.getElementById('category-name').value.trim();
    if (!name) return;

    let selectedId;
    if (editingCategoryId !== null) {
        const cat = categories.find(c => c.id === editingCategoryId);
        if (cat) {
            cat.name = name;
            cat.color = draftColor;
        }
        selectedId = editingCategoryId;
    } else {
        selectedId = `c${Date.now()}`;
        categories.push({ id: selectedId, name, color: draftColor });
    }

    afterCategoriesChanged(editingCategoryId === null ? selectedId : null);
    resetCategoryForm();
}

function deleteCategory(id) {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    const used = timetableSlots.filter(s => s.category === id);

    let message = `Supprimer la catégorie « ${cat.name} » ?`;
    if (used.length > 0) {
        message += `\n\n${used.length} créneau${used.length > 1 ? 'x' : ''} ${used.length > 1 ? 'passeront' : 'passera'} en « Sans catégorie » (ils ne seront pas supprimés).`;
    }
    if (!confirm(message)) return;

    used.forEach(s => { s.category = ''; });
    categories = categories.filter(c => c.id !== id);
    saveSlotsData();
    if (editingCategoryId === id) resetCategoryForm();
    afterCategoriesChanged(null);
}

// Rafraîchit tout ce qui dépend des catégories
function afterCategoriesChanged(newCategoryId) {
    saveCategoriesData();
    renderCategoryList();
    renderTimetable();
    const slotModal = document.getElementById('slot-modal');
    if (!slotModal.classList.contains('hidden')) {
        // Si on vient de créer une catégorie depuis la fenêtre de créneau, on la sélectionne
        setSlotCategory(newCategoryId || document.getElementById('slot-category').value);
    }
}

// Échap ferme la fenêtre ouverte la plus haute
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('category-modal').classList.contains('hidden')) closeCategoryModal();
    else if (!document.getElementById('compose-modal').classList.contains('hidden')) closeComposeModal();
    else if (!document.getElementById('mail-modal').classList.contains('hidden')) closeMailModal();
    else if (!document.getElementById('slot-modal').classList.contains('hidden')) closeSlotModal();
});

// --- HABITUDES QUOTIDIENNES ---
function renderRoutines() {
    const listEl = document.getElementById('routine-list');
    listEl.innerHTML = '';

    dailyRoutines.forEach(item => {
        const div = document.createElement('div');
        div.className = `routine-item ${item.done ? 'completed' : ''}`;
        div.innerHTML = `
            <div class="routine-left">
                <input type="checkbox" class="routine-checkbox" ${item.done ? 'checked' : ''} onchange="toggleRoutine(${item.id})">
                <span class="routine-title">${item.title}</span>
            </div>
            <button class="delete-btn" onclick="deleteRoutine(${item.id})" title="Supprimer">✕</button>
        `;
        listEl.appendChild(div);
    });

    updateDashboardStats();
}

function addRoutine(event) {
    event.preventDefault();
    const input = document.getElementById('routine-title');
    if (!input.value.trim()) return;

    dailyRoutines.push({
        id: Date.now(),
        title: input.value.trim(),
        done: false
    });

    input.value = '';
    saveRoutinesData();
    renderRoutines();
}

// Utilisé par la boîte mail : « Ajouter aux habitudes »
function addRoutineFromTitle(title) {
    dailyRoutines.push({ id: Date.now(), title: title.trim().slice(0, 120), done: false });
    saveRoutinesData();
    renderRoutines();
}

function toggleRoutine(id) {
    const r = dailyRoutines.find(x => x.id === id);
    if (r) {
        r.done = !r.done;
        saveRoutinesData();
        renderRoutines();
    }
}

function deleteRoutine(id) {
    dailyRoutines = dailyRoutines.filter(x => x.id !== id);
    saveRoutinesData();
    renderRoutines();
}

function updateDashboardStats() {
    document.getElementById('stat-slots').textContent = timetableSlots.length;

    const total = dailyRoutines.length;
    const doneCount = dailyRoutines.filter(r => r.done).length;
    const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100);

    document.getElementById('stat-percent').textContent = `${percent}%`;
    document.getElementById('stat-done-text').textContent = `${doneCount}/${total} accompli${doneCount > 1 ? 's' : ''}`;
}
