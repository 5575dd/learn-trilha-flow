# TRILHA ENGLISH REVIEW — CONTEXTO PARA O CODEX

## Objetivo

Aplicativo pessoal mobile-first para transformar aulas de inglês já processadas em resumo estruturado, atividades interativas, revisão espaçada, histórico e progresso.

Fluxo desejado:

1. Motor Python processa gravação e materiais.
2. Motor grava aula e questões no Supabase.
3. Frontend detecta nova aula automaticamente.
4. Usuário estuda no celular.
5. Tentativas, revisão, histórico e progresso são salvos.
6. Sessões podem ser retomadas sem duplicidade.

## Repositório

- GitHub: `5575dd/learn-trilha-flow`
- Projeto inicialmente construído no Lovable.
- Codex será responsável pela engenharia.
- Lovable será usado depois principalmente para design e UX.
- Não trabalhar simultaneamente no Codex e Lovable na mesma branch.

## Stack

- React
- TypeScript
- Vite
- React Router
- React Query
- Supabase JS
- Vitest / Testing Library
- Tailwind

## Estado real após a implementação da Fase 3B

- `SessionManifest` local versionado com IDs de questões ordenados e congelados.
- `manifestStore` isolado por usuário, com validação, recuperação, abandono, conclusão e sincronização básica entre abas.
- Builders puros para aula completa, sessão rápida, erros locais e prática por tipo.
- Consulta de questões por IDs preserva a ordem do manifest e informa IDs ausentes.
- `StudySession` continua sendo o único núcleo de reducer, avaliação, feedback, deduplicação e tempo por questão.
- `SessionRunner` adapta esse núcleo para manifests e trata questões removidas ou não suportadas.
- Rotas autenticadas reais: `/estudar`, `/sessao?m=<id>` e `/sessao/resultado?m=<id>`.
- Cards funcionais para continuar, sessão rápida, erros locais, aula e tipo.
- Rotas antigas por aula permanecem ativas durante a transição e reutilizam o mesmo núcleo.
- `SupabaseAttemptRepository` chama a RPC autenticada, valida respostas e reconstrói tentativas sem confiar em linhas malformadas.
- `DualAttemptRepository` salva localmente primeiro e usa uma fila persistente, deduplicada e isolada por usuário.
- A fila trata reload, JSON inválido, quota, retry com backoff limitado, evento online e flush concorrente.
- O manifest local permanece como resposta imediata e agora entra em fila persistente com deduplicação, retry, backoff, sobrevivência a reload e flush no evento online.
- Manifests remotos são sincronizados por compare-and-swap do `updated_at` bruto, com retry limitado e consolidação monotônica que não mistura usuários, altera `questionIds`, regride status terminal ou reduz `currentIndex`.
- A fila de manifests usa uma `revision` positiva independente de `updatedAt`; uma confirmação ou falha remota só afeta o snapshot que iniciou a chamada, inclusive quando outro snapshot é enfileirado no mesmo milissegundo.
- Mutações locais de índice e status avançam `updatedAt` monotonicamente sem alterar `createdAt`.
- Tentativas locais e remotas são consolidadas por `attemptId`; conflitos preservam o dado local e geram aviso sanitizado.
- O round-trip remoto preserva em `metadados` o gabarito visual e normalizado do evaluator, enquanto `tentativas.resposta_correta` permanece sob autoridade do servidor a partir de `public.questoes`; o cliente nunca envia `p_resposta_correta`.
- Tentativas remotas antigas sem os metadados canônicos exibem o valor bruto de `resposta_correta` e aplicam o `normalizeAnswer` compartilhado.
- Um bootstrap pós-autenticação, ativo somente quando writes estiverem habilitados, prepara de forma idempotente tentativas e manifests criados anteriormente no modo local.
- Tentativas legadas sem `clientCreatedAt` permanecem sem timestamp no round-trip remoto e são projetadas antes das tentativas timestampadas, em ordem estável.
- O aplicativo mostra estado discreto das filas de tentativas e manifests e oferece nova tentativa para as duas sem expor erro técnico.
- A política pura de revisão usa 4 horas para erro e 1, 3, 7, 14 e 30 dias para acertos seguidos.
- A migration `20260725_remote_attempts_spaced_repetition.sql` foi executada manualmente no projeto correto e as 11 verificações operacionais informadas passaram.
- A rota autenticada `/progresso` mostra métricas reais, histórico recente, retomada/resultado e desempenho por tipo quando há dados suficientes.
- O card `Revisão do dia` cria manifests `dueReview` somente com questões vencidas, válidas e deduplicadas.
- Resultado e retomada usam dados consolidados e podem funcionar em outro dispositivo quando os dados remotos existem.
- `VITE_ENABLE_SUPABASE_WRITES=false` continua sendo o padrão; nesse estado nenhuma chamada remota de escrita é feita.
- O CI usa Bun e executa instalação congelada, typecheck, testes, build e lint.

### Código implementado na Fase 3A

- cálculo de revisão espaçada em TypeScript;
- RPC atômica e idempotente definida na migration;
- repositories Supabase/dual para tentativas;
- fila offline local-first;
- contratos remotos para manifests;
- indicador de sincronização;
- testes sem internet, credenciais ou Supabase real.

### Migration executada; writes ainda desabilitados

A migration validou o schema legado, tornou `tentativas.acertou` nullable para representar estados não binários e adicionou `revisoes_questoes`, `sessoes_estudo`, colunas de identidade/sincronização em `tentativas`, índices, RLS, policies e a RPC `registrar_tentativa_estudo`. A FK de usuário de `tentativas` preserva o histórico com `ON DELETE SET NULL`, e retries só são idempotentes quando todo o payload semântico coincide. A execução e as 11 verificações foram concluídas manualmente; o logout preserva tentativas, as duas filas, manifests e progresso locais isolados por usuário.

### Próximos passos

- habilitar writes de forma controlada;
- validar criação, sincronização, recuperação e resultado em dispositivos reais;
- definir observabilidade e operação das duas filas em produção.

Ainda não implementado: Realtime, PWA/service worker, notificações push, motor Python e redesign.

## Supabase

- Project ID: `sybwfjrqjrttfzbnjsva`
- URL: `https://sybwfjrqjrttfzbnjsva.supabase.co`
- RLS deve permanecer ativa.
- `authenticated` acessa conforme policies.
- `anon` não deve acessar tabelas privadas.
- Nunca colocar service_role, senha, tokens ou chave Gemini no frontend/repositório.

## Tabelas

### aulas

`id, hash_arquivo, nome_arquivo, titulo, tema, resumo, data_aula, status, erro, quantidade_atividades, dados_completos, processado_em`

### questoes

`id, aula_id, sessao, ordem, tipo, enunciado, opcoes, resposta_correta, explicacao, traducao, audio_texto, dificuldade, metadados, acertos_seguidos, total_tentativas, total_acertos, proxima_revisao, proxima_revisao_em, ultima_resposta_em, chave_unica`

### tentativas

`id, questao_id, aula_id, tipo, resposta_aluno, resposta_correta, acertou, feedback, tempo_segundos, respondido_em, modo_estudo, dicas_usadas, score, metadados, user_id, attempt_id, session_id, result_status, client_created_at, synced_at`

### revisoes_questoes

Estado de revisão por `(user_id, questao_id)`, incluindo sequência, totais, próxima revisão e último `attempt_id`.

### sessoes_estudo

Espelho remoto versionado de `SessionManifest`, com `question_ids` imutáveis, status, índice atual e timestamps.

### historico_estudo

- `data_estudo` única
- não presumir coluna `id`

## Tipos de atividade

MC, READING_MC, LISTENING_MC, TF, FB, ORDER, DIALOGUE_ORDER, MATCHING, CLASSIFY, CORRECTION, SHORT_ANSWER, DICTATION, OPEN, FLASHCARD, MICROSCENARIO.

PRONUNCIATION permanece filtrada. Sem microfone, gravação ou avaliação de pronúncia.

`resposta_correta` é a fonte canônica do gabarito.

## Revisão espaçada

- erro: 4h
- 1º acerto: 1 dia
- 2º: 3 dias
- 3º: 7 dias
- 4º: 14 dias
- 5º: 30 dias
- seguintes: 30 dias

Precisa ser idempotente contra retry, duplo clique, fila offline e retomada.

## Engenharia relatada como implementada

- 52/52 testes verdes no último relatório do Lovable
- SessionManifest
- sessionSourceBuilder
- studyCriteria
- manifestStore em localStorage
- questionIds congelados por sessão
- `/sessao?m=<id>`
- `/sessao/resultado?m=<id>`
- revisão do dia
- revisar erros
- sessão rápida
- aula pendente
- aula completa
- prática por tipo
- erros da própria sessão
- DualAttemptRepository
- fila offline
- Supabase Realtime em aulas e questões
- dashboard e página Progresso

Confirmar tudo no código real; não confiar apenas nos relatórios.

## Bug crítico já corrigido

A retomada restaurava uma questão já respondida como `ready`, e o guard de idempotência bloqueava o novo submit. A correção passou a derivar o estado pelas tentativas e restaurar `feedback/lastAttempt`, permitindo `Continuar` sem duplicar.

Preservar regressões:

- feedback restaurado
- snapshot desatualizado
- retomada em questão nova
- dedupe
- TF após retomada
- Continuar após retomada

## Fluxo de cards validado

Na página `/estudar`, os cards funcionais criam manifests locais e navegam para `/sessao?m=<id>`. A cobertura inclui:

- Revisão do dia;
- Revisar erros;
- Sessão rápida;
- aula;
- tipo de questão;
- continuação de sessão recuperável.

## Migrations citadas

- `db/20260119_authenticated_grants_rls.sql`
- `db/20260721_spaced_repetition_and_indexes.sql`

Confirmar conteúdo e estado no repositório.

## Pendências prioritárias

1. Auditar o código real sem alterar.
2. Corrigir cards da página Estudar, se ainda necessário.
3. Garantir sessões filtradas reais.
4. Registrar sessões concluídas no Supabase.
5. Tornar tentativa + revisão atômicas e idempotentes.
6. Analytics/progresso escalável.
7. Resultado de sessão completo.
8. Prática por skill e concept.
9. Parser completo de `dados_completos`.
10. Página de aula por abas.
11. PWA/offline.
12. Sincronização entre abas.
13. Diagnóstico sanitizado.
14. Contrato versionado com o motor Python.
15. Teste ponta a ponta com uma aula nova.

## Motor Python

É externo e roda no Windows. Arquivos conhecidos:

- `orquestrador.py`
- `analisador_aulas.py`
- `modelos_aula.py`
- `requirements.txt`
- scripts `.bat`

Não fingir que analisou o motor se ele não estiver no repositório. Futuramente usar outro repositório privado somente com código, sem vídeos, `.env` ou segredos.

## Regras

Nunca:

- DROP destrutivo
- TRUNCATE
- apagar tentativas
- desativar RLS
- liberar anon
- usar service_role no frontend
- expor segredos
- alterar resposta_correta
- criar dados fictícios
- processar vídeo no frontend
- criar outro Supabase
- executar `git init` no repositório existente

## Primeira tarefa recomendada ao Codex

Auditoria sem alterar arquivos:

- mapear arquitetura real
- executar typecheck, testes e build
- comparar código com este documento
- listar divergências
- identificar recursos visuais sem lógica
- apontar riscos de duplicidade, retomada e escalabilidade
- propor plano em etapas pequenas
- recomendar a primeira alteração verificável

Este documento é contexto histórico. O código real é a fonte de verdade.
