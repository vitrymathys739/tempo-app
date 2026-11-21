// Appels à l'API Google (OAuth + Gmail). `fetchFn` est injecté pour pouvoir tester sans réseau.

export class ApiError extends Error {
    code: string;
    constructor(code: string, message?: string) {
        super(message || code);
        this.code = code;
    }
}

export interface Env {
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    STATE_SECRET: string;
    TOKEN_KEY: string;
    SITE_URL: string;
    SUPABASE_URL: string;
    ALLOWED_ORIGINS?: string;
    MAIL_MIN_AGE?: string;
}

// Lecture seule + envoi. Rien de plus (pas de suppression, pas de modification).
export const GMAIL_SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
];

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export function redirectUri(env: Env): string {
    return `${env.SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/gmail-oauth-callback`;
}

export function buildAuthUrl(env: Env, state: string): string {
    const p = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri(env),
        response_type: 'code',
        scope: GMAIL_SCOPES.join(' '),
        access_type: 'offline',   // pour obtenir un refresh_token
        prompt: 'consent',        // force le refresh_token même après une 1re autorisation
        state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(params: Record<string, string>, fetchFn: typeof fetch) {
    const res = await fetchFn('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        if (data.error === 'invalid_grant') throw new ApiError('reconnect', 'Autorisation expirée ou révoquée');
        throw new ApiError('oauth_error', data.error_description || data.error || 'Erreur OAuth');
    }
    return data;
}

export function exchangeCode(env: Env, code: string, fetchFn: typeof fetch) {
    return tokenRequest({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(env),
        grant_type: 'authorization_code',
    }, fetchFn);
}

export async function refreshAccessToken(env: Env, refreshToken: string, fetchFn: typeof fetch): Promise<string> {
    const data = await tokenRequest({
        refresh_token: refreshToken,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
    }, fetchFn);
    return data.access_token;
}

export async function revokeToken(token: string, fetchFn: typeof fetch): Promise<void> {
    try {
        await fetchFn('https://oauth2.googleapis.com/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token }),
        });
    } catch { /* best effort : la ligne est supprimée de toute façon */ }
}

export async function gmailFetch(accessToken: string, path: string, fetchFn: typeof fetch, init: { method?: string; body?: unknown } = {}) {
    const res = await fetchFn(`${GMAIL_API}${path}`, {
        method: init.method || 'GET',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) {
        if (res.status === 401) throw new ApiError('reconnect', 'Session Gmail expirée');
        if (res.status === 403) throw new ApiError('forbidden', 'Permission Gmail manquante : reconnecte ta boîte');
        if (res.status === 404) throw new ApiError('not_found', 'Message introuvable');
        if (res.status === 429) throw new ApiError('rate_limited', 'Trop de requêtes, réessaie dans un instant');
        throw new ApiError('gmail_error', `Erreur Gmail (${res.status})`);
    }
    return res.json();
}
