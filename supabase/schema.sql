-- Deck : à coller une fois dans Supabase > SQL Editor > Run.
-- Chaque ligne appartient à un utilisateur ; la sécurité (RLS) limite l'accès à ses propres données.

create table if not exists app_state (
  user_id uuid primary key references auth.users on delete cascade default auth.uid(),
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['tasks','habits','habit_logs','calendars','folders','notes','goals','projects','books',
    'reading_logs','transactions','subscriptions','workouts','sessions','health_daily','journal_issues',
    'journal_articles','home_modules','settings','claude_notes'] loop
    execute format('create table if not exists %I (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users on delete cascade default auth.uid(),
      source text not null default ''app'',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now())', t);
  end loop;
end $$;

alter table tasks add column if not exists title text, add column if not exists due date, add column if not exists important boolean default false,
  add column if not exists urgent boolean default false, add column if not exists done_at timestamptz, add column if not exists project_id uuid;
alter table habits add column if not exists title text, add column if not exists recurrence text default 'daily', add column if not exists pages int;
alter table habit_logs add column if not exists habit_id uuid, add column if not exists day date, add column if not exists done boolean default true;
alter table calendars add column if not exists name text, add column if not exists color text, add column if not exists followed boolean default true;
alter table folders add column if not exists name text, add column if not exists position int;
alter table notes add column if not exists title text, add column if not exists body text, add column if not exists summary text,
  add column if not exists folder_id uuid, add column if not exists manual boolean default false, add column if not exists project_id uuid;
alter table goals add column if not exists title text, add column if not exists domain text, add column if not exists due date,
  add column if not exists progress int default 0, add column if not exists detail text;
alter table projects add column if not exists name text, add column if not exists next_step text, add column if not exists keywords text[];
alter table books add column if not exists title text, add column if not exists author text, add column if not exists cover_url text,
  add column if not exists pages_read int default 0, add column if not exists pages_total int, add column if not exists status text default 'to_read',
  add column if not exists favorite boolean default false, add column if not exists notes text;
alter table reading_logs add column if not exists book_id uuid, add column if not exists day date, add column if not exists pages int;
alter table transactions add column if not exists kind text, add column if not exists label text, add column if not exists amount numeric(12,2),
  add column if not exists category text, add column if not exists category_guessed boolean default false, add column if not exists day date,
  add column if not exists subscription_id uuid;
alter table subscriptions add column if not exists label text, add column if not exists amount numeric(12,2), add column if not exists category text,
  add column if not exists day_of_month int, add column if not exists active boolean default true;
alter table workouts add column if not exists name text, add column if not exists exercises jsonb default '[]';
alter table sessions add column if not exists workout_id uuid, add column if not exists planned_at timestamptz, add column if not exists done_at timestamptz,
  add column if not exists metrics jsonb default '{}';
alter table health_daily add column if not exists day date, add column if not exists sleep_score int, add column if not exists sleep_minutes int,
  add column if not exists recovery int, add column if not exists hrv int, add column if not exists resting_hr int, add column if not exists steps int;
alter table journal_issues add column if not exists day date, add column if not exists headline text, add column if not exists lede text;
alter table journal_articles add column if not exists issue_id uuid, add column if not exists section text, add column if not exists title text,
  add column if not exists summary text, add column if not exists source_name text, add column if not exists url text;
alter table home_modules add column if not exists kind text, add column if not exists name text, add column if not exists size text,
  add column if not exists data text[], add column if not exists summary text, add column if not exists position int, add column if not exists visible boolean default true;
alter table settings add column if not exists data jsonb default '{}';
alter table claude_notes add column if not exists kind text, add column if not exists day date, add column if not exists body text;

do $$
declare t text;
begin
  foreach t in array array['app_state','tasks','habits','habit_logs','calendars','folders','notes','goals','projects','books',
    'reading_logs','transactions','subscriptions','workouts','sessions','health_daily','journal_issues',
    'journal_articles','home_modules','settings','claude_notes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists own on %I', t);
    execute format('create policy own on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Calendrier Apple : identifiant iCloud et mot de passe d'app, lisibles seulement par toi.
create table if not exists icloud_accounts (
  user_id uuid primary key references auth.users on delete cascade default auth.uid(),
  apple_id text not null,
  app_password text not null,
  updated_at timestamptz not null default now()
);
alter table icloud_accounts enable row level security;
drop policy if exists own on icloud_accounts;
create policy own on icloud_accounts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
