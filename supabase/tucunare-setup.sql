begin;

create table if not exists public.tucunare_materials (
  id text primary key,
  material_key text not null check (material_key ~ '^module2-u[1-4]-l[1-3]$'),
  kind text not null check (kind in ('book','complement','homework')),
  title text not null,
  source_url text not null,
  page integer,
  body text not null check (length(body) <= 12000)
);
create index if not exists tucunare_materials_key on public.tucunare_materials(material_key);
alter table public.tucunare_materials enable row level security;
revoke all on public.tucunare_materials from public, anon, authenticated;
grant all on public.tucunare_materials to service_role;

create table if not exists public.lms_imports (
  lesson_date date primary key,
  status text not null check (status in ('waiting','captured','downloaded','processing','ready','skipped','error')),
  source_drive_id text check (source_drive_id is null or source_drive_id ~ '^[A-Za-z0-9_-]{15,200}$'),
  checked_at timestamptz,
  updated_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text check (length(last_error) <= 400),
  note text check (length(note) <= 200),
  run_url text,
  aula_id bigint references public.aulas(id)
);
alter table public.lms_imports enable row level security;
revoke all on public.lms_imports from public, anon, authenticated;
grant all on public.lms_imports to service_role;
grant select (lesson_date,status,checked_at,updated_at,attempts,last_error,note,aula_id)
  on public.lms_imports to authenticated;
drop policy if exists lms_imports_read on public.lms_imports;
create policy lms_imports_read on public.lms_imports for select to authenticated using (true);

insert into public.lms_imports (lesson_date,status,aula_id)
select distinct on (data_aula) data_aula::date,'ready',id
from public.aulas
where status = 'concluida' and nome_arquivo like 'LMS_%' and data_aula is not null
order by data_aula,id desc
on conflict (lesson_date) do nothing;

create table if not exists public.tucunare_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  fingerprint text not null check (length(fingerprint) = 64),
  created_at timestamptz not null default now(),
  quota_day date not null,
  status text not null default 'reserved' check (status in ('reserved','completed','failed')),
  response jsonb,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  primary key (user_id,request_id)
);
create index if not exists tucunare_requests_day_user on public.tucunare_requests (quota_day,user_id);
create index if not exists tucunare_requests_created on public.tucunare_requests (created_at);
alter table public.tucunare_requests enable row level security;
revoke all on public.tucunare_requests from public, anon, authenticated;
grant all on public.tucunare_requests to service_role;

create or replace function public.tucunare_reserve(
  p_user_id uuid,
  p_request_id uuid default null,
  p_fingerprint text default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  today_pacific date := (now() at time zone 'America/Los_Angeles')::date;
  used_today integer;
  global_today integer;
  minute_count integer;
  previous public.tucunare_requests%rowtype;
begin
  -- One short, project-wide lock makes reservations atomic across Edge isolates.
  perform pg_catalog.pg_advisory_xact_lock(184027, 20261016);
  if p_user_id is null then raise exception 'User required'; end if;
  select count(*) into used_today from public.tucunare_requests
    where user_id = p_user_id and quota_day = today_pacific;
  if p_request_id is null then
    return jsonb_build_object('allowed',true,'remaining',greatest(0,30-used_today),'limit',30);
  end if;
  if p_fingerprint is null or length(p_fingerprint) <> 64 then raise exception 'Fingerprint required'; end if;
  select * into previous from public.tucunare_requests
    where user_id = p_user_id and request_id = p_request_id;
  if found then
    if previous.fingerprint <> p_fingerprint then
      return jsonb_build_object('allowed',false,'reason','request_conflict','retry_after',0);
    end if;
    if previous.status = 'completed' then
      return jsonb_build_object('allowed',true,'cached',true,'response',previous.response,
                               'remaining',greatest(0,30-used_today));
    end if;
    return jsonb_build_object('allowed',false,'reason',
      case when previous.status = 'failed' then 'previous_failed' else 'in_progress' end,'retry_after',30);
  end if;
  if used_today >= 30 then
    return jsonb_build_object('allowed',false,'reason','daily_limit','retry_after',3600,'remaining',0);
  end if;
  select count(*) into global_today from public.tucunare_requests where quota_day = today_pacific;
  if global_today >= 200 then
    return jsonb_build_object('allowed',false,'reason','project_limit','retry_after',3600);
  end if;
  if exists (select 1 from public.lms_imports where status = 'processing'
             and updated_at > now() - interval '45 minutes') then
    return jsonb_build_object('allowed',false,'reason','lesson_processing','retry_after',120);
  end if;
  select count(*) into minute_count from public.tucunare_requests
    where created_at > now() - interval '1 minute';
  if minute_count >= 5 then
    return jsonb_build_object('allowed',false,'reason','minute_limit','retry_after',60);
  end if;
  select count(*) into minute_count from public.tucunare_requests
    where user_id = p_user_id and created_at > now() - interval '1 minute';
  if minute_count >= 3 then
    return jsonb_build_object('allowed',false,'reason','minute_limit','retry_after',60);
  end if;
  insert into public.tucunare_requests (user_id,request_id,fingerprint,quota_day)
    values (p_user_id,p_request_id,p_fingerprint,today_pacific);
  return jsonb_build_object('allowed',true,'cached',false,'remaining',29-used_today,'limit',30);
end;
$$;
revoke all on function public.tucunare_reserve(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.tucunare_reserve(uuid,uuid,text) to service_role;

commit;
