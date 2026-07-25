-- Fase 3A: persistência remota local-first, idempotência e revisão espaçada.
-- Migration aditiva e não destrutiva. Não executar automaticamente.

do $schema_validation$
declare
  mismatch record;
begin
  if to_regclass('public.questoes') is null then
    raise exception 'Schema incompatível: tabela public.questoes não encontrada; migration interrompida antes das alterações';
  end if;

  if to_regclass('public.tentativas') is null then
    raise exception 'Schema incompatível: tabela public.tentativas não encontrada; migration interrompida antes das alterações';
  end if;

  for mismatch in
    with expected (table_name, column_name, expected_type, expected_not_null) as (
      values
        ('questoes', 'id', 'integer', true),
        ('questoes', 'tipo', 'text', false),
        ('questoes', 'resposta_correta', 'text', false),
        ('questoes', 'aula_id', 'bigint', false),
        ('tentativas', 'id', 'bigint', true),
        ('tentativas', 'questao_id', 'bigint', true),
        ('tentativas', 'aula_id', 'bigint', false),
        ('tentativas', 'tipo', 'text', false),
        ('tentativas', 'resposta_aluno', 'text', false),
        ('tentativas', 'resposta_correta', 'text', false),
        -- Aceita false após uma reaplicação: esta migration torna acertou nullable.
        ('tentativas', 'acertou', 'boolean', null::boolean),
        ('tentativas', 'feedback', 'text', false),
        ('tentativas', 'tempo_segundos', 'integer', true),
        ('tentativas', 'respondido_em', 'timestamp with time zone', true),
        ('tentativas', 'modo_estudo', 'text', false),
        ('tentativas', 'dicas_usadas', 'integer', true),
        ('tentativas', 'score', 'integer', false),
        ('tentativas', 'metadados', 'jsonb', true)
    )
    select
      expected.table_name,
      expected.column_name,
      expected.expected_type,
      expected.expected_not_null,
      format_type(attribute.atttypid, attribute.atttypmod) as actual_type,
      attribute.attnotnull as actual_not_null
    from expected
    left join pg_namespace namespace
      on namespace.nspname = 'public'
    left join pg_class relation
      on relation.relnamespace = namespace.oid
      and relation.relname = expected.table_name
      and relation.relkind in ('r', 'p')
    left join pg_attribute attribute
      on attribute.attrelid = relation.oid
      and attribute.attname = expected.column_name
      and attribute.attnum > 0
      and not attribute.attisdropped
    where attribute.attname is null
      or format_type(attribute.atttypid, attribute.atttypmod)
        is distinct from expected.expected_type
      or (
        expected.expected_not_null is not null
        and attribute.attnotnull is distinct from expected.expected_not_null
      )
  loop
    if mismatch.actual_type is null then
      raise exception
        'Schema incompatível: public.%.% não encontrada; esperado tipo %. Migration interrompida antes das alterações',
        mismatch.table_name,
        mismatch.column_name,
        mismatch.expected_type;
    end if;

    raise exception
      'Schema incompatível: public.%.% esperava tipo % e NOT NULL %, encontrou tipo % e NOT NULL %. Migration interrompida antes das alterações',
      mismatch.table_name,
      mismatch.column_name,
      mismatch.expected_type,
      mismatch.expected_not_null,
      mismatch.actual_type,
      mismatch.actual_not_null;
  end loop;

  if not exists (
    select 1
    from pg_attribute attribute
    where attribute.attrelid = 'public.tentativas'::regclass
      and attribute.attname = 'id'
      and attribute.attnum > 0
      and not attribute.attisdropped
      and attribute.attidentity in ('a', 'd')
  ) then
    raise exception 'Schema incompatível: public.tentativas.id deve ser identity bigint; a RPC não envia essa coluna. Migration interrompida antes das alterações';
  end if;
end
$schema_validation$;

alter table public.tentativas
  alter column acertou drop not null;

do $migration$
declare
  question_id_type text;
begin
  select format_type(attribute.atttypid, attribute.atttypmod)
    into question_id_type
  from pg_attribute attribute
  join pg_class relation on relation.oid = attribute.attrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'questoes'
    and attribute.attname = 'id'
    and attribute.attnum > 0
    and not attribute.attisdropped;

  if question_id_type is null then
    raise exception 'public.questoes.id não foi encontrado; migration interrompida sem alterações destrutivas';
  end if;

  execute format(
    $sql$
      create table if not exists public.revisoes_questoes (
        user_id uuid not null,
        questao_id %s not null,
        acertos_seguidos integer not null default 0,
        total_tentativas integer not null default 0,
        total_acertos integer not null default 0,
        proxima_revisao_em timestamptz,
        ultima_resposta_em timestamptz,
        ultimo_attempt_id text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (user_id, questao_id)
      )
    $sql$,
    question_id_type
  );

  execute format(
    $sql$
      create table if not exists public.sessoes_estudo (
        id text primary key,
        user_id uuid not null,
        schema_version integer not null,
        source jsonb not null,
        criteria jsonb not null default '{}'::jsonb,
        question_ids %s[] not null,
        status text not null default 'created',
        current_index integer not null default 0,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        completed_at timestamptz
      )
    $sql$,
    question_id_type
  );

  execute format(
    'alter table public.revisoes_questoes add column if not exists questao_id %s',
    question_id_type
  );
  execute format(
    'alter table public.sessoes_estudo add column if not exists question_ids %s[]',
    question_id_type
  );
end
$migration$;

alter table public.revisoes_questoes
  add column if not exists user_id uuid,
  add column if not exists acertos_seguidos integer not null default 0,
  add column if not exists total_tentativas integer not null default 0,
  add column if not exists total_acertos integer not null default 0,
  add column if not exists proxima_revisao_em timestamptz,
  add column if not exists ultima_resposta_em timestamptz,
  add column if not exists ultimo_attempt_id text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.sessoes_estudo
  add column if not exists id text,
  add column if not exists user_id uuid,
  add column if not exists schema_version integer not null default 1,
  add column if not exists source jsonb not null default '{}'::jsonb,
  add column if not exists criteria jsonb not null default '{}'::jsonb,
  add column if not exists status text not null default 'created',
  add column if not exists current_index integer not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists completed_at timestamptz;

alter table public.tentativas
  add column if not exists user_id uuid,
  add column if not exists attempt_id text,
  add column if not exists session_id text,
  add column if not exists result_status text,
  add column if not exists client_created_at timestamptz,
  add column if not exists synced_at timestamptz;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where contype = 'p'
      and conrelid = 'public.revisoes_questoes'::regclass
  ) then
    alter table public.revisoes_questoes
      add constraint revisoes_questoes_pkey primary key (user_id, questao_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where contype = 'p'
      and conrelid = 'public.sessoes_estudo'::regclass
  ) then
    alter table public.sessoes_estudo
      add constraint sessoes_estudo_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'revisoes_questoes_user_fk'
      and conrelid = 'public.revisoes_questoes'::regclass
  ) then
    alter table public.revisoes_questoes
      add constraint revisoes_questoes_user_fk
      foreign key (user_id) references auth.users(id) on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'revisoes_questoes_questao_fk'
      and conrelid = 'public.revisoes_questoes'::regclass
  ) then
    alter table public.revisoes_questoes
      add constraint revisoes_questoes_questao_fk
      foreign key (questao_id) references public.questoes(id) on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'revisoes_questoes_counters_check'
      and conrelid = 'public.revisoes_questoes'::regclass
  ) then
    alter table public.revisoes_questoes
      add constraint revisoes_questoes_counters_check
      check (acertos_seguidos >= 0 and total_tentativas >= 0 and total_acertos >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sessoes_estudo_user_fk'
      and conrelid = 'public.sessoes_estudo'::regclass
  ) then
    alter table public.sessoes_estudo
      add constraint sessoes_estudo_user_fk
      foreign key (user_id) references auth.users(id) on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sessoes_estudo_status_check'
      and conrelid = 'public.sessoes_estudo'::regclass
  ) then
    alter table public.sessoes_estudo
      add constraint sessoes_estudo_status_check
      check (status in ('created', 'active', 'completed', 'abandoned')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sessoes_estudo_current_index_check'
      and conrelid = 'public.sessoes_estudo'::regclass
  ) then
    alter table public.sessoes_estudo
      add constraint sessoes_estudo_current_index_check
      check (current_index >= 0 and current_index <= cardinality(question_ids)) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tentativas_user_fk'
      and conrelid = 'public.tentativas'::regclass
  ) then
    alter table public.tentativas
      add constraint tentativas_user_fk
      foreign key (user_id) references auth.users(id) on delete set null not valid;
  elsif exists (
    select 1 from pg_constraint
    where conname = 'tentativas_user_fk'
      and conrelid = 'public.tentativas'::regclass
      and confdeltype <> 'n'
  ) then
    raise exception 'Schema incompatível: tentativas_user_fk existente deve usar ON DELETE SET NULL';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tentativas_result_status_check'
      and conrelid = 'public.tentativas'::regclass
  ) then
    alter table public.tentativas
      add constraint tentativas_result_status_check
      check (
        result_status is null
        or result_status in ('correct', 'incorrect', 'neutral', 'skipped', 'invalid')
      ) not valid;
  end if;
end
$constraints$;

create unique index if not exists tentativas_user_attempt_unique
  on public.tentativas (user_id, attempt_id)
  where user_id is not null and attempt_id is not null;

create index if not exists revisoes_questoes_user_proxima_idx
  on public.revisoes_questoes (user_id, proxima_revisao_em);
create index if not exists revisoes_questoes_user_updated_idx
  on public.revisoes_questoes (user_id, updated_at desc);
create index if not exists sessoes_estudo_user_status_updated_idx
  on public.sessoes_estudo (user_id, status, updated_at desc);
create index if not exists tentativas_user_respondido_idx
  on public.tentativas (user_id, respondido_em desc);
create index if not exists tentativas_user_session_idx
  on public.tentativas (user_id, session_id);
create index if not exists tentativas_user_questao_idx
  on public.tentativas (user_id, questao_id);
create index if not exists tentativas_attempt_id_idx
  on public.tentativas (attempt_id);

create or replace function public.proteger_question_ids_sessao()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if old.question_ids is distinct from new.question_ids then
    raise exception 'question_ids de uma sessão são imutáveis' using errcode = '22023';
  end if;
  return new;
end
$function$;

do $trigger$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'sessoes_estudo_question_ids_immutable'
      and tgrelid = 'public.sessoes_estudo'::regclass
      and not tgisinternal
  ) then
    create trigger sessoes_estudo_question_ids_immutable
      before update of question_ids on public.sessoes_estudo
      for each row execute function public.proteger_question_ids_sessao();
  end if;
end
$trigger$;

alter table public.revisoes_questoes enable row level security;
alter table public.sessoes_estudo enable row level security;
alter table public.tentativas enable row level security;

do $policies$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'revisoes_questoes'
      and policyname = 'revisoes_select_own'
  ) then
    create policy revisoes_select_own
      on public.revisoes_questoes for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'revisoes_questoes'
      and policyname = 'revisoes_isolation_restrictive'
  ) then
    create policy revisoes_isolation_restrictive
      on public.revisoes_questoes as restrictive for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'revisoes_questoes'
      and policyname = 'revisoes_no_direct_insert'
  ) then
    create policy revisoes_no_direct_insert
      on public.revisoes_questoes as restrictive for insert to authenticated
      with check (false);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'revisoes_questoes'
      and policyname = 'revisoes_no_direct_update'
  ) then
    create policy revisoes_no_direct_update
      on public.revisoes_questoes as restrictive for update to authenticated
      using (false) with check (false);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'revisoes_questoes'
      and policyname = 'revisoes_no_direct_delete'
  ) then
    create policy revisoes_no_direct_delete
      on public.revisoes_questoes as restrictive for delete to authenticated
      using (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sessoes_estudo'
      and policyname = 'sessoes_select_own'
  ) then
    create policy sessoes_select_own
      on public.sessoes_estudo for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sessoes_estudo'
      and policyname = 'sessoes_insert_own'
  ) then
    create policy sessoes_insert_own
      on public.sessoes_estudo for insert to authenticated
      with check ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sessoes_estudo'
      and policyname = 'sessoes_update_own'
  ) then
    create policy sessoes_update_own
      on public.sessoes_estudo for update to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sessoes_estudo'
      and policyname = 'sessoes_isolation_restrictive'
  ) then
    create policy sessoes_isolation_restrictive
      on public.sessoes_estudo as restrictive for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sessoes_estudo'
      and policyname = 'sessoes_no_delete'
  ) then
    create policy sessoes_no_delete
      on public.sessoes_estudo as restrictive for delete to authenticated
      using (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tentativas'
      and policyname = 'tentativas_select_own'
  ) then
    create policy tentativas_select_own
      on public.tentativas for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tentativas'
      and policyname = 'tentativas_isolation_restrictive'
  ) then
    create policy tentativas_isolation_restrictive
      on public.tentativas as restrictive for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tentativas'
      and policyname = 'tentativas_no_direct_insert'
  ) then
    create policy tentativas_no_direct_insert
      on public.tentativas as restrictive for insert to authenticated
      with check (false);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tentativas'
      and policyname = 'tentativas_no_direct_update'
  ) then
    create policy tentativas_no_direct_update
      on public.tentativas as restrictive for update to authenticated
      using (false) with check (false);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tentativas'
      and policyname = 'tentativas_no_direct_delete'
  ) then
    create policy tentativas_no_direct_delete
      on public.tentativas as restrictive for delete to authenticated
      using (false);
  end if;
end
$policies$;

do $rpc$
declare
  question_id_type text;
begin
  select format_type(attribute.atttypid, attribute.atttypmod)
    into question_id_type
  from pg_attribute attribute
  join pg_class relation on relation.oid = attribute.attrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'questoes'
    and attribute.attname = 'id'
    and attribute.attnum > 0
    and not attribute.attisdropped;

  execute format(
    $definition$
      create or replace function public.registrar_tentativa_estudo(
        p_attempt_id text,
        p_session_id text,
        p_questao_id %s,
        p_resposta_aluno text,
        p_result_status text,
        p_feedback text,
        p_tempo_ms integer,
        p_modo_estudo text,
        p_metadados jsonb default '{}'::jsonb,
        p_client_created_at timestamptz default null,
        p_current_index integer default null,
        p_completed boolean default false
      )
      returns table (
        inserted boolean,
        already_existed boolean,
        review_consecutive_correct integer,
        review_total_attempts integer,
        review_total_correct integer,
        next_review_at timestamptz
      )
      language plpgsql
      security definer
      set search_path = public, pg_temp
      as $function$
      declare
        authenticated_user uuid;
        question_row record;
        existing_attempt record;
        review_row record;
        attempt_inserted boolean := false;
        base_time timestamptz := clock_timestamp();
      begin
        authenticated_user := auth.uid();
        if authenticated_user is null then
          raise exception 'autenticação obrigatória' using errcode = '42501';
        end if;
        if p_attempt_id is null or length(p_attempt_id) = 0 or length(p_attempt_id) > 256 then
          raise exception 'attempt_id inválido' using errcode = '22023';
        end if;
        if p_session_id is null or length(p_session_id) = 0 or length(p_session_id) > 256 then
          raise exception 'session_id inválido' using errcode = '22023';
        end if;
        if p_result_status not in ('correct', 'incorrect', 'neutral', 'skipped', 'invalid') then
          raise exception 'result_status inválido' using errcode = '22023';
        end if;
        if p_tempo_ms is null or p_tempo_ms < 0 then
          raise exception 'tempo_ms inválido' using errcode = '22023';
        end if;
        if p_current_index is not null and p_current_index < 0 then
          raise exception 'current_index inválido' using errcode = '22023';
        end if;
        if p_metadados is null or jsonb_typeof(p_metadados) <> 'object' then
          p_metadados := '{}'::jsonb;
        end if;
        if pg_column_size(p_metadados) > 16384 then
          raise exception 'metadados excedem o limite permitido' using errcode = '22023';
        end if;

        select q.id, q.aula_id, q.tipo, q.resposta_correta
          into question_row
        from public.questoes q
        where q.id = p_questao_id;

        if not found then
          raise exception 'questão não encontrada' using errcode = '23503';
        end if;

        if exists (
          select 1 from public.sessoes_estudo session_row
          where session_row.id = p_session_id
            and session_row.user_id is distinct from authenticated_user
        ) then
          raise exception 'sessão não pertence ao usuário autenticado' using errcode = '42501';
        end if;

        insert into public.tentativas (
          questao_id,
          aula_id,
          tipo,
          resposta_aluno,
          resposta_correta,
          acertou,
          feedback,
          tempo_segundos,
          respondido_em,
          modo_estudo,
          dicas_usadas,
          score,
          metadados,
          user_id,
          attempt_id,
          session_id,
          result_status,
          client_created_at,
          synced_at
        )
        values (
          question_row.id,
          question_row.aula_id,
          question_row.tipo,
          p_resposta_aluno,
          question_row.resposta_correta,
          case
            when p_result_status = 'correct' then true
            when p_result_status = 'incorrect' then false
            else null
          end,
          p_feedback,
          round(p_tempo_ms / 1000.0)::integer,
          base_time,
          left(coalesce(p_modo_estudo, 'study'), 64),
          0,
          case
            when p_result_status = 'correct' then 1
            when p_result_status = 'incorrect' then 0
            else null
          end,
          p_metadados || jsonb_build_object(
            'tempo_ms',
            p_tempo_ms,
            'client_created_at_supplied',
            p_client_created_at is not null
          ),
          authenticated_user,
          p_attempt_id,
          p_session_id,
          p_result_status,
          coalesce(p_client_created_at, base_time),
          base_time
        )
        on conflict (user_id, attempt_id)
          where user_id is not null and attempt_id is not null
          do nothing
        returning true into attempt_inserted;

        attempt_inserted := coalesce(attempt_inserted, false);

        if not attempt_inserted then
          select
            attempt.questao_id,
            attempt.session_id,
            attempt.resposta_aluno,
            attempt.result_status,
            attempt.metadados -> 'tempo_ms' as tempo_ms,
            attempt.modo_estudo,
            attempt.client_created_at,
            attempt.feedback,
            attempt.metadados -> 'client_created_at_supplied' as client_created_at_supplied,
            attempt.metadados - 'tempo_ms' - 'client_created_at_supplied' as payload_metadados
            into existing_attempt
          from public.tentativas attempt
          where attempt.user_id = authenticated_user
            and attempt.attempt_id = p_attempt_id;

          if not found
            or existing_attempt.questao_id is distinct from p_questao_id
            or existing_attempt.session_id is distinct from p_session_id then
            raise exception 'attempt_id já utilizado com payload diferente' using errcode = '23505';
          end if;

          if existing_attempt.resposta_aluno is distinct from p_resposta_aluno
            or existing_attempt.result_status is distinct from p_result_status
            or existing_attempt.tempo_ms is distinct from to_jsonb(p_tempo_ms)
            or existing_attempt.modo_estudo
              is distinct from left(coalesce(p_modo_estudo, 'study'), 64)
            or existing_attempt.feedback is distinct from p_feedback
            or existing_attempt.payload_metadados
              is distinct from (p_metadados - 'tempo_ms' - 'client_created_at_supplied')
            or existing_attempt.client_created_at_supplied
              is distinct from to_jsonb(p_client_created_at is not null)
            or (
              p_client_created_at is not null
              and existing_attempt.client_created_at is distinct from p_client_created_at
            ) then
            raise exception 'attempt_id já utilizado com payload diferente' using errcode = '23505';
          end if;
        end if;

        if attempt_inserted and p_result_status in ('correct', 'incorrect') then
          insert into public.revisoes_questoes (
            user_id,
            questao_id,
            acertos_seguidos,
            total_tentativas,
            total_acertos,
            proxima_revisao_em,
            ultima_resposta_em,
            ultimo_attempt_id,
            created_at,
            updated_at
          )
          values (
            authenticated_user,
            p_questao_id,
            case when p_result_status = 'correct' then 1 else 0 end,
            1,
            case when p_result_status = 'correct' then 1 else 0 end,
            base_time + case
              when p_result_status = 'incorrect' then interval '4 hours'
              else interval '1 day'
            end,
            base_time,
            p_attempt_id,
            base_time,
            base_time
          )
          on conflict (user_id, questao_id) do update set
            acertos_seguidos = case
              when p_result_status = 'correct'
                then public.revisoes_questoes.acertos_seguidos + 1
              else 0
            end,
            total_tentativas = public.revisoes_questoes.total_tentativas + 1,
            total_acertos = public.revisoes_questoes.total_acertos
              + case when p_result_status = 'correct' then 1 else 0 end,
            proxima_revisao_em = base_time + case
              when p_result_status = 'incorrect' then interval '4 hours'
              when public.revisoes_questoes.acertos_seguidos + 1 = 1 then interval '1 day'
              when public.revisoes_questoes.acertos_seguidos + 1 = 2 then interval '3 days'
              when public.revisoes_questoes.acertos_seguidos + 1 = 3 then interval '7 days'
              when public.revisoes_questoes.acertos_seguidos + 1 = 4 then interval '14 days'
              else interval '30 days'
            end,
            ultima_resposta_em = base_time,
            ultimo_attempt_id = p_attempt_id,
            updated_at = base_time
          returning * into review_row;
        else
          select *
            into review_row
          from public.revisoes_questoes review
          where review.user_id = authenticated_user
            and review.questao_id = p_questao_id;
        end if;

        if attempt_inserted then
          update public.sessoes_estudo session_row
          set
            current_index = case
              when p_completed then cardinality(session_row.question_ids)
              when p_current_index is null then session_row.current_index
              else greatest(
                session_row.current_index,
                least(p_current_index, cardinality(session_row.question_ids))
              )
            end,
            status = case
              when p_completed then 'completed'
              when session_row.status = 'created' then 'active'
              else session_row.status
            end,
            completed_at = case
              when p_completed then coalesce(session_row.completed_at, base_time)
              else session_row.completed_at
            end,
            updated_at = base_time
          where session_row.id = p_session_id
            and session_row.user_id = authenticated_user;
        end if;

        return query
        select
          attempt_inserted,
          not attempt_inserted,
          review_row.acertos_seguidos,
          review_row.total_tentativas,
          review_row.total_acertos,
          review_row.proxima_revisao_em;
      end
      $function$
    $definition$,
    question_id_type
  );
end
$rpc$;

revoke all on table public.revisoes_questoes from anon;
revoke all on table public.sessoes_estudo from anon;
revoke all on table public.tentativas from anon;
revoke all on table public.revisoes_questoes from public;
revoke all on table public.sessoes_estudo from public;
revoke all on table public.tentativas from public;

grant select on table public.revisoes_questoes to authenticated;
grant select, insert, update on table public.sessoes_estudo to authenticated;
grant select on table public.tentativas to authenticated;

revoke all on function public.proteger_question_ids_sessao() from public;
revoke all on function public.proteger_question_ids_sessao() from anon;
revoke all on function public.proteger_question_ids_sessao() from authenticated;

do $grants$
declare
  function_signature text;
begin
  select procedure.oid::regprocedure::text
    into function_signature
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'registrar_tentativa_estudo'
  order by procedure.oid desc
  limit 1;

  if function_signature is null then
    raise exception 'RPC registrar_tentativa_estudo não foi criada';
  end if;

  execute format('revoke all on function %s from public', function_signature);
  execute format('revoke all on function %s from anon', function_signature);
  execute format('grant execute on function %s to authenticated', function_signature);
end
$grants$;
