import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260725_remote_attempts_spaced_repetition.sql"),
  "utf8",
).toLocaleLowerCase("pt-BR");

describe("phase 3A migration contract", () => {
  it("is additive and contains no destructive data statement", () => {
    expect(migration).not.toMatch(/\bdrop\b/);
    expect(migration).not.toMatch(/\btruncate\b/);
    expect(migration).not.toMatch(/\bdelete\s+from\b/);
    expect(migration).toContain("add column if not exists");
  });

  it("derives the real question ID type instead of hardcoding it", () => {
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
});
