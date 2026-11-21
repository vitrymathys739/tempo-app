/* ==========================================================================
   Widget « Boîte mail » de l'accueil : liste, lecture, réponse, nouveau message,
   création d'un créneau / d'une habitude à partir d'un mail.
   Tout le texte venant des mails est inséré avec textContent (jamais innerHTML).
   ========================================================================== */

let mailTimer = null;
let currentMail = null;        // message ouvert dans la fenêtre de lecture
let composeReplyToId = null;   // id du message auquel on répond (null = nouveau message)
let mailToastTimer = null;

async function initMailbox() {
    renderMailMessage('Chargement de ta boîte mail…');
    const st = await mailApi('status');
    if (!st.ok) return renderMailError(st);

    if (!st.connected) return renderMailNotConnected(st);

    await loadMailbox();
    startMailAutoRefresh(st.settings.refresh_minutes);
}

function startMailAutoRefresh(minutes) {
    if (mailTimer) clearInterval(mailTimer);
    mailTimer = null;
    if (!minutes) return;
    mailTimer = setInterval(() => {
        if (!document.hidden) loadMailbox({ silent: true });
    }, minutes * 60 * 1000);
}

async function refreshMailbox() {
    const btn = document.getElementById('mail-refresh-btn');
    btn.disabled = true;
    await loadMailbox();
    btn.disabled = false;
}

async function loadMailbox({ silent = false } = {}) {
    if (!silent) renderMailMessage('Chargement…');
    const res = await mailApi('list');
    if (!res.ok) {
        if (silent) return; // on garde l'affichage précédent
        return renderMailError(res);
    }
    renderMailList(res);
}

// ---------- rendu ----------
function mailBody() { return document.getElementById('mail-body'); }

function setUnreadBadge(count) {
    const badge = document.getElementById('mail-unread');
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.toggle('hidden', !count);
}

function setMailActionsEnabled(enabled) {
    document.getElementById('mail-compose-btn').classList.toggle('hidden', !enabled);
    document.getElementById('mail-refresh-btn').classList.toggle('hidden', !enabled);
}

function renderMailMessage(text) {
    setMailActionsEnabled(false);
    const p = document.createElement('p');
    p.className = 'mail-empty';
    p.textContent = text;
    mailBody().replaceChildren(p);
}

function renderMailNotConnected(st) {
    setUnreadBadge(0);
    setMailActionsEnabled(false);
    const box = document.createElement('div');
    box.className = 'mail-cta';
    const p = document.createElement('p');
    const btn = document.createElement('button');
    btn.className = 'primary-small-btn';
    btn.textContent = 'Connecter ma boîte Gmail';
    btn.addEventListener('click', () => { window.location.href = PAGES.settings; });
    if (st.mailAllowed === false) {
        p.textContent = `La connexion d'une boîte mail est réservée aux ${st.minAge} ans et plus.`;
        box.append(p);
    } else {
        p.textContent = 'Connecte ta boîte Gmail pour voir tes mails non lus, y répondre et les transformer en créneaux ou en habitudes.';
        box.append(p, btn);
    }
    mailBody().replaceChildren(box);
}

function renderMailError(res) {
    setMailActionsEnabled(false);
    const box = document.createElement('div');
    box.className = 'mail-cta';
    const p = document.createElement('p');
    p.textContent = mailErrorMessage(res);
    const btn = document.createElement('button');
    btn.className = 'logout-small-btn';
    const needsSettings = ['reconnect', 'forbidden', 'not_connected'].includes(res.error);
    btn.textContent = needsSettings ? 'Ouvrir les paramètres' : 'Réessayer';
    btn.addEventListener('click', () => {
        if (needsSettings) window.location.href = PAGES.settings;
        else initMailbox();
    });
    box.append(p, btn);
    mailBody().replaceChildren(box);
}

function renderMailList(res) {
    setUnreadBadge(res.unread);
    setMailActionsEnabled(true);

    if (res.messages.length === 0) {
        const p = document.createElement('p');
        p.className = 'mail-empty';
        p.textContent = res.settings.unread_only ? 'Aucun mail non lu. 🎉' : 'Ta boîte de réception est vide.';
        mailBody().replaceChildren(p);
        return;
    }

    const list = document.createElement('div');
    list.className = 'mail-list';
    res.messages.forEach(m => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = `mail-row${m.unread ? ' unread' : ''}`;

        const from = document.createElement('span');
        from.className = 'mail-from';
        from.textContent = m.from;

        const subject = document.createElement('span');
        subject.className = 'mail-subject';
        subject.textContent = m.subject;

        const snippet = document.createElement('span');
        snippet.className = 'mail-snippet';
        snippet.textContent = m.snippet;

        const date = document.createElement('span');
        date.className = 'mail-date';
        date.textContent = formatMailDate(m.date);

        row.append(from, date, subject, snippet);
        row.addEventListener('click', () => openMailMessage(m.id));
        list.appendChild(row);
    });
    mailBody().replaceChildren(list);
}

// ---------- lecture d'un mail ----------
async function openMailMessage(id) {
    currentMail = null;
    setReadModal({ title: 'Chargement…', meta: '', body: '' }, false);
    document.getElementById('mail-modal').classList.remove('hidden');

    const res = await mailApi('get', { id });
    if (!res.ok) {
        setReadModal({ title: 'Impossible de lire ce mail', meta: '', body: mailErrorMessage(res) }, false);
        return;
    }
    currentMail = res.message;
    const m = res.message;
    setReadModal({
        title: m.subject,
        meta: `De : ${m.from} <${m.fromEmail}>\nLe ${new Date(m.date).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}`,
        body: m.body || '(Ce message ne contient pas de texte lisible.)'
    }, true);
}

function setReadModal({ title, meta, body }, showActions) {
    document.getElementById('mail-read-title').textContent = title;
    document.getElementById('mail-read-meta').textContent = meta;
    document.getElementById('mail-read-text').textContent = body;
    document.getElementById('mail-read-actions').classList.toggle('hidden', !showActions);
    document.getElementById('mail-habit-btn').textContent = '✅ Ajouter aux habitudes';
    document.getElementById('mail-habit-btn').disabled = false;
}

function closeMailModal() {
    document.getElementById('mail-modal').classList.add('hidden');
    currentMail = null;
}

function closeMailModalOnBackdrop(e) {
    if (e.target.id === 'mail-modal') closeMailModal();
}

// Mail -> créneau de l'emploi du temps (prochaine heure pleine, aujourd'hui)
function mailToSlot() {
    if (!currentMail) return;
    const m = currentMail;
    const jsDay = new Date().getDay();
    const todayIndex = jsDay === 0 ? 6 : jsDay - 1;
    const nextHour = Math.min(21, Math.max(START_HOUR, new Date().getHours() + 1));
    closeMailModal();
    openSlotModal(todayIndex, `${String(nextHour).padStart(2, '0')}:00`, {
        title: m.subject.slice(0, 60),
        room: `Mail de ${m.from}`.slice(0, 40)
    });
}

// Mail -> habitude / tâche du jour
function mailToRoutine() {
    if (!currentMail) return;
    addRoutineFromTitle(currentMail.subject);
    const btn = document.getElementById('mail-habit-btn');
    btn.textContent = '✓ Ajouté aux habitudes';
    btn.disabled = true;
}

// ---------- rédaction / réponse ----------
function openComposeModal(prefill = {}) {
    composeReplyToId = prefill.replyToId || null;
    document.getElementById('compose-title').textContent = composeReplyToId ? 'Répondre' : 'Nouveau message';
    document.getElementById('compose-to').value = prefill.to || '';
    document.getElementById('compose-subject').value = prefill.subject || '';
    document.getElementById('compose-body').value = prefill.body || '';
    hideBanner('compose-banner');
    document.getElementById('compose-modal').classList.remove('hidden');
    const focusId = prefill.to ? 'compose-body' : 'compose-to';
    const el = document.getElementById(focusId);
    el.focus();
    if (focusId === 'compose-body') el.setSelectionRange(0, 0);
}

function closeComposeModal() {
    document.getElementById('compose-modal').classList.add('hidden');
    composeReplyToId = null;
}

function closeComposeModalOnBackdrop(e) {
    if (e.target.id === 'compose-modal') closeComposeModal();
}

function replyToCurrentMail() {
    if (!currentMail) return;
    const m = currentMail;
    const quoted = m.body.split('\n').slice(0, 15).map(l => `> ${l}`).join('\n');
    const when = new Date(m.date).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
    const prefill = {
        to: m.replyToEmail || m.fromEmail,
        subject: /^re\s*:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`,
        body: `\n\nLe ${when}, ${m.from} a écrit :\n${quoted}`,
        replyToId: m.id
    };
    closeMailModal();
    openComposeModal(prefill);
}

async function sendMail(event) {
    event.preventDefault();
    const btn = document.getElementById('compose-send-btn');
    btn.disabled = true;
    btn.textContent = 'Envoi…';
    hideBanner('compose-banner');

    const res = await mailApi('send', {
        to: document.getElementById('compose-to').value,
        subject: document.getElementById('compose-subject').value,
        body: document.getElementById('compose-body').value,
        replyToId: composeReplyToId
    });

    btn.disabled = false;
    btn.textContent = 'Envoyer';
    if (!res.ok) {
        showBanner('compose-banner', mailErrorMessage(res), 'error');
        return;
    }
    closeComposeModal();
    showMailToast('Message envoyé ✓');
}

function showMailToast(text) {
    const toast = document.getElementById('mail-toast');
    toast.textContent = text;
    toast.classList.remove('hidden');
    clearTimeout(mailToastTimer);
    mailToastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
}
