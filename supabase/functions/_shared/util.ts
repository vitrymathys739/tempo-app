// Utilitaires purs (sans dépendance Deno) : testables avec Node.
// Utilisés par les Edge Functions `gmail` et `gmail-oauth-callback`.

const enc = new TextEncoder();
const dec = new TextDecoder();

// ---------- Base64 ----------
export function bytesToB64(bytes: Uint8Array): string {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
}

export function b64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

export function b64urlEncode(input: Uint8Array | string): string {
    const bytes = typeof input === 'string' ? enc.encode(input) : input;
    return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s: string): Uint8Array {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    return b64ToBytes(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
}

export function b64urlDecodeToString(s: string): string {
    return dec.decode(b64urlDecode(s));
}

// ---------- État OAuth signé (anti-CSRF, lie le retour de Google à l'utilisateur) ----------
async function hmacKey(secret: string, usage: 'sign' | 'verify') {
    return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

export async function signState(payload: Record<string, unknown>, secret: string): Promise<string> {
    const body = b64urlEncode(JSON.stringify(payload));
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), enc.encode(body)));
    return `${body}.${b64urlEncode(sig)}`;
}

// Retourne le contenu si la signature est valide et non expirée, sinon null
export async function verifyState(token: string, secret: string, nowMs = Date.now()): Promise<Record<string, any> | null> {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    try {
        const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), b64urlDecode(parts[1]), enc.encode(parts[0]));
        if (!ok) return null;
        const payload = JSON.parse(b64urlDecodeToString(parts[0]));
        if (typeof payload.exp !== 'number' || payload.exp < nowMs) return null;
        return payload;
    } catch {
        return null;
    }
}

// ---------- Chiffrement du jeton (AES-256-GCM) ----------
async function aesKey(keyB64: string) {
    const raw = b64ToBytes(keyB64);
    if (raw.length !== 32) throw new Error('TOKEN_KEY doit faire 32 octets (base64)');
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptToken(plain: string, keyB64: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(keyB64), enc.encode(plain)));
    return `${bytesToB64(iv)}.${bytesToB64(ct)}`;
}

export async function decryptToken(blob: string, keyB64: string): Promise<string> {
    const [iv, ct] = blob.split('.');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(iv) }, await aesKey(keyB64), b64ToBytes(ct));
    return dec.decode(plain);
}

// ---------- Emails ----------
const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;

export function isValidEmail(s: string): boolean {
    return typeof s === 'string' && s.length <= 254 && EMAIL_RE.test(s.trim());
}

// Accepte "a@b.fr, c@d.fr" -> tableau d'adresses valides (ou null si l'une est invalide)
export function parseRecipients(input: string, max = 5): string[] | null {
    if (typeof input !== 'string') return null;
    const list = input.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
    if (list.length === 0 || list.length > max) return null;
    return list.every(isValidEmail) ? list : null;
}

// Supprime les retours à la ligne (empêche l'injection d'en-têtes mail)
export function cleanHeaderValue(s: string): string {
    return String(s ?? '').replace(/[\r\n]+/g, ' ').trim();
}

// RFC 2047 : sujet avec accents / emoji
export function encodeHeaderWord(s: string): string {
    const clean = cleanHeaderValue(s);
    // deno-lint-ignore no-control-regex
    if (/^[\x20-\x7e]*$/.test(clean)) return clean;
    return `=?UTF-8?B?${bytesToB64(enc.encode(clean))}?=`;
}

function wrap76(b64: string): string {
    return b64.replace(/(.{76})/g, '$1\r\n');
}

export function buildRawMessage(opts: {
    to: string[]; subject: string; body: string; inReplyTo?: string; references?: string;
}): string {
    const headers = [
        `To: ${opts.to.map(cleanHeaderValue).join(', ')}`,
        `Subject: ${encodeHeaderWord(opts.subject)}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
    ];
    if (opts.inReplyTo) headers.push(`In-Reply-To: ${cleanHeaderValue(opts.inReplyTo)}`);
    if (opts.references) headers.push(`References: ${cleanHeaderValue(opts.references)}`);
    const body = wrap76(bytesToB64(enc.encode(opts.body.replace(/\r?\n/g, '\r\n'))));
    return b64urlEncode(`${headers.join('\r\n')}\r\n\r\n${body}`);
}

// ---------- Lecture des mails ----------
export function getHeader(headers: { name: string; value: string }[] | undefined, name: string): string {
    const h = (headers || []).find(x => x.name.toLowerCase() === name.toLowerCase());
    return h ? h.value : '';
}

// "Prénom Nom <a@b.fr>" -> { name, email }
export function parseFrom(value: string): { name: string; email: string } {
    const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(value || '');
    if (m) return { name: m[1].trim() || m[2].trim(), email: m[2].trim() };
    const v = (value || '').trim();
    return { name: v, email: v };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
    return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
        if (e[0] === '#') {
            const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
            return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
        }
        return ENTITIES[e.toLowerCase()] ?? m;
    });
}

export function htmlToText(html: string): string {
    return decodeEntities(
        html
            .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
            .replace(/<[^>]+>/g, '')
    ).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Cherche le texte brut (sinon le HTML converti) dans l'arbre MIME d'un message Gmail
export function extractBody(payload: any): string {
    let plain = '';
    let html = '';
    const walk = (part: any) => {
        if (!part) return;
        const data = part.body && part.body.data;
        if (data && part.mimeType === 'text/plain' && !plain) plain = b64urlDecodeToString(data);
        else if (data && part.mimeType === 'text/html' && !html) html = b64urlDecodeToString(data);
        (part.parts || []).forEach(walk);
    };
    walk(payload);
    return (plain || (html ? htmlToText(html) : '')).trim();
}

// ---------- Âge ----------
export function ageFromBirthDate(birthDate: string, now = new Date()): number {
    const b = new Date(birthDate);
    let age = now.getUTCFullYear() - b.getUTCFullYear();
    const m = now.getUTCMonth() - b.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age--;
    return age;
}
