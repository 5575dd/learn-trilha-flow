import { getSupabase } from "@/lib/supabase";

export interface TutorMessage {
  role: "user" | "assistant";
  text: string;
}
export interface TutorRequest {
  action: "chat";
  requestId: string;
  message: string;
  history: TutorMessage[];
  lessonId?: number;
  questionId?: number;
  materialKey?: string;
}
export interface TutorResponse {
  answer: string;
  remaining: number;
  sources: { label: string; url: string }[];
}

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "Sua sessão expirou. Entre novamente para conversar com a Tucunaré.",
  not_configured: "A Tucunaré ainda está sendo preparada. Suas aulas continuam disponíveis.",
  daily_limit:
    "Você chegou às 30 perguntas de hoje. A cota renova diariamente pelo horário do Pacífico.",
  project_limit:
    "A capacidade gratuita da Tucunaré foi usada por hoje. Suas atividades continuam disponíveis.",
  minute_limit: "Aguarde um minuto antes da próxima pergunta.",
  lesson_processing:
    "Uma nova aula está sendo analisada. A Tucunaré vai aguardar para preservar a cota gratuita.",
  provider_limit: "O Google pediu uma pausa na cota gratuita. Tente novamente mais tarde.",
  context_unavailable:
    "Não consegui consultar essa aula ou atividade. Você pode perguntar sem o contexto.",
  incomplete_answer: "A resposta não ficou completa. Tente uma pergunta mais curta.",
  in_progress: "Sua pergunta ainda está sendo respondida. Aguarde alguns instantes.",
  previous_failed: "Essa tentativa não terminou. Tente novamente para enviar uma nova solicitação.",
};

export class TutorError extends Error {
  constructor(
    public code: string,
    public retryAfter = 0,
    public remaining?: number,
  ) {
    super(
      ERROR_MESSAGES[code] ?? "Não foi possível conversar agora. Tente novamente em instantes.",
    );
  }
}

async function invoke<T>(body: object): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke("tucunare", { body });
  if (error) {
    let details: { code?: string; retryAfter?: number; remaining?: number } = {};
    if ("context" in error && error.context instanceof Response) {
      try {
        details = await error.context.clone().json();
      } catch {
        /* Never expose raw provider errors. */
      }
    }
    throw new TutorError(details.code ?? "network_error", details.retryAfter, details.remaining);
  }
  return data as T;
}

export async function askTucunare(request: TutorRequest): Promise<TutorResponse> {
  const result = await invoke<TutorResponse>(request);
  if (!result || typeof result.answer !== "string" || !result.answer.trim()) {
    throw new TutorError("incomplete_answer");
  }
  return {
    ...result,
    sources: (Array.isArray(result.sources) ? result.sources : []).filter(
      (source) =>
        typeof source?.label === "string" &&
        /^(?:https:\/\/learn-trilha-flow\.lovable\.app\/aulas\/\d+|https:\/\/lms-wo\.com\/mod\/url\/view\.php\?id=11202|https:\/\/view\.genially\.com\/[a-f0-9]{24})$/.test(
          source.url,
        ),
    ),
  };
}

export function getTucunareStatus(): Promise<{ remaining: number; limit: number }> {
  return invoke({ action: "status" });
}
