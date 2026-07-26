// Discriminated union of question types the app supports.
// PRONUNCIATION is intentionally excluded (no microphone).

export type SupportedKind =
  | "MC"
  | "READING_MC"
  | "LISTENING_MC"
  | "TF"
  | "FB"
  | "ORDER"
  | "DIALOGUE_ORDER"
  | "SHORT_ANSWER"
  | "DICTATION"
  | "CORRECTION"
  | "MATCHING"
  | "CLASSIFY"
  | "FLASHCARD"
  | "OPEN"
  | "MICROSCENARIO";

export type UnsupportedKind = "PRONUNCIATION" | "UNKNOWN";

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
  proxima_revisao_em?: string | null;
}

export interface BaseQuestion {
  id: number;
  aulaId: number | null;
  enunciado: string;
  explicacao: string;
  traducao: string;
  sessao: number;
  ordem: number;
  releaseAt?: string;
  hintsPtbr?: string[];
}

export interface MCQuestion extends BaseQuestion {
  kind: "MC" | "READING_MC" | "LISTENING_MC" | "MICROSCENARIO";
  options: string[];
  canonicalAnswerText: string;
  supportText?: string;
  audioText?: string;
}

export interface TFQuestion extends BaseQuestion {
  kind: "TF";
  canonicalAnswerText: string;
}

export interface FBQuestion extends BaseQuestion {
  kind: "FB";
  canonicalAnswerText: string;
  hintOptions?: string[];
}

export interface OrderBlock {
  id: string;
  text: string;
}

export interface ORDERQuestion extends BaseQuestion {
  kind: "ORDER" | "DIALOGUE_ORDER";
  availableBlocks: OrderBlock[];
  shuffledBlocks: OrderBlock[];
  canonicalSequence: string[];
  canonicalAnswerText: string;
  separator: " " | " | ";
}

export interface TextInputQuestion extends BaseQuestion {
  kind: "SHORT_ANSWER" | "DICTATION" | "CORRECTION";
  canonicalAnswerText: string;
  audioText?: string;
  supportText?: string;
}

export interface SelfEvalQuestion extends BaseQuestion {
  kind: "FLASHCARD" | "OPEN";
  canonicalAnswerText: string;
  frontText?: string;
  audioText?: string;
}

export interface MatchPair {
  id: string;
  left: string;
  right: string;
}

export interface MatchingQuestion extends BaseQuestion {
  kind: "MATCHING";
  pairs: MatchPair[];
  shuffledAnswers: string[];
  canonicalAnswerText: string;
}

export interface ClassificationItem {
  id: string;
  text: string;
  category: string;
}

export interface ClassifyQuestion extends BaseQuestion {
  kind: "CLASSIFY";
  categories: string[];
  items: ClassificationItem[];
  canonicalAnswerText: string;
}

export type ValidQuestion =
  | MCQuestion
  | TFQuestion
  | FBQuestion
  | ORDERQuestion
  | TextInputQuestion
  | SelfEvalQuestion
  | MatchingQuestion
  | ClassifyQuestion;

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
  "DIALOGUE_ORDER",
  "SHORT_ANSWER",
  "DICTATION",
  "CORRECTION",
  "MATCHING",
  "CLASSIFY",
  "FLASHCARD",
  "OPEN",
  "MICROSCENARIO",
] as const;

export const UNSUPPORTED_KINDS: readonly UnsupportedKind[] = ["PRONUNCIATION", "UNKNOWN"] as const;
