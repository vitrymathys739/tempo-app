// Point d'entrée Deno (Supabase Edge Function `gmail`).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createDb } from '../_shared/db.ts';
import type { Env } from '../_shared/google.ts';
import { handleGmail } from './handler.ts';

const env = Deno.env.toObject() as unknown as Env;
const admin = createClient(env.SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
});
const db = createDb(admin);

Deno.serve((req) => handleGmail(req, { env, db, fetch }));
