// Tests de la logique des Edge Functions, sans réseau ni Supabase (Google et la base sont simulés).
// Lancer :  node --experimental-strip-types --test supabase/tests/gmail.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as U from '../functions/_shared/util.ts';
import { handleGmail } from '../functions/gmail/handler.ts';
import { handleCallback } from '../functions/gmail-oauth-callback/handler.ts';

const KEY = Buffer.alloc(32, 7).toString('base64');
const env = {
    GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', STATE_SECRET: 'state-secret',
    TOKEN_KEY: KEY, SITE_URL: 'https://tempo.example/app/', SUPABASE_URL: 'https://abc.supabase.co',
};
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send';
const b64u = (s) => Buffer.from(s, 'utf8').toString('base64url');

// ---------- Faux Google ----------
function makeGoogle() {
    const calls = [];
    const msg = (id, extra = {}) => ({
        id, threadId: 't' + id, internalDate: '1763600000000', snippet: 'Salut &#39;toi&#39; &amp; co',
        labelIds: ['INBOX', 'UNREAD'],
        payload: { headers: [
            { name: 'From', value: '"Prof Martin" <martin@lycee.fr>' }, { name: 'Subject', value: 'Devoir de maths' },
            { name: 'Date', value: 'x' }, { name: 'Message-ID', value: '<abc@lycee.fr>' }, { name: 'References', value: '<old@lycee.fr>' },
        ] }, ...extra,
    });
    const fetchFn = async (url, init = {}) => {
        url = String(url);
        const method = init.method || 'GET';
        const body = init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : (init.body ? JSON.parse(init.body) : null);
        calls.push({ url, method, body, auth: init.headers?.Authorization });
        const ok = (data, status = 200) => new Response(JSON.stringify(data), { status });
        if (url.endsWith('/token')) {
            if (body.grant_type === 'authorization_code') {
                if (body.code === 'GOOD') return ok({ access_token: 'AT1', refresh_token: 'RT1', scope: SCOPES });
                if (body.code === 'PARTIAL') return ok({ access_token: 'AT1', refresh_token: 'RT1', scope: 'https://www.googleapis.com/auth/gmail.send' });
                return ok({ error: 'invalid_grant' }, 400);
            }
            if (body.refresh_token === 'RT1') return ok({ access_token: 'AT2' });
            return ok({ error: 'invalid_grant' }, 400);
        }
        if (url.endsWith('/revoke')) return ok({});
        if (url.endsWith('/profile')) return ok({ emailAddress: 'me@gmail.com' });
        if (url.includes('/labels/INBOX')) return ok({ messagesUnread: 3 });
        if (url.includes('/messages/send')) return ok({ id: 'sent1' });
        if (url.includes('/messages?')) return ok({ messages: [{ id: 'aaa111' }, { id: 'bbb222' }] });
        if (url.includes('format=full')) return ok(msg('aaa111', { payload: { headers: msg('x').payload.headers.concat([{ name: 'To', value: 'me@gmail.com' }]),
            mimeType: 'multipart/alternative', parts: [
                { mimeType: 'text/html', body: { data: b64u('<p>Version <b>HTML</b></p>') } },
                { mimeType: 'text/plain', body: { data: b64u('Version texte é') } } ] } }));
        if (/\/messages\/[0-9a-f]+/.test(url)) return ok(msg(url.match(/messages\/([0-9a-f]+)/)[1]));
        return ok({}, 404);
    };
    return { fetchFn, calls };
}

// ---------- Fausse base ----------
function makeDb({ birth = '2000-01-01' } = {}) {
    const rows = new Map();
    const db = {
        rows,
        getUser: async (jwt) => (jwt === 'valid-jwt' ? { id: 'u1' } : null),
        getBirthDate: async () => birth,
        getConnection: async (id) => rows.get(id) ?? null,
        upsertConnection: async (r) => { rows.set(r.user_id, { max_messages: 10, unread_only: false, refresh_minutes: 5, ...rows.get(r.user_id), ...r }); },
        updateSettings: async (id, s) => { Object.assign(rows.get(id), s); },
        deleteConnection: async (id) => { rows.delete(id); },
    };
    return db;
}

const call = async (ctx, action, extra = {}, { jwt = 'valid-jwt', origin } = {}) => {
    const headers = { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), ...(origin ? { Origin: origin } : {}) };
    const res = await handleGmail(new Request('https://x/functions/v1/gmail', { method: 'POST', headers, body: JSON.stringify({ action, ...extra }) }), ctx);
    return { status: res.status, headers: res.headers, data: await res.json() };
};

async function connected(ctx) {
    const state = await U.signState({ uid: 'u1', nonce: 'n', exp: Date.now() + 60000 }, env.STATE_SECRET);
    const r = await handleCallback(new Request(`https://x/cb?code=GOOD&state=${encodeURIComponent(state)}`), ctx);
    return r;
}

// ================= util =================
test('état signé : valide, falsifié, expiré', async () => {
    const t = await U.signState({ uid: 'u1', exp: Date.now() + 1000 }, 's');
    assert.equal((await U.verifyState(t, 's')).uid, 'u1');
    assert.equal(await U.verifyState(t, 'autre-secret'), null);
    const [body, sig] = t.split('.');
    assert.equal(await U.verifyState(U.b64urlEncode(JSON.stringify({ uid: 'u2', exp: Date.now() + 1000 })) + '.' + sig, 's'), null);
    assert.equal(await U.verifyState(t, 's', Date.now() + 5000), null);
    assert.equal(await U.verifyState('n-importe-quoi', 's'), null);
});

test('chiffrement du jeton : aller-retour, aléatoire, mauvaise clé refusée', async () => {
    const a = await U.encryptToken('refresh-token', KEY);
    const b = await U.encryptToken('refresh-token', KEY);
    assert.notEqual(a, b);
    assert.ok(!a.includes('refresh-token'));
    assert.equal(await U.decryptToken(a, KEY), 'refresh-token');
    await assert.rejects(U.decryptToken(a, Buffer.alloc(32, 9).toString('base64')));
});

test('message sortant : UTF-8, pas d\'injection d\'en-têtes, fil de réponse', () => {
    const raw = U.buildRawMessage({ to: ['a@b.fr'], subject: 'Re: Réunion 🎉\r\nBcc: evil@x.com', body: 'Bonjour é\nligne 2', inReplyTo: '<id@x>', references: '<r@x> <id@x>' });
    const text = Buffer.from(raw, 'base64url').toString('utf8');
    const [head, bodyB64] = text.split('\r\n\r\n');
    assert.ok(!/^Bcc:/mi.test(head));
    assert.match(head, /^Subject: =\?UTF-8\?B\?/m);
    assert.match(head, /^In-Reply-To: <id@x>$/m);
    assert.match(head, /^References: <r@x> <id@x>$/m);
    assert.equal(Buffer.from(bodyB64.replace(/\r\n/g, ''), 'base64').toString('utf8'), 'Bonjour é\r\nligne 2');
});

test('lecture : texte brut prioritaire, HTML converti sinon, from, entités, destinataires, âge', () => {
    const html = { mimeType: 'text/html', body: { data: b64u('<style>x{}</style><p>Salut&nbsp;&amp; <b>toi</b></p><br>Fin') } };
    assert.equal(U.extractBody({ mimeType: 'multipart/alternative', parts: [html] }), 'Salut & toi\n\nFin');
    assert.equal(U.extractBody({ parts: [html, { mimeType: 'text/plain', body: { data: b64u('brut') } }] }), 'brut');
    assert.deepEqual(U.parseFrom('"Prof, Martin" <m@l.fr>'), { name: 'Prof, Martin', email: 'm@l.fr' });
    assert.deepEqual(U.parseFrom('solo@l.fr'), { name: 'solo@l.fr', email: 'solo@l.fr' });
    assert.equal(U.decodeEntities('l&#39;été &amp; &#x41;'), "l'été & A");
    assert.deepEqual(U.parseRecipients('a@b.fr, c@d.com'), ['a@b.fr', 'c@d.com']);
    assert.equal(U.parseRecipients('a@b.fr, pas-un-mail'), null);
    assert.equal(U.parseRecipients('a@b.fr,b@b.fr,c@b.fr,d@b.fr,e@b.fr,f@b.fr'), null);
    assert.equal(U.ageFromBirthDate('2010-06-15', new Date('2026-06-14')), 15);
    assert.equal(U.ageFromBirthDate('2010-06-15', new Date('2026-06-15')), 16);
});

// ================= fonction gmail =================
test('accès : sans jeton ou jeton invalide -> 401 ; CORS limité à notre site', async () => {
    const { fetchFn } = makeGoogle();
    const ctx = { env, db: makeDb(), fetch: fetchFn };
    assert.equal((await call(ctx, 'status', {}, { jwt: null })).status, 401);
    assert.equal((await call(ctx, 'status', {}, { jwt: 'faux' })).status, 401);
    assert.equal((await call(ctx, 'status', {}, { origin: 'https://tempo.example' })).headers.get('access-control-allow-origin'), 'https://tempo.example');
    assert.equal((await call(ctx, 'status', {}, { origin: 'https://evil.example' })).headers.get('access-control-allow-origin'), null);
    assert.equal((await call(ctx, 'nimporte')).data.error, 'unknown_action');
});

test('connexion : URL Google correcte, mineur refusé, retour OAuth enregistre un jeton chiffré', async () => {
    const g = makeGoogle();
    const db = makeDb();
    const ctx = { env, db, fetch: g.fetchFn };

    const start = await call(ctx, 'connect');
    const u = new URL(start.data.url);
    assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.equal(u.searchParams.get('scope'), SCOPES);
    assert.equal(u.searchParams.get('access_type'), 'offline');
    assert.equal(u.searchParams.get('redirect_uri'), 'https://abc.supabase.co/functions/v1/gmail-oauth-callback');
    assert.equal((await U.verifyState(u.searchParams.get('state'), env.STATE_SECRET)).uid, 'u1');

    const young = await call({ ...ctx, db: makeDb({ birth: '2015-01-01' }) }, 'connect');
    assert.equal(young.data.error, 'too_young');

    const r = await connected(ctx);
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), 'https://tempo.example/app/parametres.html?gmail=connected');
    const row = db.rows.get('u1');
    assert.equal(row.email, 'me@gmail.com');
    assert.ok(!JSON.stringify(row).includes('RT1'), 'refresh token jamais en clair');
    assert.equal(await U.decryptToken(row.refresh_token_enc, KEY), 'RT1');

    const st = await call(ctx, 'status');
    assert.deepEqual([st.data.connected, st.data.email, st.data.mailAllowed], [true, 'me@gmail.com', true]);
});

test('retour OAuth : refus, état falsifié, permissions décochées', async () => {
    const g = makeGoogle(); const db = makeDb(); const ctx = { env, db, fetch: g.fetchFn };
    const loc = async (qs) => (await handleCallback(new Request('https://x/cb?' + qs), ctx)).headers.get('location');
    assert.match(await loc('error=access_denied'), /gmail=denied$/);
    assert.match(await loc('code=GOOD&state=forge'), /gmail=error&reason=state$/);
    const state = await U.signState({ uid: 'u1', exp: Date.now() + 60000 }, env.STATE_SECRET);
    assert.match(await loc(`code=PARTIAL&state=${encodeURIComponent(state)}`), /gmail=scopes$/);
    assert.equal(db.rows.size, 0);
    assert.ok(g.calls.some(c => c.url.endsWith('/revoke')), 'jeton partiel révoqué');
    assert.match(await loc(`code=BAD&state=${encodeURIComponent(state)}`), /gmail=error&reason=oauth$/);
    // API Gmail non activée (403 sur /profile) -> cause « gmail_api »
    const noApi = { env, db, fetch: async (u, i) => String(u).endsWith('/profile') ? new Response('{}', { status: 403 }) : g.fetchFn(u, i) };
    assert.match((await handleCallback(new Request(`https://x/cb?code=GOOD&state=${encodeURIComponent(state)}`), noApi)).headers.get('location'), /reason=gmail_api$/);
    // Table absente / écriture impossible -> cause « storage »
    const noTable = { env, db: { ...db, upsertConnection: async () => { throw new Error('relation does not exist'); } }, fetch: g.fetchFn };
    assert.match((await handleCallback(new Request(`https://x/cb?code=GOOD&state=${encodeURIComponent(state)}`), noTable)).headers.get('location'), /reason=storage$/);
    // Mauvaise clé de chiffrement -> cause « storage »
    const badKey = { env: { ...env, TOKEN_KEY: 'trop-court' }, db, fetch: g.fetchFn };
    assert.match((await handleCallback(new Request(`https://x/cb?code=GOOD&state=${encodeURIComponent(state)}`), badKey)).headers.get('location'), /reason=storage$/);
});

test('lecture de la boîte : liste, non-lus, réglages, message complet', async () => {
    const g = makeGoogle(); const db = makeDb(); const ctx = { env, db, fetch: g.fetchFn };
    await connected(ctx); g.calls.length = 0;

    const l = await call(ctx, 'list');
    assert.equal(l.data.unread, 3);
    assert.equal(l.data.messages.length, 2);
    assert.deepEqual(l.data.messages[0], { id: 'aaa111', threadId: 'taaa111', from: 'Prof Martin', fromEmail: 'martin@lycee.fr', subject: 'Devoir de maths', snippet: "Salut 'toi' & co", date: '2025-11-20T00:53:20.000Z', unread: true });
    assert.ok(g.calls.filter(c => c.auth).every(c => c.auth === 'Bearer AT2'), 'access token rafraîchi utilisé');
    assert.ok(g.calls.some(c => c.url.includes('maxResults=10') && c.url.includes('labelIds=INBOX') && !c.url.includes('UNREAD')));

    assert.equal((await call(ctx, 'save_settings', { max_messages: 20, unread_only: true, refresh_minutes: 2 })).data.settings.max_messages, 20);
    g.calls.length = 0; await call(ctx, 'list');
    assert.ok(g.calls.some(c => c.url.includes('maxResults=20') && c.url.includes('labelIds=UNREAD')));
    assert.equal((await call(ctx, 'save_settings', { max_messages: 999, unread_only: true, refresh_minutes: 2 })).data.error, 'invalid_settings');
    assert.equal((await call(ctx, 'save_settings', { max_messages: 5, unread_only: 'oui', refresh_minutes: 2 })).data.error, 'invalid_settings');

    const m = await call(ctx, 'get', { id: 'aaa111' });
    assert.equal(m.data.message.body, 'Version texte é');
    assert.equal(m.data.message.to, 'me@gmail.com');
    assert.equal((await call(ctx, 'get', { id: '../../etc' })).data.error, 'bad_request');
});

test('envoi : réponse dans le fil, validations, jeton révoqué -> reconnexion', async () => {
    const g = makeGoogle(); const db = makeDb(); const ctx = { env, db, fetch: g.fetchFn };
    assert.equal((await call(ctx, 'send', { to: 'a@b.fr', subject: 's', body: 'b' })).data.error, 'not_connected');
    await connected(ctx); g.calls.length = 0;

    const r = await call(ctx, 'send', { to: 'martin@lycee.fr', subject: 'Re: Devoir de maths', body: 'Merci !', replyToId: 'aaa111' });
    assert.equal(r.data.ok, true);
    const sent = g.calls.find(c => c.url.endsWith('/messages/send'));
    assert.equal(sent.body.threadId, 'taaa111');
    const mime = Buffer.from(sent.body.raw, 'base64url').toString('utf8');
    assert.match(mime, /In-Reply-To: <abc@lycee.fr>/);
    assert.match(mime, /References: <old@lycee.fr> <abc@lycee.fr>/);

    assert.equal((await call(ctx, 'send', { to: 'nope', subject: 's', body: 'b' })).data.error, 'invalid_recipient');
    assert.equal((await call(ctx, 'send', { to: 'a@b.fr', subject: '', body: 'b' })).data.error, 'invalid_message');
    assert.equal((await call(ctx, 'send', { to: 'a@b.fr', subject: 's', body: '   ' })).data.error, 'invalid_message');

    // Google a révoqué l'autorisation -> on supprime la connexion et on demande de se reconnecter
    db.rows.get('u1').refresh_token_enc = await U.encryptToken('REVOKED', KEY);
    const e = await call(ctx, 'list');
    assert.equal(e.data.error, 'reconnect');
    assert.equal(db.rows.has('u1'), false);
});

test('déconnexion : révoque chez Google et supprime la ligne', async () => {
    const g = makeGoogle(); const db = makeDb(); const ctx = { env, db, fetch: g.fetchFn };
    await connected(ctx); g.calls.length = 0;
    assert.equal((await call(ctx, 'disconnect')).data.ok, true);
    assert.equal(db.rows.size, 0);
    const rev = g.calls.find(c => c.url.endsWith('/revoke'));
    assert.equal(rev.body.token, 'RT1');
});
