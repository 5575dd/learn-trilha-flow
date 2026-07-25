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

## Estado real após a Fase 2

- `SessionManifest` local versionado com IDs de questões ordenados e congelados.
- `manifestStore` isolado por usuário, com validação, recuperação, abandono, conclusão e sincronização básica entre abas.
- Builders puros para aula completa, sessão rápida, erros locais e prática por tipo.
- Consulta de questões por IDs preserva a ordem do manifest e informa IDs ausentes.
- `StudySession` continua sendo o único núcleo de reducer, avaliação, feedback, deduplicação e tempo por questão.
- `SessionRunner` adapta esse núcleo para manifests e trata questões removidas ou não suportadas.
- Rotas autenticadas reais: `/estudar`, `/sessao?m=<id>` e `/sessao/resultado?m=<id>`.
- Cards funcionais para continuar, sessão rápida, erros locais, aula e tipo.
- Rotas antigas por aula permanecem ativas durante a transição e reutilizam o mesmo núcleo.
- Persistência permanece local-first; não há escrita no Supabase nesta fase.
- O CI usa Bun e executa instalação congelada, typecheck, testes, build e lint.

Ainda não implementado: revisão espaçada, escrita/atomicidade no Supabase, migrations, Realtime, sincronização remota, PWA/service worker, motor Python e redesign.

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

`id, questao_id, aula_id, tipo, resposta_aluno, resposta_correta, acertou, feedback, tempo_segundos, respondido_em, modo_estudo, dicas_usadas, score, metadados`

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
- seguintes: até 60 dias

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

## Problema funcional mais recente

Na página `/estudar`, os cards apareciam, mas ao clicar/tocar nada acontecia:

- Revisão do dia
- Revisar erros
- Sessão rápida
- Aula nova
- Praticar por aula
- Praticar por tipo

Auditar:

- onClick / Link / navigate
- criação do SessionManifest
- persistência no manifestStore
- navegação para `/sessao?m=<id>`
- pointer-events/overlay
- botão `type="button"`
- erros silenciosos

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
