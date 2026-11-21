/* ==========================================================================
   Page Paramètres (parametres.html) : connexion Gmail + réglages d'affichage
   ========================================================================== */

let mailStatus = null;

window.addEventListener('DOMContentLoaded', async () => {
    const user = await getCurrentUser();
    if (!user) {
        window.location.replace(PAGES.login);
        return;
    }
    if (!(await getProfile(user.id))) {
        window.location.replace(PAGES.profile);
        return;
    }
    revealPage();
    showReturnMessage();
    await loadMailStatus();
});

// Message affiché au retour de Google (?gmail=connected|denied|scopes|error)
function showReturnMessage() {
    const result = new URLSearchParams(window.location.search).get('gmail');
    if (!result) return;
    window.history.replaceState(null, '', window.location.pathname);

    const messages = {
        connected: ['Gmail connecté ✓', 'info'],
        denied: ["Tu as refusé l'autorisation : aucune boîte n'a été connectée.", 'error'],
        scopes: ["Il faut autoriser la lecture ET l'envoi de mails (ne décoche aucune case) pour que Tempo fonctionne.", 'error'],
        error: ['La connexion à Gmail a échoué. Réessaie dans un instant.', 'error']
    };
    const [text, type] = messages[result] || messages.error;
    showBanner('settings-banner', text, type);
}

async function loadMailStatus() {
    const res = await mailApi('status');
    if (!res.ok) {
        renderConnectionMessage(mailErrorMessage(res));
        return;
    }
    mailStatus = res;
    renderConnection();
}

function renderConnectionMessage(text) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = text;
    document.getElementById('mail-connection').replaceChildren(p);
    document.getElementById('mail-settings-card').classList.add('hidden');
}

function renderConnection() {
    const box = document.createElement('div');
    box.className = 'conn-box';

    const status = document.createElement('div');
    status.className = 'conn-status';
    const dot = document.createElement('span');
    dot.className = `conn-dot${mailStatus.connected ? '' : ' off'}`;
    const label = document.createElement('span');
    status.append(dot, label);

    const btn = document.createElement('button');
    btn.type = 'button';

    if (mailStatus.connected) {
        label.textContent = `Connecté : ${mailStatus.email}`;
        btn.className = 'logout-small-btn';
        btn.textContent = 'Déconnecter';
        btn.addEventListener('click', disconnectGmail);
    } else if (!mailStatus.mailAllowed) {
        label.textContent = 'Non disponible';
        const small = document.createElement('small');
        small.textContent = `La connexion d'une boîte mail est réservée aux ${mailStatus.minAge} ans et plus.`;
        status.appendChild(small);
    } else {
        label.textContent = 'Aucune boîte connectée';
        btn.className = 'primary-small-btn';
        btn.textContent = 'Connecter Gmail';
        btn.addEventListener('click', connectGmail);
    }

    box.appendChild(status);
    if (btn.textContent) box.appendChild(btn);
    document.getElementById('mail-connection').replaceChildren(box);

    const card = document.getElementById('mail-settings-card');
    card.classList.toggle('hidden', !mailStatus.connected);
    if (mailStatus.connected) fillSettingsForm(mailStatus.settings);
}

function fillSettingsForm(s) {
    document.getElementById('set-max').value = String(s.max_messages);
    document.getElementById('set-refresh').value = String(s.refresh_minutes);
    document.getElementById('set-unread').checked = s.unread_only;
}

async function connectGmail(event) {
    const btn = event.currentTarget;
    btn.disabled = true;
    hideBanner('settings-banner');
    const res = await mailApi('connect');
    if (!res.ok) {
        btn.disabled = false;
        showBanner('settings-banner', mailErrorMessage(res), 'error');
        return;
    }
    window.location.href = res.url; // page d'autorisation Google
}

async function disconnectGmail() {
    if (!confirm("Déconnecter ta boîte Gmail de Tempo ?\n\nL'accès sera révoqué chez Google. Tes mails ne sont pas touchés.")) return;
    hideBanner('settings-banner');
    const res = await mailApi('disconnect');
    if (!res.ok) {
        showBanner('settings-banner', mailErrorMessage(res), 'error');
        return;
    }
    showBanner('settings-banner', 'Gmail déconnecté.', 'info');
    await loadMailStatus();
}

async function saveMailSettings(event) {
    event.preventDefault();
    const btn = document.getElementById('save-settings-btn');
    btn.disabled = true;
    hideBanner('settings-banner');

    const res = await mailApi('save_settings', {
        max_messages: parseInt(document.getElementById('set-max').value, 10),
        refresh_minutes: parseInt(document.getElementById('set-refresh').value, 10),
        unread_only: document.getElementById('set-unread').checked
    });

    btn.disabled = false;
    if (!res.ok) {
        showBanner('settings-banner', mailErrorMessage(res), 'error');
        return;
    }
    mailStatus.settings = res.settings;
    showBanner('settings-banner', 'Réglages enregistrés ✓', 'info');
}
