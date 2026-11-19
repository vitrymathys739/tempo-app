/* ==========================================================================
   Page de connexion / inscription (index.html)
   ========================================================================== */

let isLoginMode = true;

// Si déjà connecté, on redirige directement vers la bonne page
window.addEventListener('DOMContentLoaded', async () => {
    const user = await getCurrentUser();
    if (user) {
        await routeUserAfterAuth(user);
    }
});

// Profil complété -> accueil, sinon -> complétion du profil
async function routeUserAfterAuth(user) {
    const profile = await getProfile(user.id);
    window.location.replace(profile ? PAGES.home : PAGES.profile);
}

function switchMode(mode) {
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    const nameGroup = document.getElementById('name-group');
    const rgpdGroup = document.getElementById('rgpd-group');
    const rgpdConsent = document.getElementById('rgpd-consent');
    const submitBtn = document.getElementById('auth-submit-btn');
    const subtitle = document.getElementById('subtitle');
    hideBanner('auth-banner');

    if (mode === 'login') {
        isLoginMode = true;
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        nameGroup.classList.add('hidden');
        rgpdGroup.classList.add('hidden');
        rgpdConsent.required = false;
        submitBtn.textContent = "Se connecter";
        subtitle.textContent = "Connecte-toi pour accéder à ton espace";
    } else {
        isLoginMode = false;
        registerTab.classList.add('active');
        loginTab.classList.remove('active');
        nameGroup.classList.remove('hidden');
        rgpdGroup.classList.remove('hidden');
        rgpdConsent.required = true;
        submitBtn.textContent = "Continuer";
        subtitle.textContent = "Crée ton compte Tempo en quelques secondes";
    }
}

async function handleAuthSubmit(event) {
    event.preventDefault();
    hideBanner('auth-banner');

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const fullName = document.getElementById('name').value.trim();
    const submitBtn = document.getElementById('auth-submit-btn');

    submitBtn.disabled = true;
    submitBtn.textContent = "Chargement...";

    try {
        if (isLoginMode) {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            await routeUserAfterAuth(data.user);
        } else {
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: { data: { full_name: fullName } }
            });
            if (error) throw error;

            if (data.user && data.session) {
                // Nouveau compte, connecté tout de suite : étape suivante = profil
                window.location.replace(PAGES.profile);
            } else {
                showBanner('auth-banner', "Compte créé ! Vérifie tes emails pour valider ton adresse avant de te connecter.", 'info');
            }
        }
    } catch (error) {
        showBanner('auth-banner', traductionErreur(error.message), 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isLoginMode ? "Se connecter" : "Continuer";
    }
}

function traductionErreur(message) {
    if (message.includes("Invalid login credentials")) return "Email ou mot de passe incorrect.";
    if (message.includes("User already registered")) return "Un compte existe déjà avec cet email.";
    if (message.includes("Password should be at least")) return "Le mot de passe doit faire au moins 6 caractères.";
    return "Erreur : " + message;
}
