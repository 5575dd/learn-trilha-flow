// Parses aula.dados_completos defensively.
export interface Example {
  source?: string;
  timestamp?: string;
  text_english?: string;
  translation_ptbr?: string;
}

export interface GrammarItem {
  name: string;
  structure?: string;
  explanation_ptbr?: string;
  when_to_use_ptbr?: string;
  examples: Example[];
}

export interface VocabItem {
  word?: string;
  meaning_ptbr?: string;
  example_en?: string;
}

export interface DialogueLine {
  speaker?: string;
  text_english?: string;
  translation_ptbr?: string;
}

export interface Dialogue {
  title?: string;
  lines: DialogueLine[];
}

export interface AulaContent {
  objectives: string[];
  grammar: GrammarItem[];
  vocabulary: VocabItem[];
  timeline: { timestamp?: string; description?: string }[];
  dialogues: Dialogue[];
  corrections: { original?: string; corrected?: string; note?: string }[];
  visuals: { title?: string; description?: string }[];
  sessions: { name?: string; description?: string }[];
}

function toObject(v: unknown): Record<string, unknown> {
  if (v == null) return {};
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
    return {};
  }
  if (Array.isArray(v)) return {};
  if (typeof v === "object") return v as Record<string, unknown>;
  return {};
}

function toArray<T = unknown>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  return [];
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

export function parseAulaContent(input: unknown): AulaContent {
  const root = toObject(input);
  const grammarRaw = toArray<Record<string, unknown>>(root.grammar);
  const grammar: GrammarItem[] = grammarRaw.map((g) => ({
    name: String(g.name ?? "").trim(),
    structure: str(g.structure),
    explanation_ptbr: str(g.explanation_ptbr),
    when_to_use_ptbr: str(g.when_to_use_ptbr),
    examples: toArray<Record<string, unknown>>(g.examples).map((e) => ({
      source: str(e.source),
      timestamp: str(e.timestamp),
      text_english: str(e.text_english),
      translation_ptbr: str(e.translation_ptbr),
    })),
  }));
  const vocabulary: VocabItem[] = toArray<Record<string, unknown>>(root.vocabulary).map((v) => ({
    word: str(v.word ?? v.term),
    meaning_ptbr: str(v.meaning_ptbr ?? v.meaning),
    example_en: str(v.example_en ?? v.example),
  }));
  const timeline = toArray<Record<string, unknown>>(root.timeline).map((t) => ({
    timestamp: str(t.timestamp),
    description: str(t.description ?? t.text),
  }));
  const dialogues: Dialogue[] = toArray<Record<string, unknown>>(root.dialogues).map((d) => ({
    title: str(d.title),
    lines: toArray<Record<string, unknown>>(d.lines).map((l) => ({
      speaker: str(l.speaker),
      text_english: str(l.text_english),
      translation_ptbr: str(l.translation_ptbr),
    })),
  }));
  const corrections = toArray<Record<string, unknown>>(root.corrections).map((c) => ({
    original: str(c.original),
    corrected: str(c.corrected),
    note: str(c.note),
  }));
  const visuals = toArray<Record<string, unknown>>(root.visuals ?? root.visual_resources).map(
    (v) => ({
      title: str(v.title),
      description: str(v.description),
    }),
  );
  const sessions = toArray<Record<string, unknown>>(root.sessions).map((s) => ({
    name: str(s.name),
    description: str(s.description),
  }));
  const objectives = toArray<unknown>(root.objectives)
    .map((o) => String(o))
    .filter(Boolean);
  return { objectives, grammar, vocabulary, timeline, dialogues, corrections, visuals, sessions };
}

export interface RawAula {
  id: number;
  titulo: string | null;
  tema: string | null;
  resumo: string | null;
  data_aula: string | null;
  status: string;
  quantidade_atividades: number;
  dados_completos: unknown;
  nome_arquivo: string;
}

export interface Aula extends RawAula {
  content: AulaContent;
}

export function adaptAula(row: RawAula): Aula {
  return { ...row, content: parseAulaContent(row.dados_completos) };
}
