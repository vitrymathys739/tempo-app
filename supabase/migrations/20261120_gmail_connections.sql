-- Connexion Gmail : une ligne par utilisateur.
-- Le jeton de rafraîchissement est stocké CHIFFRÉ (AES-GCM) par les Edge Functions.
create table if not exists public.gmail_connections (
    user_id           uuid primary key references auth.users(id) on delete cascade,
    email             text not null,
    refresh_token_enc text not null,
    scopes            text not null,
    -- Préférences d'affichage (modifiables depuis la page Paramètres)
    max_messages      int  not null default 10 check (max_messages in (5, 10, 20)),
    unread_only       boolean not null default false,
    refresh_minutes   int  not null default 5 check (refresh_minutes in (0, 2, 5, 10)),
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

-- Sécurité : RLS activée SANS aucune policy + droits retirés.
-- Le navigateur ne peut donc ni lire ni écrire cette table ;
-- seules les Edge Functions (clé service_role) y accèdent.
alter table public.gmail_connections enable row level security;
revoke all on public.gmail_connections from anon, authenticated;
