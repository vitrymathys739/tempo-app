/* ==========================================================================
   Page de complétion du profil (profil.html)
   ========================================================================== */

let currentUser = null;

// Garde : il faut être connecté, et ne pas avoir déjà un profil
window.addEventListener('DOMContentLoaded', async () => {
    currentUser = await getCurrentUser();
    if (!currentUser) {
        window.location.replace(PAGES.login);
        return;
    }
    if (await getProfile(currentUser.id)) {
        window.location.replace(PAGES.home);
        return;
    }
    revealPage();
});

function checkAgeRequirement() {
    const birthDateVal = document.getElementById('birth-date').value;
    const parentalGroup = document.getElementById('parental-group');
    const parentalConsent = document.getElementById('parental-consent');
    hideBanner('onboarding-banner');

    if (!birthDateVal) return;
    const age = calculateAge(birthDateVal);

    if (age < 10) {
        showBanner('onboarding-banner', "Désolé, l'inscription sur Tempo est réservée aux personnes âgées d'au moins 10 ans.", 'error');
        parentalGroup.classList.add('hidden');
        parentalConsent.required = false;
    } else if (age < 15) {
        parentalGroup.classList.remove('hidden');
        parentalConsent.required = true;
    } else {
        parentalGroup.classList.add('hidden');
        parentalConsent.required = false;
    }
}

async function handleProfileSubmit(event) {
    event.preventDefault();
    hideBanner('onboarding-banner');

    const birthDate = document.getElementById('birth-date').value;
    const situation = document.getElementById('situation-select').value;
    const parentalConsent = document.getElementById('parental-consent').checked;
    const submitBtn = document.getElementById('profile-submit-btn');

    const age = calculateAge(birthDate);

    if (age < 10) {
        showBanner('onboarding-banner', "Inscription refusée : tu dois avoir au moins 10 ans pour utiliser Tempo.", 'error');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Création de votre espace...";

    try {
        const fullName = currentUser.user_metadata?.full_name || 'Utilisateur Tempo';
        const newProfile = {
            id: currentUser.id,
            full_name: fullName,
            birth_date: birthDate,
            situation: situation,
            parental_consent: age < 15 ? parentalConsent : true
        };

        const { error } = await supabaseClient
            .from('profiles')
            .insert([newProfile]);

        if (error) throw error;
        if (document.getElementById('template-consent').checked) {
            applyTemplateForUser(currentUser.id, situation);
        }
        window.location.replace(PAGES.home);
    } catch (err) {
        showBanner('onboarding-banner', "Erreur lors de l'enregistrement : " + err.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Accéder à mon espace";
    }
}

// Propose le modèle correspondant à la situation choisie
function updateTemplateHint() {
    const situation = document.getElementById('situation-select').value;
    const group = document.getElementById('template-group');
    if (!situation) {
        group.classList.add('hidden');
        return;
    }
    const tpl = getTemplateForSituation(situation);
    document.getElementById('template-label').textContent =
        `Pré-remplir mon emploi du temps avec le modèle « ${tpl.name} » (modifiable ensuite).`;
    group.classList.remove('hidden');
}
