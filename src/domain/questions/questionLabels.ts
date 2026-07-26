import type { SupportedKind } from "./questionTypes";

export const QUESTION_KIND_LABELS_PT_BR: Record<SupportedKind, string> = {
  MC: "Múltipla escolha",
  READING_MC: "Compreensão de leitura",
  LISTENING_MC: "Compreensão auditiva",
  TF: "Verdadeiro ou falso",
  FB: "Completar lacuna",
  ORDER: "Organizar frase",
  DIALOGUE_ORDER: "Organizar diálogo",
  SHORT_ANSWER: "Resposta curta",
  DICTATION: "Ditado",
  CORRECTION: "Correção de frase",
  MATCHING: "Relacionar pares",
  CLASSIFY: "Classificar",
  FLASHCARD: "Cartão de memória",
  OPEN: "Resposta aberta",
  MICROSCENARIO: "Situação prática",
};

export function questionKindLabelPtBr(kind: SupportedKind): string {
  return QUESTION_KIND_LABELS_PT_BR[kind];
}
