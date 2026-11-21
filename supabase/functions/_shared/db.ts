// Accès base de données (clé service_role : jamais exposée au navigateur).
// Interface volontairement petite pour pouvoir la simuler dans les tests.

export interface Connection {
    user_id: string;
    email: string;
    refresh_token_enc: string;
    scopes: string;
    max_messages: number;
    unread_only: boolean;
    refresh_minutes: number;
}

export interface Db {
    getUser(jwt: string): Promise<{ id: string } | null>;
    getBirthDate(userId: string): Promise<string | null>;
    getConnection(userId: string): Promise<Connection | null>;
    upsertConnection(row: { user_id: string; email: string; refresh_token_enc: string; scopes: string }): Promise<void>;
    updateSettings(userId: string, s: { max_messages: number; unread_only: boolean; refresh_minutes: number }): Promise<void>;
    deleteConnection(userId: string): Promise<void>;
}

// `admin` = client Supabase créé avec la clé service_role
export function createDb(admin: any): Db {
    const check = ({ error }: { error: any }) => { if (error) throw new Error(error.message); };
    return {
        async getUser(jwt) {
            const { data, error } = await admin.auth.getUser(jwt);
            return error || !data?.user ? null : { id: data.user.id };
        },
        async getBirthDate(userId) {
            const { data } = await admin.from('profiles').select('birth_date').eq('id', userId).maybeSingle();
            return data?.birth_date ?? null;
        },
        async getConnection(userId) {
            const { data, error } = await admin.from('gmail_connections').select('*').eq('user_id', userId).maybeSingle();
            if (error) throw new Error(error.message);
            return data;
        },
        async upsertConnection(row) {
            check(await admin.from('gmail_connections').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }));
        },
        async updateSettings(userId, s) {
            check(await admin.from('gmail_connections').update({ ...s, updated_at: new Date().toISOString() }).eq('user_id', userId));
        },
        async deleteConnection(userId) {
            check(await admin.from('gmail_connections').delete().eq('user_id', userId));
        },
    };
}
