// Fonction `gmail-oauth-callback` : Google y redirige l'utilisateur après son autorisation.
// Échange le code contre des jetons (le client_secret reste ici, côté serveur), chiffre le
// refresh_token et l'enregistre, puis renvoie l'utilisateur vers parametres.html.
import { ApiError, exchangeCode, gmailFetch, GMAIL_SCOPES, revokeToken, type Env } from '../_shared/google.ts';
import type { Db } from '../_shared/db.ts';
import { encryptToken, verifyState } from '../_shared/util.ts';

export interface Ctx {
    env: Env;
    db: Db;
    fetch: typeof fetch;
    now?: () => number;
}

function back(env: Env, result: string): Response {
    const base = env.SITE_URL.replace(/\/+$/, '');
    return new Response(null, { status: 302, headers: { Location: `${base}/parametres.html?gmail=${encodeURIComponent(result)}` } });
}

export async function handleCallback(req: Request, ctx: Ctx): Promise<Response> {
    const { env } = ctx;
    const url = new URL(req.url);

    if (url.searchParams.get('error')) return back(env, 'denied'); // l'utilisateur a refusé

    const code = url.searchParams.get('code');
    const state = await verifyState(url.searchParams.get('state') || '', env.STATE_SECRET, (ctx.now ?? Date.now)());
    if (!code || !state || typeof state.uid !== 'string') return back(env, 'error');

    try {
        const tokens = await exchangeCode(env, code, ctx.fetch);

        // L'utilisateur peut décocher des permissions sur l'écran de Google (consentement granulaire)
        const granted = String(tokens.scope || '').split(' ');
        if (!GMAIL_SCOPES.every(s => granted.includes(s))) {
            await revokeToken(tokens.refresh_token || tokens.access_token, ctx.fetch);
            return back(env, 'scopes');
        }
        if (!tokens.refresh_token) return back(env, 'error');

        const profile = await gmailFetch(tokens.access_token, '/profile', ctx.fetch);
        await ctx.db.upsertConnection({
            user_id: state.uid,
            email: profile.emailAddress,
            refresh_token_enc: await encryptToken(tokens.refresh_token, env.TOKEN_KEY),
            scopes: granted.join(' '),
        });
        return back(env, 'connected');
    } catch (e) {
        console.error('gmail callback error:', e instanceof ApiError ? e.code : (e instanceof Error ? e.message : e));
        return back(env, 'error');
    }
}
