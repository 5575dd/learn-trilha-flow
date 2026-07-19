import { useState } from "react";
import type {
  ValidQuestion,
  MCQuestion,
  TFQuestion,
  FBQuestion,
  ORDERQuestion,
  TextInputQuestion,
  SelfEvalQuestion,
} from "@/domain/questions/questionTypes";

export interface ActivityProps {
  question: ValidQuestion;
  disabled: boolean;
  onSubmit: (input: {
    text?: string;
    selectedBlockIds?: string[];
    selfEval?: "know" | "unknown" | "skip";
  }) => void;
}

export function Activity({ question, disabled, onSubmit }: ActivityProps) {
  switch (question.kind) {
    case "MC":
    case "READING_MC":
    case "LISTENING_MC":
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
    case "FLASHCARD":
    case "OPEN":
    case "MICROSCENARIO":
      return <SelfEvalView q={question} disabled={disabled} onSubmit={onSubmit} />;
  }
}

function Stem({ text }: { text: string }) {
  return <h2 className="text-lg font-semibold leading-snug text-slate-900">{text}</h2>;
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
      <Stem text={q.enunciado || "Escolha a alternativa correta."} />
      {q.kind === "READING_MC" && q.supportText && (
        <p className="rounded-xl bg-purple-50 p-3 text-sm text-slate-700">{q.supportText}</p>
      )}
      {q.kind === "LISTENING_MC" && q.audioText && <ListenButton text={q.audioText} label="🔊 Ouvir novamente" />}
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
      <Stem text={q.enunciado || "Verdadeiro ou falso?"} />
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
      <Stem text={q.enunciado || "Complete a lacuna."} />
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
          (isDialogue ? "Coloque as falas na ordem correta." : "Coloque os blocos na ordem correta.")
        }
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
      <div className={isDialogue ? "space-y-2" : "flex flex-wrap gap-2"} aria-label="Blocos disponíveis">
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
  return (
    <div className="space-y-4">
      <Stem text={stem} />
      {q.kind === "DICTATION" && q.audioText && <ListenButton text={q.audioText} label="🔊 Ouvir ditado" />}
      {q.kind === "CORRECTION" && q.supportText && (
        <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900 line-through">{q.supportText}</p>
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
  const stem =
    q.enunciado ||
    (q.kind === "FLASHCARD"
      ? "Flashcard — pense na resposta."
      : q.kind === "MICROSCENARIO"
        ? "Como você responderia neste cenário?"
        : "Reflita e escreva sua resposta.");
  return (
    <div className="space-y-4">
      <Stem text={stem} />
      {q.frontText && (
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-800">{q.frontText}</p>
      )}
      {q.audioText && <ListenButton text={q.audioText} />}
      {q.kind === "FLASHCARD" ? (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          {revealed ? (
            <p className="text-base text-slate-900">{q.canonicalAnswerText || "—"}</p>
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
          {!revealed && q.canonicalAnswerText ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setRevealed(true)}
              className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white text-sm"
            >
              Ver resposta sugerida
            </button>
          ) : q.canonicalAnswerText ? (
            <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
              {q.canonicalAnswerText}
            </p>
          ) : null}
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSubmit({ selfEval: "unknown" })}
          className="min-h-12 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-800"
        >
          Ainda não sei
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSubmit({ selfEval: "know" })}
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
