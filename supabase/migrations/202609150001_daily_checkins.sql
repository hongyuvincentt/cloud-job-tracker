create table public.daily_goal_settings (
  user_id uuid primary key default auth.uid(),
  daily_target integer not null default 3 check (daily_target between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  checkin_date date not null,
  goal_target integer not null check (goal_target between 1 and 99),
  completed_count integer not null check (completed_count >= 0),
  source text not null check (source in ('automatic', 'makeup')),
  completed_at timestamptz not null default now(),
  unique (user_id, checkin_date)
);

create index daily_checkins_user_date_idx
  on public.daily_checkins (user_id, checkin_date desc);

create function public.set_daily_goal_values()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.user_id = auth.uid();
    new.created_at = now();
  else
    new.user_id = old.user_id;
    new.created_at = old.created_at;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create function public.set_daily_checkin_values()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.user_id = auth.uid();
  if tg_op = 'INSERT' then
    new.completed_at = now();
  else
    new.completed_at = old.completed_at;
  end if;
  return new;
end;
$$;

create trigger daily_goal_settings_assign_server_values
before insert or update on public.daily_goal_settings
for each row execute function public.set_daily_goal_values();

create trigger daily_checkins_assign_server_values
before insert or update on public.daily_checkins
for each row execute function public.set_daily_checkin_values();

alter table public.daily_goal_settings enable row level security;
alter table public.daily_checkins enable row level security;

create policy daily_goal_settings_select_own on public.daily_goal_settings
for select using (auth.uid() = user_id);
create policy daily_goal_settings_insert_own on public.daily_goal_settings
for insert with check (auth.uid() = user_id);
create policy daily_goal_settings_update_own on public.daily_goal_settings
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy daily_goal_settings_delete_own on public.daily_goal_settings
for delete using (auth.uid() = user_id);

create policy daily_checkins_select_own on public.daily_checkins
for select using (auth.uid() = user_id);
create policy daily_checkins_insert_own on public.daily_checkins
for insert with check (auth.uid() = user_id);
create policy daily_checkins_update_own on public.daily_checkins
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy daily_checkins_delete_own on public.daily_checkins
for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.daily_goal_settings to authenticated;
grant select, insert, update, delete on table public.daily_checkins to authenticated;
