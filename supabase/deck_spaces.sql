-- Deck spaces: data found again with a name like "deck.paul". The name works as a password, so it must stay private.
create table if not exists deck_spaces (
  name text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  claude_token text not null unique default replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')
);
alter table deck_spaces enable row level security;
-- No direct access: everything goes through the functions below.

create or replace function space_get(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  select jsonb_build_object('data', data, 'updated_at', updated_at, 'claude', claude_token) into r from deck_spaces where name = lower(trim(p_name));
  return r;
end $$;

create or replace function space_set(p_name text, p_data jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if length(lower(trim(p_name))) < 8 then raise exception 'nom trop court'; end if;
  insert into deck_spaces(name, data, updated_at) values (lower(trim(p_name)), p_data, now())
  on conflict (name) do update set data = excluded.data, updated_at = now()
  returning claude_token into t;
  return t;
end $$;
grant execute on function space_get(text), space_set(text, jsonb) to anon, authenticated;

-- Claude connector: accepts a space's token as well as the older per-account tokens.
create or replace function claude_get_state(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid; d jsonb; h jsonb;
begin
  select data into d from deck_spaces where claude_token = p_token;
  if found then return jsonb_build_object('data', coalesce(d, '{}'::jsonb), 'health', null); end if;
  select user_id into uid from claude_tokens where token = p_token;
  if uid is null then raise exception 'jeton inconnu'; end if;
  select data into d from app_state where user_id = uid;
  select to_jsonb(x) into h from (select day, sleep_minutes, hrv, resting_hr, steps from health_daily where user_id = uid order by day desc limit 1) x;
  return jsonb_build_object('data', coalesce(d, '{}'::jsonb), 'health', h);
end $$;

create or replace function claude_set_state(p_token text, p_data jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  update deck_spaces set data = p_data, updated_at = now() where claude_token = p_token;
  if found then return 'ok'; end if;
  select user_id into uid from claude_tokens where token = p_token;
  if uid is null then raise exception 'jeton inconnu'; end if;
  insert into app_state(user_id, data, updated_at) values (uid, p_data, now())
  on conflict (user_id) do update set data = excluded.data, updated_at = now();
  return 'ok';
end $$;
grant execute on function claude_get_state(text), claude_set_state(text, jsonb) to anon, authenticated;
