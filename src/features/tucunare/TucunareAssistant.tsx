import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Fish, Send, RotateCcw, LoaderCircle, Sparkles, BookOpen, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { useAuth } from "@/auth/AuthContext";
import { useTucunareContext } from "./TucunareContext";
import {
  askTucunare,
  getTucunareStatus,
  TutorError,
  type TutorMessage,
  type TutorRequest,
} from "./tucunareClient";
import {
  clampTutorPosition,
  defaultTutorPosition,
  restoreTutorPosition,
  serializeTutorPosition,
  type TutorPosition,
} from "./tucunarePosition";

const POSITION_KEY = "trilha:tucunare:position:v1";
type Message = TutorMessage & { sources?: { label: string; url: string }[] };
const storageKey = (userId: string) => `trilha:tucunare:conversation:v1:${userId}`;

function loadMessages(userId: string): Message[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey(userId)) ?? "null");
    if (!saved || Date.now() - saved.updatedAt > 12 * 60 * 60 * 1000) return [];
    return Array.isArray(saved.messages)
      ? saved.messages
          .slice(-20)
          .filter(
            (item: Message) =>
              (item.role === "user" || item.role === "assistant") && typeof item.text === "string",
          )
          .map((item: Message) => ({ role: item.role, text: item.text.slice(0, 10_000) }))
      : [];
  } catch {
    return [];
  }
}

export function TucunareAssistant() {
  const { session, loading: authLoading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const context = useTucunareContext();
  const userId = session?.user.id;
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TutorPosition | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationOwner, setConversationOwner] = useState<string | undefined>();
  const [draft, setDraft] = useState("");
  const [materialKey, setMaterialKey] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<TutorError | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const lastRequest = useRef<TutorRequest | null>(null);
  const sendingRef = useRef(false);
  const epoch = useRef(0);
  const drag = useRef<{ x: number; y: number; start: TutorPosition; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const resize = () =>
      setPosition((current) => {
        if (current)
          return clampTutorPosition(
            current,
            window.innerWidth,
            window.visualViewport?.height ?? window.innerHeight,
          );
        let raw = null;
        try {
          raw = localStorage.getItem(POSITION_KEY);
        } catch {
          /* Optional position persistence. */
        }
        return restoreTutorPosition(raw, window.innerWidth, window.innerHeight);
      });
    resize();
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    epoch.current += 1;
    setOpen(false);
    setMessages(userId ? loadMessages(userId) : []);
    setConversationOwner(userId);
    setDraft("");
    setError(null);
    setRemaining(null);
    setRetryAt(0);
    setSending(false);
    setMaterialKey(undefined);
    sendingRef.current = false;
    lastRequest.current = null;
  }, [userId]);

  useEffect(() => {
    setMaterialKey(undefined);
  }, [pathname, context?.study?.lessonId]);
  useEffect(() => {
    if (!context?.practice || !userId || sendingRef.current) return;
    setMaterialKey(context.practice.materialKey);
    setDraft(context.practice.message);
    setError(null);
    setOpen(true);
    context.setPractice(null);
  }, [context, userId, sending]);

  useEffect(() => {
    if (!open || !userId) return;
    let active = true;
    void getTucunareStatus()
      .then((status) => {
        if (active) setRemaining(status.remaining);
      })
      .catch((failure) => {
        if (active)
          setError(failure instanceof TutorError ? failure : new TutorError("network_error"));
      });
    return () => {
      active = false;
    };
  }, [open, userId]);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end", behavior: "smooth" });
  }, [messages, sending, open]);

  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      setClock(Date.now());
      if (Date.now() >= retryAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  function persistPosition(next: TutorPosition) {
    try {
      localStorage.setItem(
        POSITION_KEY,
        serializeTutorPosition(next, window.innerWidth, window.innerHeight),
      );
    } catch {
      /* Moving still works with storage disabled. */
    }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!position || event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, start: position, moved: false };
    suppressClick.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.x,
      dy = event.clientY - state.y;
    if (Math.hypot(dx, dy) > 6) state.moved = true;
    if (state.moved)
      setPosition(
        clampTutorPosition(
          { x: state.start.x + dx, y: state.start.y + dy },
          window.innerWidth,
          window.visualViewport?.height ?? window.innerHeight,
        ),
      );
  }

  function finishDrag() {
    if (drag.current?.moved) {
      suppressClick.current = true;
      if (position) persistPosition(position);
    }
    drag.current = null;
  }

  function saveConversation(next: Message[]) {
    if (!userId) return;
    try {
      sessionStorage.setItem(
        storageKey(userId),
        JSON.stringify({ updatedAt: Date.now(), messages: next.slice(-20) }),
      );
    } catch {
      /* The current conversation remains usable without persistence. */
    }
  }

  async function run(request: TutorRequest, conversation: Message[]) {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    lastRequest.current = request;
    const currentEpoch = epoch.current;
    try {
      const result = await askTucunare(request);
      if (currentEpoch !== epoch.current) return;
      const next = [
        ...conversation,
        { role: "assistant" as const, text: result.answer, sources: result.sources },
      ].slice(-20);
      setMessages(next);
      saveConversation(next);
      setRemaining(result.remaining);
      setRetryAt(0);
    } catch (failure) {
      if (currentEpoch !== epoch.current) return;
      const problem = failure instanceof TutorError ? failure : new TutorError("network_error");
      setError(problem);
      if (typeof problem.remaining === "number") setRemaining(problem.remaining);
      if (problem.retryAfter) {
        setRetryAt(Date.now() + problem.retryAfter * 1000);
        setClock(Date.now());
      }
    } finally {
      if (currentEpoch === epoch.current) {
        sendingRef.current = false;
        setSending(false);
      }
    }
  }

  function send(text = draft) {
    const message = text.trim();
    if (
      !message ||
      message.length > 1200 ||
      sendingRef.current ||
      retryAt > Date.now() ||
      remaining === 0
    )
      return;
    const fromRoute = /^\/aulas\/(\d+)(?:\/|$)/.exec(pathname);
    const study = context?.study ?? (fromRoute ? { lessonId: Number(fromRoute[1]) } : {});
    const request: TutorRequest = {
      action: "chat",
      requestId: crypto.randomUUID(),
      message,
      history: messages.slice(-6).map(({ role, text: value }) => ({ role, text: value })),
      ...study,
      ...(materialKey ? { materialKey } : {}),
    };
    const next = [...messages, { role: "user" as const, text: message }].slice(-20);
    setMessages(next);
    saveConversation(next);
    setDraft("");
    void run(request, next);
  }

  function retry() {
    const request = lastRequest.current;
    if (!request || sendingRef.current || retryAt > Date.now()) return;
    const reuse = ["network_error", "in_progress"].includes(error?.code ?? "");
    void run({ ...request, requestId: reuse ? request.requestId : crypto.randomUUID() }, messages);
  }

  if (
    !userId ||
    session?.user.is_anonymous ||
    conversationOwner !== userId ||
    authLoading ||
    !position ||
    pathname === "/login"
  )
    return null;
  const waiting = retryAt > clock;
  const lessonActive = Boolean(context?.study?.lessonId || /^\/aulas\/\d+/.test(pathname));

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <button
        ref={trigger}
        type="button"
        aria-label="Conversar com Tucunaré"
        title="Tucunaré"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby="tucunare-move-help"
        className="fixed z-40 grid h-[52px] w-[52px] touch-none select-none place-items-center rounded-full border-2 border-white bg-emerald-800 text-amber-200 shadow-lg outline-none focus-visible:ring-4 focus-visible:ring-emerald-300"
        style={{ left: position.x, top: position.y, visibility: open ? "hidden" : "visible" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onClick={(event) => {
          if (suppressClick.current) {
            event.preventDefault();
            suppressClick.current = false;
          } else setOpen(true);
        }}
        onKeyDown={(event) => {
          const delta: Record<string, [number, number]> = {
            ArrowLeft: [-16, 0],
            ArrowRight: [16, 0],
            ArrowUp: [0, -16],
            ArrowDown: [0, 16],
          };
          if (event.key === "Home" || delta[event.key]) {
            event.preventDefault();
            const next =
              event.key === "Home"
                ? defaultTutorPosition(window.innerWidth, window.innerHeight)
                : clampTutorPosition(
                    { x: position.x + delta[event.key][0], y: position.y + delta[event.key][1] },
                    window.innerWidth,
                    window.innerHeight,
                  );
            setPosition(next);
            persistPosition(next);
          }
        }}
      >
        <Fish className="h-7 w-7" aria-hidden />
      </button>
      <span id="tucunare-move-help" className="sr-only">
        Arraste para mover. Com foco no botão, use as setas; Home restaura a posição.
      </span>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <Dialog.Content
          aria-describedby="tucunare-description"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
          className="fixed bottom-[max(12px,env(safe-area-inset-bottom))] right-3 z-50 flex w-[calc(100vw-24px)] max-w-[420px] flex-col overflow-hidden rounded-lg border border-border bg-card text-foreground shadow-xl outline-none"
          style={{ height: "min(640px, calc(100dvh - 24px))" }}
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-border bg-emerald-900 px-4 py-3 text-white">
            <Fish className="h-7 w-7 shrink-0 text-amber-200" aria-hidden />
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-semibold">Tucunaré</Dialog.Title>
              <p className="text-xs text-emerald-100">
                {materialKey
                  ? `Módulo 2 · Unidade ${materialKey.at(-4)} · Lição ${materialKey.at(-1)}`
                  : lessonActive
                    ? "Aula em contexto"
                    : "Inglês, no seu ritmo"}
              </p>
            </div>
            <button
              type="button"
              title="Nova conversa"
              aria-label="Nova conversa"
              disabled={sending || messages.length === 0}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md hover:bg-white/10 disabled:opacity-40"
              onClick={() => {
                setMessages([]);
                setError(null);
                setMaterialKey(undefined);
                lastRequest.current = null;
                try {
                  sessionStorage.removeItem(storageKey(userId));
                } catch {
                  /* Optional storage. */
                }
              }}
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
            </button>
            <Dialog.Close
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md hover:bg-white/10"
              aria-label="Fechar Tucunaré"
              title="Fechar"
            >
              <X className="h-5 w-5" aria-hidden />
            </Dialog.Close>
          </header>
          <Dialog.Description id="tucunare-description" className="sr-only">
            Conversa com a assistente de inglês Tucunaré.
          </Dialog.Description>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
            role="log"
            aria-label="Conversa com Tucunaré"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.length === 0 && (
              <div className="space-y-4 text-sm">
                <p>Olá! Sou a Tucunaré. Qual é a sua dúvida de inglês?</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-left disabled:opacity-50"
                    disabled={sending || waiting || remaining === 0}
                    onClick={() =>
                      send(
                        lessonActive
                          ? "Explique o principal conceito desta aula com um exemplo simples."
                          : "Qual e a diferenca entre do e does? De um exemplo de cada.",
                      )
                    }
                  >
                    <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
                    {lessonActive ? "Explicar a aula" : "Do ou does?"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-left disabled:opacity-50"
                    disabled={sending || waiting || remaining === 0}
                    onClick={() =>
                      send(
                        "Proponha uma situacao curta da vida real para eu praticar ingles. Use esta aula se houver contexto e espere minha resposta.",
                      )
                    }
                  >
                    <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
                    Praticar uma situação
                  </button>
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <article
                key={index}
                className={`mb-4 min-w-0 text-sm ${message.role === "user" ? "ml-6 rounded-lg bg-muted p-3" : "mr-2"}`}
              >
                <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                  {message.role === "user" ? "Você" : "Tucunaré"}
                </p>
                <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
                  {message.text}
                </p>
                {message.sources?.map((source) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block break-words text-xs text-primary underline"
                  >
                    {source.label}
                  </a>
                ))}
              </article>
            ))}
            {sending && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                Tucunaré está pensando...
              </p>
            )}
            <div ref={end} />
          </div>
          {error && (
            <div
              role="alert"
              className="shrink-0 border-t border-border bg-amber-50 px-4 py-3 text-sm text-amber-950"
            >
              <p>{error.message}</p>
              {lastRequest.current && (
                <button
                  type="button"
                  disabled={sending || waiting || remaining === 0}
                  onClick={retry}
                  className="mt-2 inline-flex min-h-9 items-center gap-2 font-medium underline disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  Tentar novamente
                </button>
              )}
            </div>
          )}
          <form
            className="shrink-0 space-y-2 border-t border-border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <div className="flex items-end gap-2">
              <label className="sr-only" htmlFor="tucunare-message">
                Sua pergunta para Tucunaré
              </label>
              <textarea
                id="tucunare-message"
                value={draft}
                maxLength={1200}
                rows={2}
                disabled={sending}
                className="min-h-12 max-h-28 min-w-0 flex-1 resize-y rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus:ring-2 focus:ring-primary"
                placeholder="Qual é a sua dúvida?"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    send();
                  }
                }}
              />
              <button
                type="submit"
                aria-label="Enviar pergunta"
                title="Enviar"
                disabled={sending || waiting || !draft.trim() || remaining === 0}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-emerald-800 text-white hover:bg-emerald-900 disabled:opacity-40"
              >
                <Send className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="flex min-w-0 items-start justify-between gap-3 text-[10px] leading-relaxed text-muted-foreground">
              <p className="min-w-0">Google Gemini. Não envie dados pessoais. A IA pode errar.</p>
              <p className="shrink-0">{remaining === null ? "" : `${remaining}/30 hoje`}</p>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
