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
  definition_english?: string;
  usage_note_ptbr?: string;
}

export interface DialogueLine {
  speaker?: string;
  text_english?: string;
  translation_ptbr?: string;
}

export interface Dialogue {
  title?: string;
  kind?: string;
  original_english?: string;
  translation_ptbr?: string;
  comprehension_points_ptbr: string[];
  lines: DialogueLine[];
}

export interface AulaContent {
  objectives: string[];
  keyTakeaways: string[];
  preActivityReview: string[];
  overview?: string;
  lessonLevel?: string;
  themeTranslation?: string;
  grammarFocus: string[];
  grammar: GrammarItem[];
  vocabulary: VocabItem[];
  timeline: {
    timestamp?: string;
    start?: string;
    end?: string;
    description?: string;
    source?: string;
  }[];
  dialogues: Dialogue[];
  corrections: { original?: string; corrected?: string; note?: string }[];
  pronunciation: { term?: string; tip?: string; phonetic?: string; timestamp?: string }[];
  visuals: { title?: string; description?: string; groups: Record<string, string[]> }[];
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
    meaning_ptbr: str(v.meaning_ptbr ?? v.meaning ?? v.translation_ptbr),
    example_en: str(v.example_en ?? v.example ?? v.example_from_lesson),
    definition_english: str(v.definition_english),
    usage_note_ptbr: str(v.usage_note_ptbr),
  }));
  const timeline = toArray<Record<string, unknown>>(root.timeline).map((t) => ({
    timestamp: str(t.timestamp ?? t.start),
    start: str(t.start),
    end: str(t.end),
    description: str(t.description ?? t.text ?? t.content),
    source: str(t.source),
  }));
  const dialogues: Dialogue[] = toArray<Record<string, unknown>>(
    root.dialogues ?? root.texts_and_dialogues,
  ).map((d) => ({
    title: str(d.title),
    kind: str(d.kind),
    original_english: str(d.original_english),
    translation_ptbr: str(d.translation_ptbr),
    comprehension_points_ptbr: toArray<unknown>(d.comprehension_points_ptbr)
      .map((item) => String(item).trim())
      .filter(Boolean),
    lines: toArray<Record<string, unknown>>(d.lines).map((l) => ({
      speaker: str(l.speaker),
      text_english: str(l.text_english),
      translation_ptbr: str(l.translation_ptbr),
    })),
  }));
  const corrections = toArray<Record<string, unknown>>(
    root.corrections ?? root.corrections_and_doubts,
  ).map((c) => ({
    original: str(c.original ?? c.original_or_question),
    corrected: str(c.corrected ?? c.answer_or_correction),
    note: str(c.note ?? c.explanation_ptbr),
  }));
  const pronunciation = toArray<Record<string, unknown>>(root.pronunciation_tips).map((item) => ({
    term: str(item.term),
    tip: str(item.teacher_tip_ptbr),
    phonetic: str(item.phonetic_support),
    timestamp: str(item.timestamp),
  }));
  const visuals = toArray<Record<string, unknown>>(
    root.visuals ?? root.visual_resources ?? root.visual_aids,
  ).map((v) => {
    const rawGroups = toObject(v.groups);
    const groups = Object.fromEntries(
      Object.entries(rawGroups).map(([name, items]) => [
        name,
        toArray<unknown>(items)
          .map((item) => String(item).trim())
          .filter(Boolean),
      ]),
    );
    return {
      title: str(v.title),
      description: str(v.description ?? v.subtitle_ptbr),
      groups,
    };
  });
  const sessions = toArray<Record<string, unknown>>(root.sessions).map((s) => ({
    name: str(s.name),
    description: str(s.description),
  }));
  const objectives = toArray<unknown>(root.objectives ?? root.learning_objectives_ptbr)
    .map((o) => String(o))
    .filter(Boolean);
  const keyTakeaways = toArray<unknown>(root.key_takeaways_ptbr)
    .map((item) => String(item).trim())
    .filter(Boolean);
  const preActivityReview = toArray<unknown>(root.pre_activity_review_ptbr)
    .map((item) => String(item).trim())
    .filter(Boolean);
  const grammarFocus = toArray<unknown>(root.grammar_focus)
    .map((item) => String(item).trim())
    .filter(Boolean);
  return {
    objectives,
    keyTakeaways,
    preActivityReview,
    overview: str(root.overview_ptbr),
    lessonLevel: str(root.lesson_level),
    themeTranslation: str(root.theme_translation_ptbr),
    grammarFocus,
    grammar,
    vocabulary,
    timeline,
    dialogues,
    corrections,
    pronunciation,
    visuals,
    sessions,
  };
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
