-- Einmalig im Supabase SQL-Editor ausführen (Projekt -> SQL Editor -> New query).
-- Schlüssel/Wert-Speicher für Verlauf, Wechselkurs-Cache und verschlüsselte Google-Tokens.
create table if not exists earnings_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Zugriff nur über den Service-Key des Servers (RLS an, keine öffentlichen Policies).
alter table earnings_kv enable row level security;
