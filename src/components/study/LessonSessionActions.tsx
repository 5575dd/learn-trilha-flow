import { Link } from "@tanstack/react-router";
import { CircleCheck, Play, RotateCcw } from "lucide-react";
import type { LessonSessionProgress } from "@/domain/progress/lessonProgress";

const primary =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold leading-snug text-primary-foreground whitespace-normal break-words";
export function LessonSessionActions({
  aulaId,
  progress,
  loading = false,
  error = false,
  compact = false,
}: {
  aulaId: number;
  progress: LessonSessionProgress;
  loading?: boolean;
  error?: boolean;
  compact?: boolean;
}) {
  if (loading)
    return (
      <p role="status" className="mt-3 text-sm text-muted-foreground">
        Carregando seu progresso…
      </p>
    );
  if (error)
    return (
      <p role="alert" className="mt-3 text-sm text-destructive">
        Não foi possível confirmar seu progresso. Tente novamente antes de iniciar.
      </p>
    );
  const complete = progress.completedManifest;
  const active = progress.activeManifest;
  return (
    <div className="mt-3 space-y-2">
      {complete && (
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <CircleCheck className="size-4 shrink-0" aria-hidden />
          Sessão concluída
          {complete.completedAt && (
            <time
              className="ml-auto text-xs font-normal"
              dateTime={new Date(complete.completedAt).toISOString()}
            >
              {new Intl.DateTimeFormat("pt-BR", {
                timeZone: "America/Sao_Paulo",
                day: "2-digit",
                month: "2-digit",
              }).format(complete.completedAt)}
            </time>
          )}
        </p>
      )}
      {active ? (
        <Link to="/sessao" search={{ m: active.id }} className={primary}>
          <Play className="size-4 shrink-0" aria-hidden />
          Continuar sessão {progress.session}
        </Link>
      ) : complete ? (
        <Link to="/sessao/resultado" search={{ m: complete.id }} className={primary}>
          Ver resultado da sessão {progress.session}
        </Link>
      ) : (
        <Link
          to="/aulas/$id/estudar"
          params={{ id: String(aulaId) }}
          search={{ sessao: String(progress.session) }}
          className={primary}
        >
          <Play className="size-4 shrink-0" aria-hidden />
          Começar sessão {progress.session}
        </Link>
      )}
      {((complete && !compact) || active) && (
        <p className="text-xs text-muted-foreground">
          {complete
            ? `${progress.total} atividades · concluída`
            : `${Math.min(active?.currentIndex ?? 0, progress.total)} de ${progress.total} atividades percorridas`}
        </p>
      )}
      {complete && progress.available && (
        <Link
          to="/aulas/$id/estudar"
          params={{ id: String(aulaId) }}
          search={{ sessao: String(progress.session), restart: "1" }}
          className="inline-flex min-h-11 items-center gap-2 px-2 text-sm font-semibold text-primary"
        >
          <RotateCcw className="size-4 shrink-0" aria-hidden />
          Praticar novamente
        </Link>
      )}
    </div>
  );
}
