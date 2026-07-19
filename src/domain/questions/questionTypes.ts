// Discriminated union of question types the app supports.
// Everything else is either "unsupported" or "invalid".

export type SupportedKind = "MC" | "READING_MC" | "LISTENING_MC" | "TF" | "FB" | "ORDER";

export type UnsupportedKind =
  | "DIALOGUE_ORDER"
  | "MATCHING"
  | "CLASSIFY"
  | "CORRECTION"
  | "SHORT_ANSWER"
  | "OPEN"
  | "DICTATION"
  | "FLASHCARD"
  | "MICROSCENARIO"
  | "PRONUNCIATION"
  | "UNKNOWN";

export interface RawQuestion {
  id: number;
  aula_id: number | null;
  tipo: string | null;
  enunciado: string | null;
  opcoes: string | null;
  resposta_correta: string | null;
  explicacao: string | null;
  traducao: string | null;
  audio_texto: string | null;
  sessao: number;
  ordem: number;
  dificuldade: number;
  metadados: unknown;
}

export interface BaseQuestion {
  id: number;
  aulaId: number | null;
  enunciado: string;
  explicacao: string;
  traducao: string;
  sessao: number;
  ordem: number;
}

export interface MCQuestion extends BaseQuestion {
  kind: "MC" | "READING_MC" | "LISTENING_MC";
  options: string[];
  canonicalAnswerText: string;
  supportText?: string;
  audioText?: string;
}

export interface TFQuestion extends BaseQuestion {
  kind: "TF";
  canonicalAnswerText: string; // "True" | "False" (canonical)
}

export interface FBQuestion extends BaseQuestion {
  kind: "FB";
  canonicalAnswerText: string;
  hintOptions?: string[];
}

export interface OrderBlock {
  id: string; // per-occurrence id "0:Where", "1:are"
  text: string;
}

export interface ORDERQuestion extends BaseQuestion {
  kind: "ORDER";
  availableBlocks: OrderBlock[]; // canonical order (never mutated)
  shuffledBlocks: OrderBlock[]; // presentation copy
  canonicalSequence: string[]; // words in canonical order (never mutated)
  canonicalAnswerText: string; // canonical joined form
}

export type ValidQuestion = MCQuestion | TFQuestion | FBQuestion | ORDERQuestion;

export type QuestionEntry =
  | { status: "valid"; question: ValidQuestion }
  | { status: "repairable"; question: ValidQuestion; notes: string[] }
  | { status: "invalid"; id: number; tipo: string | null; reason: string }
  | { status: "unsupported"; id: number; tipo: string; reason: string };

export const SUPPORTED_KINDS: readonly SupportedKind[] = [
  "MC",
  "READING_MC",
  "LISTENING_MC",
  "TF",
  "FB",
  "ORDER",
] as const;

export const UNSUPPORTED_KINDS: readonly UnsupportedKind[] = [
  "DIALOGUE_ORDER",
  "MATCHING",
  "CLASSIFY",
  "CORRECTION",
  "SHORT_ANSWER",
  "OPEN",
  "DICTATION",
  "FLASHCARD",
  "MICROSCENARIO",
  "PRONUNCIATION",
  "UNKNOWN",
] as const;
