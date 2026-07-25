import { getSupabase } from "@/lib/supabase";
import { adaptAula, type Aula, type RawAula } from "./adapters/aulaAdapter";
import type { RawQuestion } from "@/domain/questions/questionTypes";

const QUESTION_COLUMNS =
  "id, aula_id, tipo, enunciado, opcoes, resposta_correta, explicacao, traducao, audio_texto, sessao, ordem, dificuldade, metadados";

export interface AulaListItem {
  id: number;
  titulo: string | null;
  tema: string | null;
  data_aula: string | null;
  status: string;
  quantidade_atividades: number;
}

export async function listAulas(): Promise<AulaListItem[]> {
  const { data, error } = await getSupabase()
    .from("aulas")
    .select("id, titulo, tema, data_aula, status, quantidade_atividades")
    .order("data_aula", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AulaListItem[];
}

export async function getAula(id: number): Promise<Aula | null> {
  assertValidId(id, "aula");
  const { data, error } = await getSupabase()
    .from("aulas")
    .select(
      "id, titulo, tema, resumo, data_aula, status, quantidade_atividades, dados_completos, nome_arquivo",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return adaptAula(data as RawAula);
}

export async function listQuestoesByAula(aulaId: number): Promise<RawQuestion[]> {
  assertValidId(aulaId, "aula");
  const { data, error } = await getSupabase()
    .from("questoes")
    .select(QUESTION_COLUMNS)
    .eq("aula_id", aulaId)
    .order("sessao", { ascending: true })
    .order("ordem", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RawQuestion[];
}

export interface QuestionsByIdsResult {
  questions: RawQuestion[];
  missingIds: number[];
}

export function normalizeQuestionIds(ids: readonly number[]): number[] {
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("Lista de IDs de questões inválida.");
  }
  return [...new Set(ids)];
}

export function orderQuestionsByIds(
  ids: readonly number[],
  rows: readonly RawQuestion[],
): QuestionsByIdsResult {
  const requested = normalizeQuestionIds(ids);
  const byId = new Map(rows.map((question) => [question.id, question]));
  return {
    questions: requested.flatMap((id) => {
      const question = byId.get(id);
      return question ? [question] : [];
    }),
    missingIds: requested.filter((id) => !byId.has(id)),
  };
}

export async function listQuestoesByIds(ids: readonly number[]): Promise<QuestionsByIdsResult> {
  const requested = normalizeQuestionIds(ids);
  if (requested.length === 0) return { questions: [], missingIds: [] };
  const { data, error } = await getSupabase()
    .from("questoes")
    .select(QUESTION_COLUMNS)
    .in("id", requested);
  if (error) throw error;
  return orderQuestionsByIds(requested, (data ?? []) as RawQuestion[]);
}

export async function listQuestoesDisponiveis(): Promise<RawQuestion[]> {
  const { data, error } = await getSupabase()
    .from("questoes")
    .select(QUESTION_COLUMNS)
    .order("aula_id", { ascending: true })
    .order("sessao", { ascending: true })
    .order("ordem", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RawQuestion[];
}

export function assertValidId(id: number, label: string): void {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`ID de ${label} inválido.`);
  }
}

export async function listHistorico(): Promise<{ data_estudo: string | null }[]> {
  const { data, error } = await getSupabase()
    .from("historico_estudo")
    .select("data_estudo")
    .order("data_estudo", { ascending: false });
  if (error) throw error;
  return (data ?? []) as { data_estudo: string | null }[];
}
