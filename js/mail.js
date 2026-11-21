/* ==========================================================================
   Client de l'API mail de Tempo (partagé : accueil.html + parametres.html)
   Le navigateur ne parle JAMAIS à Gmail directement : il appelle la fonction
   Supabase « gmail », qui détient les jetons et le secret Google.
   ========================================================================== */

const MAIL_ERROR_MESSAGES = {
    not_connected: "Aucune boîte Gmail n'est connectée.",
    reconnect: 'Ta connexion Gmail a expiré. Reconnecte ta boîte dans les paramètres.',
    forbidden: 'Permission Gmail manquante : reconnecte ta boîte dans les paramètres.',
    rate_limited: 'Trop de requêtes, réessaie dans un instant.',
    invalid_recipient: 'Adresse du destinataire invalide (5 destinataires maximum).',
    invalid_message: "Message incomplet (objet ou texte manquant, ou texte trop long).",
    invalid_settings: 'Réglages invalides.',
    unauthorized: 'Session expirée : reconnecte-toi à Tempo.',
    network: "Impossible de joindre le service mail. Vérifie ta connexion et que la fonction Supabase « gmail » est déployée.",
    server_error: 'Erreur du service mail. Réessaie plus tard.'
};

// Appelle une action de la fonction « gmail ». Retourne toujours un objet { ok, ... }.
async function mailApi(action, payload = {}) {
    try {
        const { data, error } = await supabaseClient.functions.invoke('gmail', { body: { action, ...payload } });
        if (error || !data) return { ok: false, error: 'network' };
        return data;
    } catch (e) {
        return { ok: false, error: 'network' };
    }
}

function mailErrorMessage(res) {
    // Les messages du serveur sont précis pour ces codes (ex. l'âge minimum)
    if (res.message && ['too_young', 'invalid_recipient', 'invalid_message'].includes(res.error)) return res.message;
    return MAIL_ERROR_MESSAGES[res.error] || res.message || "Une erreur est survenue.";
}

function formatMailDate(iso) {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    const opts = d.getFullYear() === now.getFullYear()
        ? { day: 'numeric', month: 'short' }
        : { day: 'numeric', month: 'short', year: 'numeric' };
    return d.toLocaleDateString('fr-FR', opts);
}
