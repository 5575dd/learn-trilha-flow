# Supabase — Fase 3A

## Estado desta entrega

A migration `20260725_remote_attempts_spaced_repetition.sql` foi executada manualmente no projeto Supabase correto antes da Fase 3B. As 11 verificações operacionais informadas passaram, cobrindo tabelas, colunas, foreign key, RLS, RPC e privilégios. As escritas remotas continuam desabilitadas por padrão com:

```text
VITE_ENABLE_SUPABASE_WRITES=false
```

O aplicativo permanece local-first e continua funcionando somente com o armazenamento do navegador enquanto essa flag estiver desabilitada.

## Schema legado confirmado

O schema real foi consultado fora desta entrega e informado como:

| Tabela       | Coluna             | Tipo          | Nullability | Default/identidade                |
| ------------ | ------------------ | ------------- | ----------- | --------------------------------- |
| `questoes`   | `id`               | `integer`     | NOT NULL    | `nextval('questoes_id_seq')`      |
| `questoes`   | `tipo`             | `text`        | nullable    | —                                 |
| `questoes`   | `resposta_correta` | `text`        | nullable    | —                                 |
| `questoes`   | `aula_id`          | `bigint`      | nullable    | —                                 |
| `tentativas` | `id`               | `bigint`      | NOT NULL    | identity; não é enviado pela RPC  |
| `tentativas` | `questao_id`       | `bigint`      | NOT NULL    | —                                 |
| `tentativas` | `aula_id`          | `bigint`      | nullable    | —                                 |
| `tentativas` | `tipo`             | `text`        | nullable    | —                                 |
| `tentativas` | `resposta_aluno`   | `text`        | nullable    | —                                 |
| `tentativas` | `resposta_correta` | `text`        | nullable    | —                                 |
| `tentativas` | `acertou`          | `boolean`     | NOT NULL    | sem default antes desta migration |
| `tentativas` | `feedback`         | `text`        | nullable    | —                                 |
| `tentativas` | `tempo_segundos`   | `integer`     | NOT NULL    | `0`                               |
| `tentativas` | `respondido_em`    | `timestamptz` | NOT NULL    | `now()`                           |
| `tentativas` | `modo_estudo`      | `text`        | nullable    | —                                 |
| `tentativas` | `dicas_usadas`     | `integer`     | NOT NULL    | `0`                               |
| `tentativas` | `score`            | `integer`     | nullable    | —                                 |
| `tentativas` | `metadados`        | `jsonb`       | NOT NULL    | `'{}'::jsonb`                     |

No início, antes de qualquer alteração, a migration confere a existência, os tipos e a nullability compatível dessas colunas, além de exigir que `tentativas.id` seja identity. `questoes.id` é `integer` e `tentativas.questao_id` é `bigint`; inserir o primeiro no segundo é uma conversão segura do PostgreSQL. Em divergência, o script interrompe com mensagem explícita e não tenta converter dados históricos.

## Finalidade da migration

A migration adiciona a infraestrutura necessária para:

- registrar tentativas autenticadas com idempotência por usuário e `attempt_id`;
- manter revisão espaçada separada por usuário e questão;
- preparar manifests de sessão para sincronização remota;
- executar tentativa, revisão e avanço de sessão na mesma transação;
- manter linhas históricas de `tentativas` sem `user_id` ou `attempt_id`;
- impedir leitura cruzada entre usuários com RLS.

Ela não contém `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` ou exclusão de dados. A única operação `DROP` é `ALTER COLUMN acertou DROP NOT NULL`, que relaxa uma restrição sem reescrever os valores existentes. A migration também não altera `questoes.resposta_correta` nem usa os campos globais antigos de revisão da tabela `questoes`.

## Tabelas e colunas

### `revisoes_questoes`

Nova tabela com chave primária composta `(user_id, questao_id)`. Armazena sequência de acertos, totais, próxima revisão, última resposta e último `attempt_id` aplicado.

Depois de validar que `public.questoes.id` é o `integer` confirmado, a migration deriva esse tipo do catálogo para criar `questao_id` sem duplicar a declaração em SQL dinâmico.

### `sessoes_estudo`

Nova tabela para o espelho remoto de `SessionManifest`:

- `id`, `user_id` e `schema_version`;
- `source` e `criteria` em JSONB;
- `question_ids` com o mesmo tipo de `questoes.id`;
- `status`, `current_index` e timestamps.

Um trigger impede qualquer alteração posterior de `question_ids`. A aplicação usa o manifest local como resposta imediata; a Fase 3B adicionou fila persistente, reconciliação e recuperação entre dispositivos.

### `tentativas`

São adicionadas, somente quando ausentes:

- `user_id`;
- `attempt_id`;
- `session_id`;
- `result_status`;
- `client_created_at`;
- `synced_at`.

O índice único parcial `(user_id, attempt_id)` aplica idempotência às novas tentativas e permite que linhas históricas com valores nulos continuem existindo.

Antes da RPC ser criada, `tentativas.acertou` passa a aceitar `NULL`. Nenhum valor anterior é alterado:

- `true`: resposta correta;
- `false`: resposta incorreta;
- `NULL`: resultado sem classificação binária (`neutral`, `skipped` ou `invalid`).

Assim, um resultado neutro ou ignorado não é confundido com erro. A foreign key `tentativas_user_fk` usa `ON DELETE SET NULL`: excluir uma conta de autenticação preserva a tentativa como histórico anônimo. Em contraste, `revisoes_questoes` e `sessoes_estudo` representam estado individual recuperável e continuam com `ON DELETE CASCADE`.

## RPC `registrar_tentativa_estudo`

A RPC:

1. obtém o usuário exclusivamente por `auth.uid()`;
2. valida o payload e a questão;
3. busca `aula_id`, tipo e `resposta_correta` diretamente em `questoes`;
4. insere a tentativa com conflito idempotente;
5. atualiza `revisoes_questoes` apenas quando a tentativa é nova;
6. atualiza `sessoes_estudo` somente quando a sessão pertence ao usuário;
7. retorna se houve inserção ou duplicidade e o estado atual de revisão.

O parâmetro de duração é `p_tempo_ms`, em milissegundos. O valor legado `tempo_segundos` é calculado dentro da RPC e o valor exato em milissegundos também é preservado nos metadados seguros. Respostas `neutral`, `skipped` e `invalid` são registradas, mas não incrementam os contadores de revisão e não são tratadas como acerto.

Em retry, o mesmo `(user_id, attempt_id)` só retorna `already_existed` quando o payload semântico permanece igual: questão, sessão, resposta do aluno, status, tempo exato em milissegundos, modo de estudo, feedback, metadados normalizados e presença/valor de `client_created_at`. Qualquer divergência é rejeitada como erro permanente (`23505`), sem atualizar ou sobrescrever a tentativa original. Quando o cliente não possui `client_created_at`, envia `NULL`; a RPC registra seu horário-base e retries sem timestamp continuam comparáveis.

A função usa `SECURITY DEFINER`, `search_path` fixo, exige autenticação e concede execução somente a `authenticated`. O frontend usa apenas o cliente Supabase autenticado e nunca precisa de `service_role`.

## Política de revisão

| Resultado                   | Nova sequência | Próxima revisão |
| --------------------------- | -------------: | --------------- |
| Incorreta                   |              0 | 4 horas         |
| 1º acerto seguido           |              1 | 1 dia           |
| 2º acerto seguido           |              2 | 3 dias          |
| 3º acerto seguido           |              3 | 7 dias          |
| 4º acerto seguido           |              4 | 14 dias         |
| 5º acerto seguido ou mais   |             5+ | 30 dias         |
| Neutral, skipped ou invalid |     inalterada | inalterada      |

A mesma tabela de intervalos é testada na função TypeScript pura e verificada estaticamente no SQL.

## RLS e privilégios

- `revisoes_questoes`: leitura somente das próprias linhas; inserts, updates e deletes diretos bloqueados para `authenticated`;
- `tentativas`: leitura somente das próprias linhas; writes diretos bloqueados e registro feito pela RPC;
- `sessoes_estudo`: select, insert e update somente das próprias sessões; delete bloqueado;
- `anon` e `public`: privilégios removidos das três tabelas;
- linhas históricas de `tentativas` com `user_id` nulo não ficam públicas.

Policies restritivas são adicionadas para que uma policy permissiva preexistente não amplie o acesso entre usuários.

## Persistência no logout

O logout limpa somente chaves de interface `trilha.*` no `sessionStorage`. Dados duráveis no `localStorage`, sempre particionados por `userId`, são preservados:

- tentativas locais, inclusive ainda não sincronizadas;
- fila persistente de sincronização;
- manifests recuperáveis;
- snapshots de sessão e progresso necessários para retomada.

Outro usuário autenticado consulta apenas as próprias chaves. Quando o usuário original entra novamente, seus dados locais podem ser hidratados e a fila pendente pode retomar a sincronização. O logout não depende de flush remoto para evitar perda.

O indicador da Fase 3B considera separadamente tentativas e manifests e só informa `Sincronizado` quando as duas filas estão vazias e sem falha.

## Registro da execução manual

A execução já ocorreu fora do fluxo automatizado desta entrega. Não reaplique a migration por meio da Fase 3B. O checklist abaixo permanece como registro histórico do procedimento controlado:

Antes de qualquer execução:

1. confira se o ambiente selecionado é o projeto correto;
2. mantenha um backup válido do banco;
3. abra `supabase/migrations/20260725_remote_attempts_spaced_repetition.sql`;
4. revise o schema documentado de `tentativas`, especialmente os tipos das colunas legadas;
5. execute o arquivo uma única vez pelo SQL Editor do Supabase ou pelo fluxo de migrations adotado pela equipe;
6. não use `service_role` no frontend e não copie chaves para o repositório.

A migration interrompe com erro, antes das alterações, se o contrato legado confirmado não existir ou tiver tipos/nullability incompatíveis. Se já houver tabelas ou constraints com os mesmos nomes e estrutura incompatível, interrompa e revise o conflito em vez de adaptar dados históricos automaticamente.

## Verificação somente de leitura

As consultas abaixo não alteram dados:

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('questoes', 'revisoes_questoes', 'sessoes_estudo', 'tentativas')
order by table_name, ordinal_position;
```

```sql
select column_name, data_type, is_nullable, is_identity, column_default
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'questoes' and column_name in ('id', 'tipo', 'resposta_correta', 'aula_id'))
    or (
      table_name = 'tentativas'
      and column_name in (
        'id', 'questao_id', 'aula_id', 'tipo', 'resposta_aluno',
        'resposta_correta', 'acertou', 'feedback', 'tempo_segundos',
        'respondido_em', 'modo_estudo', 'dicas_usadas', 'score', 'metadados',
        'user_id', 'attempt_id', 'session_id', 'result_status',
        'client_created_at', 'synced_at'
      )
    )
  )
order by table_name, ordinal_position;
```

O resultado esperado para `tentativas.acertou` após a execução manual é `is_nullable = 'YES'`.

```sql
select
  constraint_name,
  delete_rule,
  update_rule
from information_schema.referential_constraints
where constraint_schema = 'public'
  and constraint_name in (
    'tentativas_user_fk',
    'revisoes_questoes_user_fk',
    'sessoes_estudo_user_fk'
  )
order by constraint_name;
```

O resultado esperado para `tentativas_user_fk` é `delete_rule = 'SET NULL'`.

```sql
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('revisoes_questoes', 'sessoes_estudo', 'tentativas')
order by tablename, policyname;
```

```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('revisoes_questoes', 'sessoes_estudo', 'tentativas')
order by tablename, indexname;
```

```sql
select routine_name, security_type, data_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'registrar_tentativa_estudo';
```

```sql
select
  has_function_privilege(
    'authenticated',
    p.oid,
    'EXECUTE'
  ) as authenticated_can_execute,
  has_function_privilege(
    'anon',
    p.oid,
    'EXECUTE'
  ) as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'registrar_tentativa_estudo';
```

## Ativação e desativação das escritas

Depois de aplicar e verificar manualmente a migration, configure no ambiente do frontend:

```text
VITE_ENABLE_SUPABASE_WRITES=true
```

Uma nova compilação é necessária porque a flag é lida pelo Vite. Para interromper rapidamente novas escritas remotas, volte a configuração para:

```text
VITE_ENABLE_SUPABASE_WRITES=false
```

e gere uma nova compilação. As tentativas continuam sendo salvas localmente. Desabilitar a flag não remove dados remotos nem locais.

## Riscos e pendências

- A migration foi executada manualmente e as 11 verificações operacionais informadas passaram.
- O contrato legado documentado é validado no começo da migration; qualquer divergência deve ser revisada manualmente antes da execução.
- A fila de tentativas é persistente por usuário e tolera múltiplas abas por meio da idempotência da RPC, mas não substitui coordenação distribuída.
- A Fase 3B adicionou fila persistente e recuperação de manifests; a ativação real de writes e a validação end-to-end ainda estão pendentes.
- Não foram adicionados Realtime, PWA, notificações push ou motor Python.
