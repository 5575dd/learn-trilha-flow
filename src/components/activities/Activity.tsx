import { useId, useState } from "react";
import type {
  ValidQuestion,
  MCQuestion,
  TFQuestion,
  FBQuestion,
  ORDERQuestion,
  TextInputQuestion,
  SelfEvalQuestion,
  MatchingQuestion,
  ClassifyQuestion,
} from "@/domain/questions/questionTypes";
import { findPronunciationTarget } from "@/domain/questions/pronunciation";
import { AccessiblePronunciation } from "./AccessiblePronunciation";

export interface ActivityProps {
  question: ValidQuestion;
  disabled: boolean;
  onSubmit: (input: {
    text?: string;
    selectedBlockIds?: string[];
    matches?: Record<string, string>;
    classifications?: Record<string, string>;
    selfEval?: "know" | "unknown" | "skip";
  }) => void;
}

export function Activity({ question, disabled, onSubmit }: ActivityProps) {
  switch (question.kind) {
    case "MC":
    case "READING_MC":
    case "LISTENING_MC":
    case "MICROSCENARIO":
      return <MCView q={question} disabled={disabled} onSubmit={onSubmit} />;
    case "TF":
      return <TFView q={question} disabled={disabled} onSubmit={onSubmit} />;
    case "FB":
      return <FBView q={question} disabled={disabled} onSubmit={onSubmit} />;
    case "ORDER":
    case "DIALOGUE_ORDER":
      return <OrderView q={question} disabled={disabled} onSubmit={onSubmit} />;
    case "SHORT_ANSWER":
    case "DICTATION":
    case "CORRECTION":
      return <TextView q={question} disabled={disabled} onSubmit={onSubmit} />;
    case "MATCHING":
      return <MatchingView q={question} disabled={disabled} onSubmit={onSubmit} />;
    case "CLASSIFY":
      return <ClassifyView q={question} disabled={disabled} onSubmit={onSubmit} />;
    case "FLASHCARD":
    case "OPEN":
      return <SelfEvalView q={question} disabled={disabled} onSubmit={onSubmit} />;
  }
}

function Stem({
  text,
  translation,
  hints = [],
}: {
  text: string;
  translation?: string;
  hints?: string[];
}) {
  const [showTranslation, setShowTranslation] = useState(false);
  const [visibleHints, setVisibleHints] = useState(0);
  const translationId = useId();
  const hintId = useId();
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold leading-snug text-foreground">{text}</h2>
      {translation && (
        <div>
          <button
            type="button"
            aria-expanded={showTranslation}
            aria-controls={translationId}
            onClick={() => setShowTranslation((current) => !current)}
            className="min-h-11 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showTranslation ? "Ocultar tradução" : "Ver tradução"}
          </button>
          {showTranslation && (
            <p
              id={translationId}
              className="mt-2 rounded-xl bg-primary-soft p-3 text-sm leading-relaxed text-primary-soft-foreground"
            >
              {translation}
            </p>
          )}
        </div>
      )}
      {hints.length > 0 && (
        <div>
          <button
            type="button"
            aria-expanded={visibleHints > 0}
            aria-controls={hintId}
            disabled={visibleHints >= hints.length}
            onClick={() => setVisibleHints((current) => Math.min(hints.length, current + 1))}
            className="min-h-11 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {visibleHints === 0
              ? "Preciso de uma dica"
              : visibleHints < hints.length
                ? "Mostrar outra dica"
                : "Todas as dicas exibidas"}
          </button>
          {visibleHints > 0 && (
            <ol
              id={hintId}
              className="mt-2 list-decimal space-y-1 rounded-xl bg-warning-soft p-3 pl-8 text-sm text-warning-soft-foreground"
            >
              {hints.slice(0, visibleHints).map((hint, index) => (
                <li key={index}>{hint}</li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function speak(text: string) {
  if (typeof window === "undefined") return;
  const s = window.speechSynthesis;
  if (!s) return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  s.speak(u);
}

function ListenButton({ text, label = "🔊 Ouvir" }: { text: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => speak(text)}
      className="min-h-11 rounded-xl bg-purple-100 px-4 text-sm font-medium text-purple-800"
    >
      {label}
    </button>
  );
}

function MCView({
  q,
  disabled,
  onSubmit,
}: {
  q: MCQuestion;
  disabled: boolean;
  onSubmit: ActivityProps["onSubmit"];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <Stem
        text={
          q.enunciado ||
          (q.kind === "MICROSCENARIO"
            ? "Escolha a resposta mais adequada para a situação."
            : "Escolha a alternativa correta.")
        }
        translation={q.traducao}
        hints={q.hintsPtbr}
      />
      {(q.kind === "READING_MC" || q.kind === "MICROSCENARIO") && q.supportText && (
        <p className="rounded-xl bg-primary-soft p-3 text-sm text-primary-soft-foreground">
          {q.supportText}
        </p>
      )}
      {q.kind === "LISTENING_MC" && q.audioText && (
        <ListenButton text={q.audioText} label="🔊 Ouvir novamente" />
      )}
      <div className="space-y-2">
        {q.options.map((opt) => {
          const active = selected === opt;
          return (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onClick={() => setSelected(opt)}
              className={`min-h-11 w-full rounded-2xl border px-4 py-3 text-left text-base transition ${
                active
                  ? "border-purple-500 bg-purple-50 text-purple-900"
                  : "border-slate-200 bg-white text-slate-800"
              } disabled:opacity-60`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      <SubmitBar
        disabled={disabled || !selected}
        onClick={() => selected && onSubmit({ text: selected })}
      />
    </div>
  );
}

function TFView({
  q,
  disabled,
  onSubmit,
}: {
  q: TFQuestion;
  disabled: boolean;
  onSubmit: ActivityProps["onSubmit"];
}) {
  return (
    <div className="space-y-4">
      <Stem
        text={q.enunciado || "Verdadeiro ou falso?"}
        translation={q.traducao}
        hints={q.hintsPtbr}
      />
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSubmit({ text: "True" })}
          className="min-h-14 rounded-2xl bg-emerald-500 text-lg font-semibold text-white disabled:opacity-60"
        >
          Verdadeiro
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSubmit({ text: "False" })}
          className="min-h-14 rounded-2xl bg-rose-500 text-lg font-semibold text-white disabled:opacity-60"
        >
          Falso
        </button>
      </div>
    </div>
  );
}

function FBView({
  q,
  disabled,
  onSubmit,
}: {
  q: FBQuestion;
  disabled: boolean;
  onSubmit: ActivityProps["onSubmit"];
}) {
  const [value, setValue] = useState("");
  return (
    <div className="space-y-4">
      <Stem
        text={q.enunciado || "Complete a lacuna."}
        translation={q.traducao}
        hints={q.hintsPtbr}
      />
      <input
        aria-label="Sua resposta"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        className="min-h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-base outline-none focus:border-purple-500"
        placeholder="Digite sua resposta"
        autoComplete="off"
        autoCapitalize="none"
      />
      {q.hintOptions && q.hintOptions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {q.hintOptions.map((h) => (
            <button
              key={h}
              type="button"
              disabled={disabled}
              onClick={() => setValue(h)}
              className="min-h-11 rounded-full border border-slate-200 bg-white px-3 text-sm"
            >
              {h}
            </button>
          ))}
        </div>
      )}
      <SubmitBar
        disabled={disabled || value.trim().length === 0}
        onClick={() => onSubmit({ text: value })}
      />
    </div>
  );
}

function OrderView({
  q,
  disabled,
  onSubmit,
}: {
  q: ORDERQuestion;
  disabled: boolean;
  onSubmit: ActivityProps["onSubmit"];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const remaining = q.shuffledBlocks.filter((b) => !selected.includes(b.id));
  const byId = new Map(q.availableBlocks.map((b) => [b.id, b.text]));
  const isDialogue = q.kind === "DIALOGUE_ORDER";
  return (
    <div className="space-y-4">
      <Stem
        text={
          q.enunciado ||
          (isDialogue
            ? "Coloque as falas na ordem correta."
            : "Coloque os blocos na ordem correta.")
        }
        translation={q.traducao}
        hints={q.hintsPtbr}
      />
      <div
        className={`min-h-16 rounded-2xl border-2 border-dashed border-purple-200 bg-white p-3 ${
          isDialogue ? "space-y-2" : ""
        }`}
        aria-label={isDialogue ? "Diálogo montado" : "Frase montada"}
      >
        {isDialogue ? (
          selected.map((id, i) => (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => setSelected((cur) => cur.filter((x) => x !== id))}
              className="block w-full rounded-xl bg-purple-100 px-3 py-2 text-left text-sm text-purple-900"
              aria-label={`Remover fala ${i + 1}`}
            >
              {byId.get(id)}
            </button>
          ))
        ) : (
          <div className="flex flex-wrap gap-2">
            {selected.map((id) => (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => setSelected((cur) => cur.filter((x) => x !== id))}
                className="min-h-11 rounded-xl bg-purple-100 px-3 text-purple-900"
                aria-label={`Remover ${byId.get(id)}`}
              >
                {byId.get(id)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div
        className={isDialogue ? "space-y-2" : "flex flex-wrap gap-2"}
        aria-label="Blocos disponíveis"
      >
        {remaining.map((b) =>
          isDialogue ? (
            <button
              key={b.id}
              type="button"
              disabled={disabled}
              onClick={() => setSelected((cur) => [...cur, b.id])}
              className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-900"
            >
              {b.text}
            </button>
          ) : (
            <button
              key={b.id}
              type="button"
              disabled={disabled}
              onClick={() => setSelected((cur) => [...cur, b.id])}
              className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-slate-900"
            >
              {b.text}
            </button>
          ),
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled || selected.length === 0}
          onClick={() => setSelected([])}
          className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm"
        >
          Limpar
        </button>
        <button
          type="button"
          disabled={disabled || selected.length !== q.availableBlocks.length}
          onClick={() => onSubmit({ selectedBlockIds: selected })}
          className="min-h-11 flex-1 rounded-2xl bg-purple-600 px-4 text-base font-semibold text-white disabled:opacity-60"
        >
          Verificar
        </button>
      </div>
    </div>
  );
}

function TextView({
  q,
  disabled,
  onSubmit,
}: {
  q: TextInputQuestion;
  disabled: boolean;
  onSubmit: ActivityProps["onSubmit"];
}) {
  const [value, setValue] = useState("");
  const stem =
    q.enunciado ||
    (q.kind === "DICTATION"
      ? "Escreva o que você ouvir."
      : q.kind === "CORRECTION"
        ? "Corrija a frase abaixo."
        : "Responda com uma frase curta.");
  const hints = q.hintsPtbr?.length ? q.hintsPtbr : fallbackTextHints(q, stem);
  return (
    <div className="space-y-4">
      <Stem text={stem} translation={q.traducao} hints={hints} />
      {q.kind === "DICTATION" && q.audioText && (
        <ListenButton text={q.audioText} label="🔊 Ouvir ditado" />
      )}
      {q.kind === "CORRECTION" && q.supportText && (
        <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900 line-through">
          {q.supportText}
        </p>
      )}
      <textarea
        aria-label="Sua resposta"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        rows={q.kind === "DICTATION" ? 2 : 3}
        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-purple-500"
        placeholder="Escreva aqui"
        autoComplete="off"
        autoCapitalize="none"
      />
      <SubmitBar
        disabled={disabled || value.trim().length === 0}
        onClick={() => onSubmit({ text: value })}
      />
    </div>
  );
}

function fallbackTextHints(q: TextInputQuestion, stem: string): string[] {
  if (q.kind === "DICTATION") {
    return [
      "Ouça mais de uma vez e escreva primeiro as palavras que você reconhecer.",
      "Revise nomes próprios, espaços e o final da frase antes de verificar.",
    ];
  }
  if (q.kind === "CORRECTION") {
    return [
      "Identifique primeiro qual parte da frase soa incompleta ou fora de ordem.",
      "Em perguntas, confira a posição do verbo auxiliar, do sujeito e do verbo principal.",
    ];
  }

  const loveMatch = stem.match(/^what does\s+(.+?)\s+love to do\b/i);
  if (loveMatch?.[1]) {
    return [
      `Comece a resposta com: “${loveMatch[1]} loves to…”`,
      "Complete a frase com a atividade mencionada no conteúdo da aula.",
    ];
  }

  const likeMatch = stem.match(/^what does\s+(.+?)\s+like to do\b/i);
  if (likeMatch?.[1]) {
    return [
      `Comece a resposta com: “${likeMatch[1]} likes to…”`,
      "Complete a frase com a atividade mencionada no conteúdo da aula.",
    ];
  }

  return ["Reutilize as palavras principais da pergunta para montar uma frase completa em inglês."];
}

function MatchingView({
  q,
  disabled,
  onSubmit,
}: {
  q: MatchingQuestion;
  disabled: boolean;
  onSubmit: ActivityProps["onSubmit"];
}) {
  const [matches, setMatches] = useState<Record<string, string>>({});
  const complete = q.pairs.every((pair) => Boolean(matches[pair.id]));
  return (
    <div className="space-y-4">
      <Stem
        text={q.enunciado || "Relacione cada item à resposta correta."}
        translation={q.traducao}
        hints={q.hintsPtbr}
      />
      <div className="space-y-3">
        {q.pairs.map((pair, index) => {
          const selectId = `matching-${q.id}-${index}`;
          return (
            <div key={pair.id} className="rounded-2xl border border-border bg-card p-3">
              <label
                htmlFor={selectId}
                className="mb-2 block text-sm font-semibold text-foreground"
              >
                {pair.left}
              </label>
              <select
                id={selectId}
                value={matches[pair.id] ?? ""}
                disabled={disabled}
                onChange={(event) =>
                  setMatches((current) => ({ ...current, [pair.id]: event.target.value }))
                }
                className="min-h-12 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Escolha uma opção</option>
                {q.shuffledAnswers.map((answer, answerIndex) => (
                  <option key={`${answer}-${answerIndex}`} value={answer}>
                    {answer}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      <SubmitBar disabled={disabled || !complete} onClick={() => onSubmit({ matches })} />
    </div>
  );
}

function ClassifyView({
  q,
  disabled,
  onSubmit,
}: {
  q: ClassifyQuestion;
  disabled: boolean;
  onSubmit: ActivityProps["onSubmit"];
}) {
  const [classifications, setClassifications] = useState<Record<string, string>>({});
  const complete = q.items.every((item) => Boolean(classifications[item.id]));
  return (
    <div className="space-y-4">
      <Stem
        text={q.enunciado || "Classifique cada item."}
        translation={q.traducao}
        hints={q.hintsPtbr}
      />
      <div className="space-y-3">
        {q.items.map((item, index) => {
          const selectId = `classify-${q.id}-${index}`;
          return (
            <div key={item.id} className="rounded-2xl border border-border bg-card p-3">
              <label
                htmlFor={selectId}
                className="mb-2 block text-sm font-semibold text-foreground"
              >
                {item.text}
              </label>
              <select
                id={selectId}
                value={classifications[item.id] ?? ""}
                disabled={disabled}
                onChange={(event) =>
                  setClassifications((current) => ({
                    ...current,
                    [item.id]: event.target.value,
                  }))
                }
                className="min-h-12 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Escolha uma categoria</option>
                {q.categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      <SubmitBar disabled={disabled || !complete} onClick={() => onSubmit({ classifications })} />
    </div>
  );
}

function SelfEvalView({
  q,
  disabled,
  onSubmit,
}: {
  q: SelfEvalQuestion;
  disabled: boolean;
  onSubmit: ActivityProps["onSubmit"];
}) {
  const [revealed, setRevealed] = useState(false);
  const [value, setValue] = useState("");
  const stem =
    q.enunciado ||
    (q.kind === "FLASHCARD" ? "Flashcard — pense na resposta." : "Reflita e escreva sua resposta.");
  const hints = q.hintsPtbr?.length
    ? q.hintsPtbr
    : q.kind === "OPEN"
      ? ["Escreva uma frase curta em inglês e depois compare com o modelo sugerido."]
      : [];
  const pronunciationTarget = findPronunciationTarget(stem);
  const frontIsDuplicate =
    q.frontText?.trim().toLocaleLowerCase() === q.enunciado.trim().toLocaleLowerCase();
  return (
    <div className="space-y-4">
      <Stem text={stem} translation={q.traducao} hints={hints} />
      {q.kind === "FLASHCARD" && !revealed && (
        <p className="rounded-xl bg-muted p-3 text-sm leading-relaxed text-muted-foreground">
          Pense na resposta antes de revelar. Depois compare com o modelo e escolha{" "}
          <span className="font-semibold text-foreground">Ainda não sei</span> ou{" "}
          <span className="font-semibold text-foreground">Já domino</span>.
        </p>
      )}
      {q.frontText && !frontIsDuplicate && (
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-800">{q.frontText}</p>
      )}
      {q.audioText && <ListenButton text={q.audioText} />}
      {!q.audioText && pronunciationTarget && (
        <ListenButton text={pronunciationTarget} label="🔊 Ouvir a palavra" />
      )}
      {q.kind === "OPEN" && !revealed && (
        <textarea
          aria-label="Sua resposta"
          value={value}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          rows={4}
          className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Escreva sua resposta em inglês"
          autoComplete="off"
          autoCapitalize="none"
        />
      )}
      {q.kind === "FLASHCARD" ? (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          {revealed ? (
            <AccessiblePronunciation text={q.canonicalAnswerText} />
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setRevealed(true)}
              className="min-h-12 w-full rounded-2xl bg-slate-900 text-base font-semibold text-white"
            >
              Mostrar resposta
            </button>
          )}
        </div>
      ) : (
        <>
          {!revealed ? (
            <button
              type="button"
              disabled={disabled || value.trim().length === 0}
              onClick={() => setRevealed(true)}
              className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white text-sm"
            >
              Ver resposta sugerida
            </button>
          ) : (
            <>
              <p className="rounded-xl bg-primary-soft p-3 text-sm text-primary-soft-foreground">
                <span className="font-semibold">Sua resposta:</span> {value}
              </p>
              {q.canonicalAnswerText && (
                <p className="rounded-xl bg-success-soft p-3 text-sm text-success-soft-foreground">
                  <span className="font-semibold">Modelo possível:</span> {q.canonicalAnswerText}
                </p>
              )}
            </>
          )}
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled || !revealed}
          onClick={() => onSubmit({ text: value, selfEval: "unknown" })}
          className="min-h-12 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-800"
        >
          Ainda não sei
        </button>
        <button
          type="button"
          disabled={disabled || !revealed}
          onClick={() => onSubmit({ text: value, selfEval: "know" })}
          className="min-h-12 rounded-2xl bg-emerald-600 text-sm font-semibold text-white"
        >
          Já domino
        </button>
      </div>
    </div>
  );
}

function SubmitBar({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-12 w-full rounded-2xl bg-purple-600 text-base font-semibold text-white disabled:opacity-60"
    >
      Verificar
    </button>
  );
}
