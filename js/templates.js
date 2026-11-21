/* ==========================================================================
   Modèles d'emploi du temps selon la situation (profil.html)
   Pour ajouter / modifier un modèle : édite TEMPLATES ci-dessous.
   Jours : 0 = Lundi ... 6 = Dimanche. Catégories : cours | revisions | sport | routine.
   La grille de l'accueil va de 07:00 à 22:00 (créneaux de 30 min minimum).
   ========================================================================== */

const SEMAINE = [0, 1, 2, 3, 4];   // Lundi → Vendredi

const TEMPLATES = {
    scolaire: {
        name: 'Rythme scolaire',
        blocks: [
            { days: SEMAINE, start: '07:00', end: '08:00', title: 'Réveil & petit-déjeuner', room: 'Maison', category: 'routine' },
            { days: SEMAINE, start: '08:00', end: '12:00', title: 'Cours (matin)', room: '', category: 'cours' },
            { days: SEMAINE, start: '12:00', end: '13:30', title: 'Pause déjeuner', room: '', category: 'routine' },
            { days: SEMAINE, start: '13:30', end: '17:00', title: 'Cours (après-midi)', room: '', category: 'cours' },
            { days: SEMAINE, start: '17:30', end: '19:00', title: 'Devoirs & révisions', room: 'Maison', category: 'revisions' },
            { days: SEMAINE, start: '20:00', end: '21:30', title: 'Dîner & temps libre', room: 'Maison', category: 'routine' },
            { days: SEMAINE, start: '21:30', end: '22:00', title: 'Coupure des écrans', room: '', category: 'routine' },
            { days: [5],     start: '10:00', end: '12:00', title: 'Sport / Activité', room: '', category: 'sport' },
            { days: [6],     start: '17:00', end: '18:30', title: 'Préparer la semaine', room: 'Maison', category: 'revisions' }
        ],
        routines: [
            'Préparer mes affaires pour demain',
            '30 minutes de lecture ou révisions',
            'Éteindre les écrans avant 21h30'
        ]
    },

    superieur: {
        name: 'Études supérieures',
        blocks: [
            { days: SEMAINE, start: '09:00', end: '12:30', title: 'Cours / TD ou Deep Work', room: '', category: 'cours' },
            { days: SEMAINE, start: '12:30', end: '13:30', title: 'Pause méridienne', room: '', category: 'routine' },
            { days: SEMAINE, start: '14:00', end: '17:30', title: 'Projets, séminaires & relecture', room: '', category: 'revisions' },
            { days: [0, 2, 4], start: '18:00', end: '20:00', title: 'Sport', room: '', category: 'sport' },
            { days: [1, 3],  start: '18:00', end: '20:00', title: 'Activité perso / associative', room: '', category: 'routine' },
            { days: [5],     start: '10:00', end: '12:00', title: 'Relecture des notes de la semaine', room: '', category: 'revisions' }
        ],
        routines: [
            'Relire mes notes de cours du jour (15 min)',
            'Planifier le travail du lendemain',
            'Faire une vraie pause déconnectée'
        ]
    },

    pro: {
        name: 'Rythme professionnel',
        blocks: [
            { days: SEMAINE, start: '07:30', end: '08:30', title: 'Routine matinale & trajet', room: '', category: 'routine' },
            { days: SEMAINE, start: '09:00', end: '12:30', title: 'Travail : tâches prioritaires & réunions', room: '', category: 'cours' },
            { days: SEMAINE, start: '12:30', end: '13:30', title: 'Pause déjeuner', room: '', category: 'routine' },
            { days: SEMAINE, start: '13:30', end: '17:30', title: 'Travail', room: '', category: 'cours' },
            { days: [0, 2, 4], start: '18:30', end: '19:30', title: 'Activité physique', room: '', category: 'sport' },
            { days: [1, 3],  start: '18:30', end: '19:30', title: 'Loisir (transition vie perso)', room: '', category: 'routine' },
            { days: SEMAINE, start: '20:30', end: '22:00', title: 'Repos & gestion perso', room: 'Maison', category: 'routine' },
            { days: [5],     start: '10:00', end: '12:00', title: 'Sport / Loisir', room: '', category: 'sport' }
        ],
        routines: [
            'Lister mes 3 priorités du jour',
            'Activité physique ou marche',
            'Ne plus consulter mes mails pro après 19h'
        ]
    },

    independant: {
        name: 'Indépendant / Reconversion',
        blocks: [
            { days: SEMAINE, start: '08:30', end: '12:00', title: 'Production intensive', room: '', category: 'cours' },
            { days: SEMAINE, start: '12:00', end: '13:30', title: 'Pause déjeuner', room: '', category: 'routine' },
            { days: SEMAINE, start: '13:30', end: '15:30', title: 'Admin, emails, compta & rendez-vous', room: '', category: 'cours' },
            { days: SEMAINE, start: '15:30', end: '17:30', title: 'Prospection, formation, projets', room: '', category: 'revisions' },
            { days: SEMAINE, start: '18:00', end: '18:30', title: 'Coupure nette', room: '', category: 'routine' },
            { days: [1, 3],  start: '18:30', end: '19:30', title: 'Sport', room: '', category: 'sport' },
            { days: [4],     start: '17:30', end: '18:00', title: 'Bilan de la semaine', room: '', category: 'routine' }
        ],
        routines: [
            'Définir ma tâche la plus importante du jour',
            'Faire un point sur mes missions / candidatures',
            'Couper à 18h : pas de travail le soir'
        ]
    },

    // Modèle neutre pour « Autre situation »
    autre: {
        name: 'Journée équilibrée',
        blocks: [
            { days: SEMAINE, start: '08:00', end: '08:30', title: 'Routine du matin', room: '', category: 'routine' },
            { days: SEMAINE, start: '09:00', end: '12:00', title: 'Bloc de travail', room: '', category: 'cours' },
            { days: SEMAINE, start: '14:00', end: '17:00', title: 'Bloc de travail', room: '', category: 'cours' },
            { days: SEMAINE, start: '18:00', end: '19:00', title: 'Sport / Loisir', room: '', category: 'sport' }
        ],
        routines: [
            'Planifier ma journée',
            'Bouger au moins 20 minutes'
        ]
    }
};

// Quelle situation utilise quel modèle
const SITUATION_TO_TEMPLATE = {
    college: 'scolaire',
    lycee: 'scolaire',
    superieur: 'superieur',
    alternance: 'pro',
    salarie: 'pro',
    independant: 'independant',
    recherche: 'independant',
    autre: 'autre'
};

function getTemplateForSituation(situation) {
    return TEMPLATES[SITUATION_TO_TEMPLATE[situation] || 'autre'];
}

// Transforme un modèle en créneaux (un par jour) et habitudes, avec des ids uniques
function buildFromTemplate(situation) {
    const tpl = getTemplateForSituation(situation);
    let id = Date.now();
    const slots = [];
    tpl.blocks.forEach(b => {
        b.days.forEach(day => {
            slots.push({ id: id++, day, start: b.start, end: b.end, title: b.title, room: b.room, category: b.category });
        });
    });
    const routines = tpl.routines.map(title => ({ id: id++, title, done: false }));
    return { slots, routines };
}

// Écrit le modèle dans le stockage de l'utilisateur (mêmes clés que accueil.js)
function applyTemplateForUser(userId, situation) {
    const { slots, routines } = buildFromTemplate(situation);
    localStorage.setItem(`tempo_slots_${userId}`, JSON.stringify(slots));
    localStorage.setItem(`tempo_routines_${userId}`, JSON.stringify(routines));
}
