/* ==========================================================================
   Tempo — code partagé par les 3 pages (index.html, profil.html, accueil.html)
   Chargé après le SDK Supabase. Tout ce qui est ici est global.
   ========================================================================== */

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
}

// ⚠️ REMPLACE TA PUBLISHABLE KEY CI-DESSOUS ⚠️
const SUPABASE_URL = 'https://kgrgetlhsedhhjgjxonj.supabase.co';
const SUPABASE_ANON_KEY = 'TA-PUBLISHABLE-KEY';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Pages de l'application (un seul endroit à modifier si tu renommes un fichier)
const PAGES = {
    login: 'index.html',
    profile: 'profil.html',
    home: 'accueil.html'
};

// --- Session & profil -------------------------------------------------------

async function getCurrentUser() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session ? session.user : null;
}

async function getProfile(userId) {
    const { data } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
    return data; // null si le profil n'existe pas encore
}

async function logout() {
    await supabaseClient.auth.signOut();
    window.location.replace(PAGES.login);
}

// Affiche la page une fois la vérification de session terminée (cf. body.pending)
function revealPage() {
    document.body.classList.remove('pending');
}

// --- Utilitaires ------------------------------------------------------------

function calculateAge(birthDateString) {
    const today = new Date();
    const birthDate = new Date(birthDateString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

function showBanner(id, msg, type) {
    const banner = document.getElementById(id);
    banner.textContent = msg;
    banner.className = `banner ${type === 'error' ? 'error-banner' : 'info-banner'}`;
    banner.classList.remove('hidden');
}

function hideBanner(id) {
    document.getElementById(id).classList.add('hidden');
}
