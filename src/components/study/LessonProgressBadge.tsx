import { CircleCheck, Clock3 } from "lucide-react";
import type { LessonProgress } from "@/domain/progress/lessonProgress";

export function LessonProgressBadge({
  progress,
  loading,
  error,
}: {
  progress: LessonProgress;
  loading?: boolean;
  error?: boolean;
}) {
  const completed = progress.status === "completed";
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold ${
        completed ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"
      }`}
    >
      {completed ? (
        <CircleCheck className="size-4 shrink-0" aria-hidden />
      ) : (
        <Clock3 className="size-4 shrink-0" aria-hidden />
      )}
      {loading
        ? "Carregando progresso…"
        : error
          ? "Progresso indisponível"
          : completed
            ? "Aula concluída"
            : progress.status === "in-progress"
              ? `Em andamento · ${progress.completedSessions}/${progress.totalSessions} sessões concluídas`
              : "Ainda não iniciada"}
    </span>
  );
}
