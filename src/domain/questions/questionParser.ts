import type { RawQuestion, QuestionEntry, ValidQuestion, OrderBlock } from "./questionTypes";
import { SUPPORTED_KINDS } from "./questionTypes";

export function parseOptions(opcoes: string | null, metadados: unknown): string[] {
  if (metadados && typeof metadados === "object") {
    const raw = (metadados as Record<string, unknown>).raw_options;
    if (Array.isArray(raw)) {
      const arr = raw.map((v) => String(v ?? "").trim()).filter((v) => v.length > 0);
      if (arr.length > 0) return arr;
    }
  }
  const s = (opcoes ?? "").trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        const arr = parsed.map((v) => String(v ?? "").trim()).filter((v) => v.length > 0);
        if (arr.length > 0) return arr;
      }
    } catch {
      /* fall through */
    }
  }
  if (s.includes("|")) {
    return s
      .split("|")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }
  if (s.includes("\n")) {
    return s
      .split("\n")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }
  return [s];
}

// For DIALOGUE_ORDER we only split by explicit list markers (never by "." / "?").
function splitDialogue(text: string): string[] {
  const s = (text ?? "").trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v ?? "").trim()).filter((v) => v.length > 0);
      }
    } catch {
      /* ignore */
    }
  }
  if (s.includes("|")) {
    return s
      .split("|")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }
  if (s.includes("\n")) {
    return s
      .split("\n")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }
  return [s];
}

export function parseMetadados(metadados: unknown): Record<string, unknown> {
  if (metadados == null) return {};
  if (typeof metadados === "object") return metadados as Record<string, unknown>;
  if (typeof metadados === "string") {
    try {
      const parsed = JSON.parse(metadados);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
  return {};
}

export function resolveMCLetter(answer: string, options: string[]): string | null {
  const m = answer.trim().match(/^\(?([A-Ha-h])\)?\.?$/);
  if (!m) return null;
  const idx = m[1].toUpperCase().charCodeAt(0) - 65;
  if (idx < 0 || idx >= options.length) return null;
  return options[idx];
}

function normalizeKind(tipo: string | null | undefined): string {
  return String(tipo ?? "")
    .trim()
    .toUpperCase();
}

function makeShuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function buildOrderBlocks(options: string[]): OrderBlock[] {
  return options.map((text, idx) => ({ id: `${idx}:${text}`, text }));
}

export function parseQuestion(row: RawQuestion): QuestionEntry {
  const kind = normalizeKind(row.tipo);
  const meta = parseMetadados(row.metadados);
  const enunciado = (row.enunciado ?? "").trim();
  const explicacao = (row.explicacao ?? "").trim();
  const traducao = (row.traducao ?? "").trim();
  const canonical = (row.resposta_correta ?? "").trim();

  const base = {
    id: row.id,
    aulaId: row.aula_id,
    enunciado,
    explicacao,
    traducao,
    sessao: row.sessao,
    ordem: row.ordem,
  };

  if (!kind) return { status: "invalid", id: row.id, tipo: row.tipo, reason: "tipo ausente" };
  if (!SUPPORTED_KINDS.includes(kind as never)) {
    return { status: "unsupported", id: row.id, tipo: kind, reason: "tipo nÃ£o suportado" };
  }

  // Self-eval kinds may have empty canonical (FLASHCARD often only has frontText/back).
  const selfEvalKinds = ["FLASHCARD", "OPEN", "MICROSCENARIO"] as const;
  const requiresCanonical = !selfEvalKinds.includes(kind as (typeof selfEvalKinds)[number]);
  if (requiresCanonical && !canonical) {
    return { status: "invalid", id: row.id, tipo: kind, reason: "resposta_correta ausente" };
  }

  const notes: string[] = [];
  let repaired = false;

  if (kind === "MC" || kind === "READING_MC" || kind === "LISTENING_MC") {
    const options = parseOptions(row.opcoes, meta);
    if (options.length < 2) {
      return { status: "invalid", id: row.id, tipo: kind, reason: "opÃ§Ãµes insuficientes" };
    }
    let answerText = canonical;
    const letter = resolveMCLetter(canonical, options);
    if (letter) {
      if (letter !== canonical) {
        notes.push(`gabarito resolvido a partir de letra: ${canonical} -> ${letter}`);
        repaired = true;
      }
      answerText = letter;
    } else if (!options.some((o) => o === canonical)) {
      return {
        status: "invalid",
        id: row.id,
        tipo: kind,
        reason: "resposta_correta nÃ£o corresponde a nenhuma opÃ§Ã£o",
      };
    }
    const q: ValidQuestion = {
      ...base,
      kind,
      options,
      canonicalAnswerText: answerText,
      supportText:
        kind === "READING_MC" ? String(meta.support_text ?? "").trim() || undefined : undefined,
      audioText: kind === "LISTENING_MC" ? (row.audio_texto ?? "").trim() || undefined : undefined,
    };
    return repaired
      ? { status: "repairable", question: q, notes }
      : { status: "valid", question: q };
  }

  if (kind === "TF") {
    const raw = canonical.toLowerCase();
    let canonicalTF: "True" | "False" | null = null;
    if (["true", "t", "verdadeiro", "v", "1", "sim"].includes(raw)) canonicalTF = "True";
    else if (["false", "f", "falso", "0", "nÃ£o", "nao"].includes(raw)) canonicalTF = "False";
    if (!canonicalTF) {
      return { status: "invalid", id: row.id, tipo: kind, reason: "resposta_correta TF invÃ¡lida" };
    }
    if (canonicalTF !== canonical) {
      notes.push(`TF normalizado: ${canonical} -> ${canonicalTF}`);
      repaired = true;
    }
    const q: ValidQuestion = { ...base, kind: "TF", canonicalAnswerText: canonicalTF };
    return repaired
      ? { status: "repairable", question: q, notes }
      : { status: "valid", question: q };
  }

  if (kind === "FB") {
    const options = parseOptions(row.opcoes, meta);
    const q: ValidQuestion = {
      ...base,
      kind: "FB",
      canonicalAnswerText: canonical,
      hintOptions: options.length > 0 ? options : undefined,
    };
    return { status: "valid", question: q };
  }

  if (kind === "ORDER") {
    const options = parseOptions(row.opcoes, meta);
    if (options.length < 2) {
      return {
        status: "invalid",
        id: row.id,
        tipo: kind,
        reason: "blocos insuficientes para ORDER",
      };
    }
    const availableBlocks = buildOrderBlocks(options);
    const shuffledBlocks = makeShuffle(availableBlocks);
    const canonicalSequence = canonical.split(/\s+/).filter((w) => w.length > 0);
    if (canonicalSequence.length === 0) {
      return { status: "invalid", id: row.id, tipo: kind, reason: "sequÃªncia canÃ´nica vazia" };
    }
    const q: ValidQuestion = {
      ...base,
      kind: "ORDER",
      availableBlocks,
      shuffledBlocks,
      canonicalSequence,
      canonicalAnswerText: canonical,
      separator: " ",
    };
    return { status: "valid", question: q };
  }

  if (kind === "DIALOGUE_ORDER") {
    // Canonical sequence lives in resposta_correta (split by | / newline / JSON array).
    const canonicalSequence = splitDialogue(canonical);
    if (canonicalSequence.length < 2) {
      return {
        status: "invalid",
        id: row.id,
        tipo: kind,
        reason: "sequÃªncia de diÃ¡logo insuficiente",
      };
    }
    // Blocks come from opcoes / raw_options when present; otherwise fall back to canonical lines.
    const optRaw = parseOptions(row.opcoes, meta);
    const blockTexts = optRaw.length >= canonicalSequence.length ? optRaw : canonicalSequence;
    const availableBlocks = buildOrderBlocks(blockTexts);
    const shuffledBlocks = makeShuffle(availableBlocks);
    const q: ValidQuestion = {
      ...base,
      kind: "DIALOGUE_ORDER",
      availableBlocks,
      shuffledBlocks,
      canonicalSequence,
      canonicalAnswerText: canonicalSequence.join(" | "),
      separator: " | ",
    };
    return { status: "valid", question: q };
  }

  if (kind === "SHORT_ANSWER" || kind === "DICTATION" || kind === "CORRECTION") {
    const q: ValidQuestion = {
      ...base,
      kind,
      canonicalAnswerText: canonical,
      audioText: kind === "DICTATION" ? (row.audio_texto ?? "").trim() || undefined : undefined,
      supportText:
        kind === "CORRECTION" ? String(meta.original ?? "").trim() || undefined : undefined,
    };
    return { status: "valid", question: q };
  }

  if (kind === "FLASHCARD" || kind === "OPEN" || kind === "MICROSCENARIO") {
    const frontText = String(meta.front ?? meta.prompt ?? meta.scenario ?? "").trim() || enunciado;
    const q: ValidQuestion = {
      ...base,
      kind,
      canonicalAnswerText: canonical,
      frontText: frontText || undefined,
      audioText: (row.audio_texto ?? "").trim() || undefined,
    };
    return { status: "valid", question: q };
  }

  return { status: "invalid", id: row.id, tipo: kind, reason: "tipo nÃ£o tratado" };
}
