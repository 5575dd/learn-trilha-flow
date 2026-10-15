import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthContext";
import { listLessonQuestionIndex } from "@/data/queries";
import { hydrateManifestStore, manifestStore } from "@/data/manifestStore";
import { consolidatedAttemptReadService } from "@/data/repositories/ConsolidatedAttemptRepository";
import { buildDailyStudy, buildLessonProgress } from "@/domain/progress/lessonProgress";

export function useLearningProgress() {
  const { session } = useAuth();
  const userId = session?.user.id ?? "";
  const [, refresh] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => manifestStore.subscribe(userId, () => refresh((value) => value + 1)), [userId]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const index = useQuery({
    queryKey: ["lesson-question-index"],
    queryFn: listLessonQuestionIndex,
    enabled: !!userId,
  });
  const history = useQuery({
    queryKey: ["manifest-hydration", userId, "history"],
    queryFn: () => hydrateManifestStore(userId, { includeHistory: true }),
    enabled: !!userId,
  });
  const attempts = useQuery({
    queryKey: ["tentativas-consolidadas", userId],
    queryFn: () => consolidatedAttemptReadService.listByUser(userId),
    enabled: !!userId,
  });
  let manifests = history.data?.manifests ?? [];
  try {
    manifests = userId ? manifestStore.listByUser(userId) : [];
  } catch {
    // A remote snapshot remains useful when local storage is unavailable.
  }
  const entries = attempts.data?.entries ?? [];
  return {
    userId,
    manifests,
    entries,
    isLoading: !userId || index.isLoading || history.isLoading || attempts.isLoading,
    error: index.error || history.error || attempts.error,
    warning: [history.data?.error, attempts.data?.error].filter(Boolean).join(" "),
    localOnly: history.data?.localOnly || attempts.data?.localOnly || false,
    getLesson: (aulaId: number) =>
      buildLessonProgress(userId, aulaId, index.data ?? [], manifests, entries, now),
    daily: buildDailyStudy(userId, entries, now),
  };
}
