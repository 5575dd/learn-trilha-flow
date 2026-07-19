import type { RawQuestion, QuestionEntry, ValidQuestion, OrderBlock } from "./questionTypes";
import { SUPPORTED_KINDS } from "./questionTypes";

// Parse `opcoes` (text) with priority:
// 1. metadados.raw_options if valid array
// 2. opcoes as JSON array text
// 3. opcoes split by "|"
// 4. opcoes split by newline
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

// Resolve MC gabarito if it comes as a letter "A", "B)", "(C)" etc.
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

  if (!kind) {
    return { status: "invalid", id: row.id, tipo: row.tipo, reason: "tipo ausente" };
  }
  if (!SUPPORTED_KINDS.includes(kind as never)) {
    return { status: "unsupported", id: row.id, tipo: kind, reason: "tipo não suportado" };
  }
  if (!canonical) {
    return { status: "invalid", id: row.id, tipo: kind, reason: "resposta_correta ausente" };
  }

  const notes: string[] = [];
  let repaired = false;

  if (kind === "MC" || kind === "READING_MC" || kind === "LISTENING_MC") {
    const options = parseOptions(row.opcoes, meta);
    if (options.length < 2) {
      return { status: "invalid", id: row.id, tipo: kind, reason: "opções insuficientes" };
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
        reason: "resposta_correta não corresponde a nenhuma opção",
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
    else if (["false", "f", "falso", "0", "não", "nao"].includes(raw)) canonicalTF = "False";
    if (!canonicalTF) {
      return { status: "invalid", id: row.id, tipo: kind, reason: "resposta_correta TF inválida" };
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
      return { status: "invalid", id: row.id, tipo: kind, reason: "sequência canônica vazia" };
    }
    const q: ValidQuestion = {
      ...base,
      kind: "ORDER",
      availableBlocks,
      shuffledBlocks,
      canonicalSequence,
      canonicalAnswerText: canonical,
    };
    return { status: "valid", question: q };
  }

  return { status: "invalid", id: row.id, tipo: kind, reason: "tipo não tratado" };
}
