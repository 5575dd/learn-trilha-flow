import { getSupabase } from "@/lib/supabase";
import { adaptAula, type Aula, type RawAula } from "./adapters/aulaAdapter";
import type { RawQuestion } from "@/domain/questions/questionTypes";

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
  const { data, error } = await getSupabase()
    .from("questoes")
    .select(
      "id, aula_id, tipo, enunciado, opcoes, resposta_correta, explicacao, traducao, audio_texto, sessao, ordem, dificuldade, metadados",
    )
    .eq("aula_id", aulaId)
    .order("sessao", { ascending: true })
    .order("ordem", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RawQuestion[];
}

export async function listHistorico(): Promise<{ data_estudo: string | null }[]> {
  const { data, error } = await getSupabase()
    .from("historico_estudo")
    .select("data_estudo")
    .order("data_estudo", { ascending: false });
  if (error) throw error;
  return (data ?? []) as { data_estudo: string | null }[];
}
