import type { ValidQuestion } from "@/domain/questions/questionTypes";

export const LESSON_SESSION_INFO = {
  1: {
    title: "Compreender e reconhecer",
    description: "Relembre a aula com mais contexto, opções e apoio.",
  },
  2: {
    title: "Aplicar e aprofundar",
    description: "Forme respostas, corrija erros e conecte os conceitos.",
  },
  3: {
    title: "Recuperar e usar",
    description: "Pratique lembrança ativa e use o conteúdo em novas situações.",
  },
} as const;

export type LessonSessionNumber = keyof typeof LESSON_SESSION_INFO;

export interface LessonSessionGroup {
  session: LessonSessionNumber;
  title: string;
  description: string;
  questions: ValidQuestion[];
  releaseAt?: string;
  available: boolean;
}

export function isLessonSessionNumber(value: number): value is LessonSessionNumber {
  return value === 1 || value === 2 || value === 3;
}

export function releaseTimestamp(value?: string): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isQuestionReleased(question: ValidQuestion, now = Date.now()): boolean {
  const release = releaseTimestamp(question.releaseAt);
  return release === null || release <= now;
}

export function groupLessonSessions(
  questions: readonly ValidQuestion[],
  now = Date.now(),
): LessonSessionGroup[] {
  return ([1, 2, 3] as const).map((session) => {
    const sessionQuestions = questions
      .filter((question) => question.sessao === session)
      .sort((left, right) => left.ordem - right.ordem || left.id - right.id);
    const releases = sessionQuestions
      .map((question) => question.releaseAt)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => (releaseTimestamp(left) ?? 0) - (releaseTimestamp(right) ?? 0));
    const releaseAt = releases[0];
    return {
      session,
      ...LESSON_SESSION_INFO[session],
      questions: sessionQuestions,
      releaseAt,
      available:
        sessionQuestions.length > 0 &&
        sessionQuestions.every((question) => isQuestionReleased(question, now)),
    };
  });
}

export function formatReleaseDate(value?: string): string {
  const timestamp = releaseTimestamp(value);
  if (timestamp === null) return "Disponível agora";
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}
