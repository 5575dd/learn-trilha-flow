import type { RawQuestion, QuestionEntry, ValidQuestion, OrderBlock } from "./questionTypes";
import { SUPPORTED_KINDS } from "./questionTypes";
import { normalizeAnswer } from "../answers/answerNormalizer";

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
  const s = (text ?? "")
    .trim()
    .replace(/\s+(?:\/|->|\u2192)\s+(?=[\p{L}][\p{L}\p{N} .'-]{0,39}:\s)/gu, "\n");
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

function legacyCorrection(question: string, original: string, answer: string): string | null {
  const instruction = answer.match(
    /^(?:change|replace)\s+['‘“]([^'’”]+)['’”]\s+(?:to|with)\s+['‘“]([^'’”]+)['’”]/i,
  );
  const sentence = original || question.match(/for:\s*['‘“]([^'’”]+)['’”]/i)?.[1] || "";
  if (!instruction || !sentence) return null;
  const position = sentence.toLowerCase().indexOf(instruction[1].toLowerCase());
  if (position < 0) return null;
  return `${sentence.slice(0, position)}${instruction[2]}${sentence.slice(position + instruction[1].length)}`;
}

function legacyFlashcard(text: string): { front: string; back: string } | null {
  const match = text.match(/\bFront:\s*(.*?)\s+Back:\s*(.*?)(?:\s+Tip:|$)/i);
  return match?.[1] && match?.[2] ? { front: match[1].trim(), back: match[2].trim() } : null;
}

function parseClassificationGroups(raw: unknown[]): {
  categories: string[];
  items: Array<{ id: string; text: string; category: string }>;
  repaired: boolean;
} | null {
  const groups = raw.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const group = value as Record<string, unknown>;
    const name = String(group.name ?? "").trim();
    const items = Array.isArray(group.items)
      ? group.items.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];
    return name && items.length ? [{ name, items }] : [];
  });
  const names = new Set(groups.map((group) => group.name));
  const incoming = new Map<string, number>();
  groups.forEach((group) =>
    group.items.forEach((item) => {
      if (item !== group.name && names.has(item)) {
        incoming.set(item, (incoming.get(item) ?? 0) + 1);
      }
    }),
  );
  const inverted =
    groups.length > 2 && [...incoming.values()].filter((count) => count >= 2).length === 2;
  const categories = inverted
    ? [...incoming.entries()].filter(([, count]) => count >= 2).map(([name]) => name)
    : groups.map((group) => group.name);
  if (categories.length < 2 || new Set(categories).size !== categories.length) return null;

  const assignments = new Map<string, string>();
  for (const group of groups) {
    if (categories.includes(group.name)) {
      for (const item of group.items) {
        if (categories.includes(item)) return null;
        if (assignments.has(item) && assignments.get(item) !== group.name) return null;
        assignments.set(item, group.name);
      }
    } else if (inverted) {
      const targets = group.items.filter((item) => categories.includes(item));
      if (targets.length !== 1) return null;
      if (assignments.has(group.name) && assignments.get(group.name) !== targets[0]) return null;
      assignments.set(group.name, targets[0]);
    }
  }
  if (
    assignments.size < 3 ||
    categories.some((name) => ![...assignments.values()].includes(name))
  ) {
    return null;
  }
  return {
    categories,
    items: [...assignments].map(([text, category], index) => ({
      id: `item-${index}`,
      text,
      category,
    })),
    repaired: inverted,
  };
}

export function buildOrderBlocks(options: string[]): OrderBlock[] {
  return options.map((text, idx) => ({ id: `${idx}:${text}`, text }));
}

function canAssembleOrder(options: string[], canonical: string): boolean {
  const words = canonical.split(/\s+/).map(normalizeAnswer);
  const blocks = options.map((option) => option.split(/\s+/).map(normalizeAnswer));
  if (blocks.reduce((count, block) => count + block.length, 0) !== words.length) return false;
  const failed = new Set<string>();
  const visit = (offset: number, remaining: number[]): boolean => {
    if (remaining.length === 0) return offset === words.length;
    const key = `${offset}:${remaining.join(",")}`;
    if (failed.has(key)) return false;
    for (const index of remaining) {
      const block = blocks[index];
      if (
        block.every((word, position) => words[offset + position] === word) &&
        visit(
          offset + block.length,
          remaining.filter((value) => value !== index),
        )
      )
        return true;
    }
    failed.add(key);
    return false;
  };
  return visit(
    0,
    blocks.map((_, index) => index),
  );
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
    releaseAt: (row.proxima_revisao_em ?? "").trim() || undefined,
    hintsPtbr: Array.isArray(meta.hints_ptbr)
      ? meta.hints_ptbr.map((item) => String(item).trim()).filter(Boolean)
      : [],
  };

  if (!kind) return { status: "invalid", id: row.id, tipo: row.tipo, reason: "tipo ausente" };
  if (!SUPPORTED_KINDS.includes(kind as never)) {
    return { status: "unsupported", id: row.id, tipo: kind, reason: "tipo não suportado" };
  }

  // Self-eval kinds may have empty canonical (FLASHCARD often only has frontText/back).
  const canonicalOptionalKinds = ["FLASHCARD", "OPEN", "MATCHING", "CLASSIFY"] as const;
  const requiresCanonical = !canonicalOptionalKinds.includes(
    kind as (typeof canonicalOptionalKinds)[number],
  );
  if (requiresCanonical && !canonical) {
    return { status: "invalid", id: row.id, tipo: kind, reason: "resposta_correta ausente" };
  }

  const notes: string[] = [];
  let repaired = false;

  if (
    kind === "MC" ||
    kind === "READING_MC" ||
    kind === "LISTENING_MC" ||
    kind === "MICROSCENARIO"
  ) {
    const options = parseOptions(row.opcoes, meta);
    if (options.length < 2) {
      return { status: "invalid", id: row.id, tipo: kind, reason: "opções insuficientes" };
    }
    if (new Set(options.map((option) => option.toLocaleLowerCase())).size !== options.length) {
      return { status: "invalid", id: row.id, tipo: kind, reason: "opções repetidas" };
    }
    const supportText = String(meta.support_text ?? "").trim();
    const audioText = (row.audio_texto ?? "").trim();
    if (kind === "READING_MC" && (!supportText || supportText === enunciado)) {
      return { status: "invalid", id: row.id, tipo: kind, reason: "texto de leitura ausente" };
    }
    if (kind === "MICROSCENARIO" && (!supportText || supportText === enunciado)) {
      return { status: "invalid", id: row.id, tipo: kind, reason: "cenário ausente" };
    }
    if (kind === "LISTENING_MC" && (!audioText || audioText === enunciado)) {
      return { status: "invalid", id: row.id, tipo: kind, reason: "áudio da questão ausente" };
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
      supportText: kind === "READING_MC" || kind === "MICROSCENARIO" ? supportText : undefined,
      audioText: kind === "LISTENING_MC" ? audioText : undefined,
    };
    return repaired
      ? { status: "repairable", question: q, notes }
      : { status: "valid", question: q };
  }

  if (kind === "TF") {
    if (/\b(base validada|validated base)\b/i.test(enunciado)) {
      return {
        status: "invalid",
        id: row.id,
        tipo: kind,
        reason: "afirmação de verdadeiro ou falso incompleta",
      };
    }
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
    if ((enunciado.match(/_{2,}/g) ?? []).length !== 1) {
      return { status: "invalid", id: row.id, tipo: kind, reason: "lacuna ausente ou repetida" };
    }
    if (
      options.length > 0 &&
      !options.some((option) => option.toLocaleLowerCase() === canonical.toLocaleLowerCase())
    ) {
      return {
        status: "invalid",
        id: row.id,
        tipo: kind,
        reason: "gabarito fora das opções de lacuna",
      };
    }
    const q: ValidQuestion = {
      ...base,
      kind: "FB",
      canonicalAnswerText: canonical,
      hintOptions: options.length > 0 ? options : undefined,
    };
    return { status: "valid", question: q };
  }

  if (kind === "ORDER") {
    let options = parseOptions(row.opcoes, meta);
    if (options.length < 2) {
      return {
        status: "invalid",
        id: row.id,
        tipo: kind,
        reason: "blocos insuficientes para ORDER",
      };
    }
    // Older generators supplied whole-sentence alternatives instead of word blocks.
    if (
      options.some((option) => normalizeAnswer(option) === normalizeAnswer(canonical)) &&
      options.every((option) => option.split(/\s+/).length >= 2)
    ) {
      options = canonical.split(/\s+/);
      repaired = true;
      notes.push("blocos recuperados das alternativas de frase antigas");
    }
    if (!canAssembleOrder(options, canonical)) {
      return { status: "invalid", id: row.id, tipo: kind, reason: "blocos não formam o gabarito" };
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
      separator: " ",
    };
    return repaired
      ? { status: "repairable", question: q, notes }
      : { status: "valid", question: q };
  }

  if (kind === "DIALOGUE_ORDER") {
    // Canonical sequence lives in resposta_correta (split by | / newline / JSON array).
    const canonicalSequence = splitDialogue(canonical);
    if (canonicalSequence.length < 2) {
      return {
        status: "invalid",
        id: row.id,
        tipo: kind,
        reason: "sequência de diálogo insuficiente",
      };
    }
    // Blocks come from opcoes / raw_options when present; otherwise fall back to canonical lines.
    const optRaw = parseOptions(row.opcoes, meta);
    const remaining = [...canonicalSequence];
    const matchesCanonical =
      optRaw.length === canonicalSequence.length &&
      optRaw.every((line) => {
        const index = remaining.findIndex(
          (expected) => normalizeAnswer(expected) === normalizeAnswer(line),
        );
        if (index < 0) return false;
        remaining.splice(index, 1);
        return true;
      });
    const blockTexts = matchesCanonical ? optRaw : canonicalSequence;
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
    const original = String(meta.original ?? "").trim();
    if (
      kind === "DICTATION" &&
      (!row.audio_texto?.trim() ||
        row.audio_texto.trim().toLocaleLowerCase() !== canonical.toLocaleLowerCase())
    ) {
      return {
        status: "invalid",
        id: row.id,
        tipo: kind,
        reason: "áudio do ditado não corresponde ao gabarito",
      };
    }
    const corrected =
      kind === "CORRECTION" ? legacyCorrection(enunciado, original, canonical) : null;
    if (
      kind === "CORRECTION" &&
      /^(?:change|replace|correct|fix)\b/i.test(canonical) &&
      !corrected
    ) {
      return {
        status: "invalid",
        id: row.id,
        tipo: kind,
        reason: "gabarito de correção sem frase corrigida",
      };
    }
    const answer = corrected ?? canonical;
    const q: ValidQuestion = {
      ...base,
      kind,
      canonicalAnswerText: answer,
      gradingMode:
        kind === "SHORT_ANSWER" &&
        (/^(?:explain|describe|compare|why\b|how\b|what is the difference\b)/i.test(enunciado) ||
          canonical.split(/\s+/).length > 8)
          ? "self"
          : undefined,
      audioText: kind === "DICTATION" ? (row.audio_texto ?? "").trim() || undefined : undefined,
      supportText: kind === "CORRECTION" ? original || undefined : undefined,
    };
    return corrected
      ? {
          status: "repairable",
          question: q,
          notes: ["frase corrigida recuperada do gabarito antigo"],
        }
      : { status: "valid", question: q };
  }

  if (kind === "MATCHING") {
    const rawPairs = Array.isArray(meta.pairs) ? meta.pairs : [];
    const pairs = rawPairs.flatMap((value, index) => {
      if (!value || typeof value !== "object") return [];
      const pair = value as Record<string, unknown>;
      const left = String(pair.left ?? "").trim();
      const right = String(pair.right ?? "").trim();
      return left && right ? [{ id: `pair-${index}`, left, right }] : [];
    });
    if (pairs.length < 3) {
      return {
        status: "invalid",
        id: row.id,
        tipo: kind,
        reason: "pares insuficientes para MATCHING",
      };
    }
    const q: ValidQuestion = {
      ...base,
      kind: "MATCHING",
      pairs,
      shuffledAnswers: makeShuffle(pairs.map((pair) => pair.right)),
      canonicalAnswerText: pairs.map((pair) => `${pair.left} → ${pair.right}`).join(" • "),
    };
    return { status: "valid", question: q };
  }

  if (kind === "CLASSIFY") {
    const rawCategories = Array.isArray(meta.categories) ? meta.categories : [];
    const groups = parseClassificationGroups(rawCategories);
    if (!groups) {
      return {
        status: "invalid",
        id: row.id,
        tipo: kind,
        reason: "categorias insuficientes para CLASSIFY",
      };
    }
    const q: ValidQuestion = {
      ...base,
      kind: "CLASSIFY",
      categories: groups.categories,
      items: makeShuffle(groups.items),
      canonicalAnswerText: groups.categories
        .map(
          (category) =>
            `${category}: ${groups.items
              .filter((item) => item.category === category)
              .map((item) => item.text)
              .join(", ")}`,
        )
        .join(" • "),
    };
    return groups.repaired
      ? { status: "repairable", question: q, notes: ["categorias antigas normalizadas"] }
      : { status: "valid", question: q };
  }

  if (kind === "FLASHCARD" || kind === "OPEN") {
    const legacy = kind === "FLASHCARD" ? legacyFlashcard(enunciado) : null;
    const frontText =
      legacy?.front ??
      (String(meta.front ?? meta.prompt ?? meta.scenario ?? "").trim() || enunciado);
    const q: ValidQuestion = {
      ...base,
      enunciado: legacy?.front ?? enunciado,
      kind,
      canonicalAnswerText: legacy?.back ?? canonical,
      frontText: frontText || undefined,
      audioText: (row.audio_texto ?? "").trim() || undefined,
    };
    return legacy
      ? { status: "repairable", question: q, notes: ["frente e verso separados do cartão antigo"] }
      : { status: "valid", question: q };
  }

  return { status: "invalid", id: row.id, tipo: kind, reason: "tipo não tratado" };
}
