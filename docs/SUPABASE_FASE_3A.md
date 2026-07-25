# Supabase — Fase 3A

## Estado desta entrega

A migration `20260725_remote_attempts_spaced_repetition.sql` foi criada para revisão, mas não foi executada no projeto Supabase. As escritas remotas continuam desabilitadas por padrão com:

```text
VITE_ENABLE_SUPABASE_WRITES=false
```

O aplicativo permanece local-first e continua funcionando somente com o armazenamento do navegador enquanto essa flag estiver desabilitada.

## Finalidade da migration

A migration adiciona a infraestrutura necessária para:

- registrar tentativas autenticadas com idempotência por usuário e `attempt_id`;
- manter revisão espaçada separada por usuário e questão;
- preparar manifests de sessão para sincronização remota;
- executar tentativa, revisão e avanço de sessão na mesma transação;
- manter linhas históricas de `tentativas` sem `user_id` ou `attempt_id`;
- impedir leitura cruzada entre usuários com RLS.

Ela não contém `DROP`, `TRUNCATE` ou exclusão de dados. Também não altera `questoes.resposta_correta` nem usa os campos globais antigos de revisão da tabela `questoes`.

## Tabelas e colunas

### `revisoes_questoes`

Nova tabela com chave primária composta `(user_id, questao_id)`. Armazena sequência de acertos, totais, próxima revisão, última resposta e último `attempt_id` aplicado.

O tipo de `questao_id` é derivado de `public.questoes.id` durante a migration. Assim, o script não pressupõe se o identificador atual é `integer`, `bigint` ou outro tipo escalar compatível.

### `sessoes_estudo`

Nova tabela para o espelho remoto de `SessionManifest`:

- `id`, `user_id` e `schema_version`;
- `source` e `criteria` em JSONB;
- `question_ids` com o mesmo tipo de `questoes.id`;
- `status`, `current_index` e timestamps.

Um trigger impede qualquer alteração posterior de `question_ids`. A aplicação ainda usa o manifest local como resposta imediata; recuperação completa entre dispositivos fica para a Fase 3B.

### `tentativas`

São adicionadas, somente quando ausentes:

- `user_id`;
- `attempt_id`;
- `session_id`;
- `result_status`;
- `client_created_at`;
- `synced_at`.

O índice único parcial `(user_id, attempt_id)` aplica idempotência às novas tentativas e permite que linhas históricas com valores nulos continuem existindo.

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

## Como executar manualmente

Antes de qualquer execução:

1. confira se o ambiente selecionado é o projeto correto;
2. mantenha um backup válido do banco;
3. abra `supabase/migrations/20260725_remote_attempts_spaced_repetition.sql`;
4. revise o schema documentado de `tentativas`, especialmente os tipos das colunas legadas;
5. execute o arquivo uma única vez pelo SQL Editor do Supabase ou pelo fluxo de migrations adotado pela equipe;
6. não use `service_role` no frontend e não copie chaves para o repositório.

A migration interrompe com erro, sem ação destrutiva, se `public.questoes.id` não existir. Se já houver tabelas com os mesmos nomes e estrutura incompatível, interrompa e revise o conflito em vez de adaptar dados históricos automaticamente.

## Verificação somente de leitura

As consultas abaixo não alteram dados:

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('revisoes_questoes', 'sessoes_estudo', 'tentativas')
order by table_name, ordinal_position;
```

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

- A migration foi validada estaticamente e por testes, não contra o projeto real.
- As colunas legadas de `tentativas` foram consideradas conforme o contexto atual do projeto; divergências de tipo devem ser revisadas antes da execução.
- A fila de tentativas é persistente por usuário e tolera múltiplas abas por meio da idempotência da RPC, mas não substitui coordenação distribuída.
- Manifests são enviados em modo best-effort; reconciliação persistente e recuperação completa entre dispositivos ficam para a Fase 3B.
- Não foram adicionados Realtime, PWA, página Progresso, gráficos, revisão do dia ou motor Python.
