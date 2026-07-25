import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260725_remote_attempts_spaced_repetition.sql"),
  "utf8",
).toLocaleLowerCase("pt-BR");
const documentation = readFileSync(join(process.cwd(), "docs/SUPABASE_FASE_3A.md"), "utf8");

describe("phase 3A migration contract", () => {
  it("is additive and contains no destructive data statement", () => {
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint|index|schema)\b/);
    expect(migration).not.toMatch(/\btruncate\b/);
    expect(migration).not.toMatch(/\bdelete\s+from\b/);
    expect(migration).toContain("add column if not exists");
    expect(migration.match(/\bdrop\s+not\s+null\b/g)).toHaveLength(1);
  });

  it("validates the confirmed legacy schema before any main alteration", () => {
    const validationIndex = migration.indexOf("do $schema_validation$");
    const nullableIndex = migration.indexOf("alter column acertou drop not null");
    const migrationIndex = migration.indexOf("do $migration$");
    expect(validationIndex).toBeGreaterThanOrEqual(0);
    expect(nullableIndex).toBeGreaterThan(validationIndex);
    expect(migrationIndex).toBeGreaterThan(nullableIndex);

    for (const contract of [
      "('questoes', 'id', 'integer', true)",
      "('questoes', 'aula_id', 'bigint', false)",
      "('tentativas', 'id', 'bigint', true)",
      "('tentativas', 'questao_id', 'bigint', true)",
      "('tentativas', 'aula_id', 'bigint', false)",
      "('tentativas', 'tipo', 'text', false)",
      "('tentativas', 'resposta_aluno', 'text', false)",
      "('tentativas', 'resposta_correta', 'text', false)",
      "('tentativas', 'acertou', 'boolean', null::boolean)",
      "('tentativas', 'feedback', 'text', false)",
      "('tentativas', 'tempo_segundos', 'integer', true)",
      "('tentativas', 'respondido_em', 'timestamp with time zone', true)",
      "('tentativas', 'modo_estudo', 'text', false)",
      "('tentativas', 'dicas_usadas', 'integer', true)",
      "('tentativas', 'score', 'integer', false)",
      "('tentativas', 'metadados', 'jsonb', true)",
    ]) {
      expect(migration).toContain(contract);
    }
    expect(migration).toContain("attribute.attidentity in ('a', 'd')");
    expect(migration).toContain("migration interrompida antes das alterações");
  });

  it("validates integer question IDs and derives that type for new structures", () => {
    expect(migration).toContain("format_type(attribute.atttypid");
    expect(migration).toContain("question_id_type");
  });

  it("defines the same spaced repetition intervals as TypeScript", () => {
    expect(migration).toContain("interval '4 hours'");
    expect(migration).toContain("interval '1 day'");
    expect(migration).toContain("interval '3 days'");
    expect(migration).toContain("interval '7 days'");
    expect(migration).toContain("interval '14 days'");
    expect(migration).toContain("interval '30 days'");
  });

  it("uses authenticated identity and an explicit security-definer search path", () => {
    expect(migration).toContain("authenticated_user := auth.uid()");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain("revoke all on function");
    expect(migration).toContain("from anon");
  });

  it("creates partial idempotency without invalidating historical null rows", () => {
    expect(migration).toContain("tentativas_user_attempt_unique");
    expect(migration).toContain("where user_id is not null and attempt_id is not null");
    expect(migration).toContain("on conflict (user_id, attempt_id)");
  });

  it("makes acertou nullable before defining the RPC and preserves tri-state semantics", () => {
    const nullableIndex = migration.indexOf("alter column acertou drop not null");
    const rpcIndex = migration.indexOf(
      "create or replace function public.registrar_tentativa_estudo",
    );
    expect(nullableIndex).toBeGreaterThanOrEqual(0);
    expect(nullableIndex).toBeLessThan(rpcIndex);
    expect(migration).toContain("when p_result_status = 'correct' then true");
    expect(migration).toContain("when p_result_status = 'incorrect' then false");
    expect(migration).toContain("else null");
    expect(migration).not.toMatch(/update\s+public\.tentativas\s+set\s+acertou/);
  });

  it("preserves attempts when an authentication user is deleted", () => {
    const start = migration.indexOf("add constraint tentativas_user_fk");
    const end = migration.indexOf("if not exists (", start);
    const foreignKeyContract = migration.slice(start, end);
    expect(foreignKeyContract).toContain("on delete set null");
    expect(foreignKeyContract).not.toContain("on delete cascade");
  });

  it("compares the complete semantic payload before accepting a duplicate", () => {
    const start = migration.indexOf("if not attempt_inserted then");
    const end = migration.indexOf(
      "if attempt_inserted and p_result_status in ('correct', 'incorrect')",
      start,
    );
    const duplicateContract = migration.slice(start, end);
    for (const field of [
      "questao_id",
      "session_id",
      "resposta_aluno",
      "result_status",
      "tempo_ms",
      "modo_estudo",
      "client_created_at",
      "feedback",
      "payload_metadados",
    ]) {
      expect(duplicateContract).toContain(field);
    }
    expect(duplicateContract).toContain("payload diferente");
    expect(duplicateContract).toContain("errcode = '23505'");
  });

  it("keeps neutral, skipped, and invalid outside review counters", () => {
    expect(migration).toContain(
      "if attempt_inserted and p_result_status in ('correct', 'incorrect')",
    );
    expect(migration).toContain("'neutral', 'skipped', 'invalid'");
  });

  it("protects frozen question IDs and enables RLS", () => {
    expect(migration).toContain("question_ids de uma sessão são imutáveis");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("as restrictive");
  });

  it("does not use a service role or mutate global question review fields", () => {
    expect(migration).not.toContain("service_role");
    expect(migration).not.toMatch(/update\s+public\.questoes/);
  });

  it("documents the confirmed schema and the safe operational state", () => {
    for (const text of [
      "questoes.id",
      "integer",
      "tentativas.questao_id",
      "bigint",
      "acertou",
      "ON DELETE SET NULL",
      "migration foi executada manualmente",
      "11 verificações operacionais",
      "VITE_ENABLE_SUPABASE_WRITES=false",
    ]) {
      expect(documentation).toContain(text);
    }
  });
});
