# Fase 3B — revisão, progresso e recuperação

## Estado

A migration da Fase 3A (`20260725_remote_attempts_spaced_repetition.sql`) já foi executada manualmente no projeto Supabase correto. As 11 verificações operacionais informadas passaram, incluindo tabelas, colunas, foreign key, RLS, RPC e privilégios de `authenticated`/`anon`.

Esta entrega não executa SQL, não cria migration e não altera o schema.

## Implementado

- projeção local de revisão a partir de tentativas deduplicadas;
- leitura validada de `revisoes_questoes` e agenda dual local/remota;
- card funcional **Revisão do dia** e manifests com source `dueReview`;
- fila persistente de manifests, isolada por usuário, com deduplicação, retry, backoff e flush no evento `online`;
- hidratação e consolidação de sessões remotas sem regressão de status ou `currentIndex`;
- consolidação pura de tentativas locais e remotas por `attemptId`;
- resultado de sessão recuperável em outro dispositivo;
- rota autenticada `/progresso`, com métricas, histórico recente e desempenho por tipo quando há dados;
- indicador de sincronização que considera separadamente tentativas e sessões/manifests.

Quando a leitura remota falha ou o dispositivo está offline, o aplicativo preserva o funcionamento local e informa que os dados exibidos podem estar limitados ao dispositivo.

## Sincronização segura

- manifests usam leitura, consolidação monotônica e compare-and-swap pelo texto bruto de `updated_at`;
- uma corrida provoca nova leitura e nova consolidação, com limite explícito de três tentativas;
- status terminal, maior `currentIndex` e `questionIds` congelados não podem regredir;
- divergências de identidade, origem, critérios ou criação são conflitos permanentes;
- após autenticação, um bootstrap por usuário prepara tentativas e manifests locais antigos somente quando as escritas estiverem habilitadas;
- o bootstrap consulta IDs de tentativas remotas quando online, é idempotente e não remove dados locais.
- o round-trip de tentativas preserva em `metadados` o gabarito visual e sua normalização produzidos pelo parser/evaluator;
- `tentativas.resposta_correta` continua sendo preenchida no servidor a partir de `public.questoes`; o cliente não envia `p_resposta_correta` nem usa o gabarito visual de `metadados` para validar acerto no banco;
- linhas antigas sem os novos metadados usam o valor bruto de `resposta_correta` para exibição e o mesmo `normalizeAnswer` compartilhado pelo gameplay para normalização;
- cada snapshot incorporado à fila de manifests recebe uma `revision` positiva; sucesso ou falha de uma chamada remota só altera a revisão que efetivamente iniciou a chamada;
- alterações locais de índice ou status avançam `updatedAt` de forma estritamente monotônica, mesmo quando várias ações ocorrem no mesmo milissegundo.

Tentativas sem `clientCreatedAt` são tratadas como legado anterior às tentativas timestampadas. Entre tentativas legadas, a ordem original é preservada; o epoch é usado apenas como fallback determinístico para o cálculo de agenda. Quando a RPC informa `client_created_at_supplied=false`, a reconstrução remota mantém o campo ausente para evitar conflito artificial com a cópia local.

## Flag e ativação

`VITE_ENABLE_SUPABASE_WRITES=false` permanece sendo o padrão. Nesse modo não há chamadas de escrita remota e as leituras de tentativas, revisões e manifests remotos também permanecem desabilitadas para manter comportamento previsível.

Ainda não houve validação end-to-end em produção desta implementação. O próximo passo é uma ativação controlada da flag em ambiente autorizado, seguida de teste real de criação, sincronização, recuperação e resultado entre dispositivos.

## Fora do escopo

Não foram adicionados PWA, service worker, cache offline de assets, Realtime, notificações push, motor Python, redesign geral ou biblioteca nova de gráficos.
