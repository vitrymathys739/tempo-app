import type { Env } from './google.ts';

// Seules les origines listées (ALLOWED_ORIGINS, sinon l'origine de SITE_URL) peuvent appeler la fonction.
export function corsHeaders(req: Request, env: Env): Record<string, string> {
    const siteOrigin = (() => { try { return new URL(env.SITE_URL).origin; } catch { return ''; } })();
    const allowed = (env.ALLOWED_ORIGINS || siteOrigin).split(',').map(s => s.trim()).filter(Boolean);
    const origin = req.headers.get('Origin') || '';
    const base: Record<string, string> = {
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Vary': 'Origin',
    };
    if (origin && allowed.includes(origin)) base['Access-Control-Allow-Origin'] = origin;
    return base;
}
