// Fonction `gmail` : appelée par le navigateur (POST { action, ... }) avec le jeton de session Supabase.
// Actions : status, connect, disconnect, save_settings, list, get, send.
import { ApiError, buildAuthUrl, gmailFetch, refreshAccessToken, revokeToken, type Env } from '../_shared/google.ts';
import { corsHeaders } from '../_shared/cors.ts';
import type { Connection, Db } from '../_shared/db.ts';
import {
    ageFromBirthDate, buildRawMessage, cleanHeaderValue, decodeEntities, decryptToken,
    extractBody, getHeader, parseFrom, parseRecipients, signState,
} from '../_shared/util.ts';

export interface Ctx {
    env: Env;
    db: Db;
    fetch: typeof fetch;
    now?: () => number;
}

const MAX_BODY_CHARS = 20000;
const HEX_ID = /^[0-9a-f]{6,32}$/i;
const ALLOWED_MAX = [5, 10, 20];
const ALLOWED_REFRESH = [0, 2, 5, 10];

function json(data: unknown, status: number, cors: Record<string, string>) {
    return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

export async function handleGmail(req: Request, ctx: Ctx): Promise<Response> {
    const cors = corsHeaders(req, ctx.env);
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, cors);

    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const user = jwt ? await ctx.db.getUser(jwt) : null;
    if (!user) return json({ ok: false, error: 'unauthorized' }, 401, cors);

    let body: any;
    try { body = await req.json(); } catch { return json({ ok: false, error: 'bad_request' }, 400, cors); }

    try {
        const result = await route(body?.action, body || {}, user.id, ctx);
        return json({ ok: true, ...result }, 200, cors);
    } catch (e) {
        // Erreurs "attendues" : 200 + ok:false pour que le navigateur les gère simplement
        if (e instanceof ApiError) return json({ ok: false, error: e.code, message: e.message }, 200, cors);
        console.error('gmail function error:', e instanceof Error ? e.message : e);
        return json({ ok: false, error: 'server_error' }, 500, cors);
    }
}

async function route(action: string, body: any, userId: string, ctx: Ctx) {
    switch (action) {
        case 'status': return status(userId, ctx);
        case 'connect': return connect(userId, ctx);
        case 'disconnect': return disconnect(userId, ctx);
        case 'save_settings': return saveSettings(body, userId, ctx);
        case 'list': return list(userId, ctx);
        case 'get': return getMessage(body, userId, ctx);
        case 'send': return send(body, userId, ctx);
        default: throw new ApiError('unknown_action', 'Action inconnue');
    }
}

// ---------- helpers ----------
function minAge(ctx: Ctx): number {
    const n = parseInt(ctx.env.MAIL_MIN_AGE || '15', 10);
    return Number.isFinite(n) ? n : 15;
}

async function isAgeAllowed(userId: string, ctx: Ctx): Promise<boolean> {
    const birth = await ctx.db.getBirthDate(userId);
    if (!birth) return false;
    return ageFromBirthDate(birth, new Date((ctx.now ?? Date.now)())) >= minAge(ctx);
}

async function requireConnection(userId: string, ctx: Ctx): Promise<Connection> {
    const conn = await ctx.db.getConnection(userId);
    if (!conn) throw new ApiError('not_connected', "Aucune boîte Gmail n'est connectée");
    return conn;
}

async function accessTokenFor(conn: Connection, ctx: Ctx): Promise<string> {
    try {
        const refresh = await decryptToken(conn.refresh_token_enc, ctx.env.TOKEN_KEY);
        return await refreshAccessToken(ctx.env, refresh, ctx.fetch);
    } catch (e) {
        if (e instanceof ApiError && e.code === 'reconnect') {
            await ctx.db.deleteConnection(conn.user_id); // autorisation révoquée : on nettoie
        }
        throw e;
    }
}

function publicSettings(c: Connection) {
    return { max_messages: c.max_messages, unread_only: c.unread_only, refresh_minutes: c.refresh_minutes };
}

// ---------- actions ----------
async function status(userId: string, ctx: Ctx) {
    const allowed = await isAgeAllowed(userId, ctx);
    const conn = await ctx.db.getConnection(userId);
    return {
        connected: !!conn,
        email: conn?.email ?? null,
        settings: conn ? publicSettings(conn) : null,
        mailAllowed: allowed,
        minAge: minAge(ctx),
    };
}

async function connect(userId: string, ctx: Ctx) {
    if (!(await isAgeAllowed(userId, ctx))) {
        throw new ApiError('too_young', `La connexion à une boîte mail est réservée aux ${minAge(ctx)} ans et plus.`);
    }
    const nonce = crypto.randomUUID();
    const state = await signState({ uid: userId, nonce, exp: (ctx.now ?? Date.now)() + 10 * 60 * 1000 }, ctx.env.STATE_SECRET);
    return { url: buildAuthUrl(ctx.env, state) };
}

async function disconnect(userId: string, ctx: Ctx) {
    const conn = await ctx.db.getConnection(userId);
    if (conn) {
        try {
            await revokeToken(await decryptToken(conn.refresh_token_enc, ctx.env.TOKEN_KEY), ctx.fetch);
        } catch { /* on supprime quand même */ }
        await ctx.db.deleteConnection(userId);
    }
    return {};
}

async function saveSettings(body: any, userId: string, ctx: Ctx) {
    await requireConnection(userId, ctx);
    const max = Number(body.max_messages);
    const refresh = Number(body.refresh_minutes);
    if (!ALLOWED_MAX.includes(max) || !ALLOWED_REFRESH.includes(refresh) || typeof body.unread_only !== 'boolean') {
        throw new ApiError('invalid_settings', 'Réglages invalides');
    }
    const settings = { max_messages: max, unread_only: body.unread_only, refresh_minutes: refresh };
    await ctx.db.updateSettings(userId, settings);
    return { settings };
}

async function list(userId: string, ctx: Ctx) {
    const conn = await requireConnection(userId, ctx);
    const token = await accessTokenFor(conn, ctx);

    const q = new URLSearchParams({ maxResults: String(conn.max_messages) });
    q.append('labelIds', 'INBOX');
    if (conn.unread_only) q.append('labelIds', 'UNREAD');

    const [listing, inbox] = await Promise.all([
        gmailFetch(token, `/messages?${q}`, ctx.fetch),
        gmailFetch(token, '/labels/INBOX', ctx.fetch),
    ]);

    const meta = 'format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date';
    const messages = await Promise.all(
        (listing.messages || []).map((m: { id: string }) => gmailFetch(token, `/messages/${m.id}?${meta}`, ctx.fetch)),
    );

    return {
        unread: inbox.messagesUnread ?? 0,
        settings: publicSettings(conn),
        messages: messages.map((m: any) => {
            const from = parseFrom(getHeader(m.payload?.headers, 'From'));
            return {
                id: m.id,
                threadId: m.threadId,
                from: from.name,
                fromEmail: from.email,
                subject: getHeader(m.payload?.headers, 'Subject') || '(sans objet)',
                snippet: decodeEntities(m.snippet || ''),
                date: new Date(Number(m.internalDate)).toISOString(),
                unread: (m.labelIds || []).includes('UNREAD'),
            };
        }),
    };
}

async function getMessage(body: any, userId: string, ctx: Ctx) {
    if (typeof body.id !== 'string' || !HEX_ID.test(body.id)) throw new ApiError('bad_request', 'Identifiant invalide');
    const conn = await requireConnection(userId, ctx);
    const token = await accessTokenFor(conn, ctx);
    const m = await gmailFetch(token, `/messages/${body.id}?format=full`, ctx.fetch);
    const h = (name: string) => getHeader(m.payload?.headers, name);
    const from = parseFrom(h('From'));
    const replyTo = parseFrom(h('Reply-To') || h('From'));
    return {
        message: {
            id: m.id,
            threadId: m.threadId,
            from: from.name,
            fromEmail: from.email,
            replyToEmail: replyTo.email,
            to: h('To'),
            subject: h('Subject') || '(sans objet)',
            date: new Date(Number(m.internalDate)).toISOString(),
            body: extractBody(m.payload).slice(0, MAX_BODY_CHARS),
        },
    };
}

async function send(body: any, userId: string, ctx: Ctx) {
    const to = parseRecipients(body.to);
    if (!to) throw new ApiError('invalid_recipient', 'Adresse(s) du destinataire invalide(s) (5 maximum)');
    const subject = cleanHeaderValue(body.subject).slice(0, 200);
    const text = typeof body.body === 'string' ? body.body : '';
    if (!subject) throw new ApiError('invalid_message', "L'objet est obligatoire");
    if (!text.trim()) throw new ApiError('invalid_message', 'Le message est vide');
    if (text.length > MAX_BODY_CHARS) throw new ApiError('invalid_message', 'Message trop long');

    const conn = await requireConnection(userId, ctx);
    const token = await accessTokenFor(conn, ctx);

    let threadId: string | undefined;
    let inReplyTo: string | undefined;
    let references: string | undefined;
    if (body.replyToId !== undefined && body.replyToId !== null) {
        if (typeof body.replyToId !== 'string' || !HEX_ID.test(body.replyToId)) throw new ApiError('bad_request', 'Identifiant invalide');
        const orig = await gmailFetch(token, `/messages/${body.replyToId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`, ctx.fetch);
        threadId = orig.threadId;
        inReplyTo = getHeader(orig.payload?.headers, 'Message-ID') || undefined;
        references = [getHeader(orig.payload?.headers, 'References'), inReplyTo].filter(Boolean).join(' ') || undefined;
    }

    const raw = buildRawMessage({ to, subject, body: text, inReplyTo, references });
    await gmailFetch(token, '/messages/send', ctx.fetch, { method: 'POST', body: threadId ? { raw, threadId } : { raw } });
    return {};
}
