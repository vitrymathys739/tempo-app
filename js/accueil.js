/* ==========================================================================
   Page d'accueil : dashboard, emploi du temps, habitudes (accueil.html)
   ========================================================================== */

let currentUser = null;
let timetableSlots = [];
let dailyRoutines = [];

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const START_HOUR = 7;  // 07h00
const END_HOUR = 22;   // 22h00
const HOUR_HEIGHT = 48; // 48px par heure

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
        dayEvents.forEach(ev => {
            const startMins = Math.max(0, timeToOffsetMinutes(ev.start));
            const endMins = Math.min((END_HOUR - START_HOUR) * 60, timeToOffsetMinutes(ev.end));
            const durationMins = Math.max(30, endMins - startMins);

            const topPx = (startMins / 60) * HOUR_HEIGHT;
            const heightPx = (durationMins / 60) * HOUR_HEIGHT - 2;

            const evEl = document.createElement('div');
            evEl.className = `tt-event cat-${ev.category}`;
            evEl.style.top = `${topPx}px`;
            evEl.style.height = `${heightPx}px`;

            evEl.innerHTML = `
                <div class="tt-event-top">
                    <span class="tt-event-title">${ev.title}</span>
                    <button class="tt-event-del" onclick="deleteSlot(event, ${ev.id})" title="Supprimer">✕</button>
                </div>
                <div class="tt-event-meta">${ev.start} - ${ev.end}${ev.room ? ' • ' + ev.room : ''}</div>
            `;
            dayCol.appendChild(evEl);
        });

        grid.appendChild(dayCol);
    }

    updateDashboardStats();
}

// Modale d'ajout de créneau
function openSlotModal(day = 0, startTime = '08:00') {
    document.getElementById('slot-day').value = day;
    document.getElementById('slot-start').value = startTime;
    const [h, m] = startTime.split(':').map(Number);
    const endH = Math.min(22, h + 1);
    document.getElementById('slot-end').value = `${endH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    document.getElementById('slot-title').value = '';
    document.getElementById('slot-room').value = '';
    document.getElementById('slot-modal').classList.remove('hidden');
    document.getElementById('slot-title').focus();
}

function closeSlotModal() {
    document.getElementById('slot-modal').classList.add('hidden');
}

function closeSlotModalOnBackdrop(e) {
    if (e.target.id === 'slot-modal') closeSlotModal();
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

    timetableSlots.push({
        id: Date.now(),
        day,
        start,
        end,
        title,
        room,
        category
    });

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
