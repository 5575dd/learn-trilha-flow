import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import {
  flushAttemptSyncQueue,
  registerAttemptOnlineFlush,
} from "@/data/repositories/DualAttemptRepository";
import { flushManifestSyncQueue, registerManifestOnlineFlush } from "@/data/manifestStore";
import { attemptSyncQueue, type SyncQueueItem } from "@/data/sync/syncQueue";
import { manifestSyncQueue, type ManifestSyncItem } from "@/data/sync/manifestSyncQueue";
import { deriveSyncDisplayState, SYNC_DISPLAY_LABELS } from "@/data/sync/syncStatus";
import { WRITES_ENABLED } from "@/lib/supabase";

export function SyncStatusIndicator() {
  const { session } = useAuth();
  const userId = session?.user.id ?? "";
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [items, setItems] = useState<SyncQueueItem[]>([]);
  const [manifestItems, setManifestItems] = useState<ManifestSyncItem[]>([]);
  const [persistenceFailure, setPersistenceFailure] = useState(false);
  const [manifestPersistenceFailure, setManifestPersistenceFailure] = useState(false);

  const refresh = useCallback(() => {
    if (!userId || !WRITES_ENABLED) {
      setItems([]);
      setManifestItems([]);
      setPersistenceFailure(false);
      setManifestPersistenceFailure(false);
      return;
    }
    try {
      setItems(attemptSyncQueue.list(userId));
      setManifestItems(manifestSyncQueue.list(userId));
      setPersistenceFailure(attemptSyncQueue.hasPersistenceFailure(userId));
      setManifestPersistenceFailure(manifestSyncQueue.hasPersistenceFailure(userId));
    } catch {
      setPersistenceFailure(true);
      setManifestPersistenceFailure(true);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
    if (!userId || !WRITES_ENABLED || typeof window === "undefined") return;
    const unsubscribeAttempts = attemptSyncQueue.subscribe(userId, refresh);
    const unsubscribeManifests = manifestSyncQueue.subscribe(userId, refresh);
    const unregisterAttemptOnline = registerAttemptOnlineFlush(userId);
    const unregisterManifestOnline = registerManifestOnlineFlush(userId);
    const handleOnline = () => {
      setOnline(true);
      void retryBoth(userId);
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if (navigator.onLine) void retryBoth(userId, false);
    return () => {
      unsubscribeAttempts();
      unsubscribeManifests();
      unregisterAttemptOnline();
      unregisterManifestOnline();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refresh, userId]);

  const state = deriveSyncDisplayState({
    writesEnabled: WRITES_ENABLED,
    online,
    items,
    manifestItems,
    persistenceFailure,
    manifestPersistenceFailure,
  });

  const dotTone =
    state === "failed"
      ? "bg-destructive"
      : state === "synced"
        ? "bg-success"
        : state === "local"
          ? "bg-muted-foreground"
          : "bg-warning";

  return (
    <div
      role="status"
      className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2 text-xs shadow-card"
    >
      <div className="min-w-0">
        <span className="flex min-w-0 items-center gap-2 font-medium">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dotTone}`} aria-hidden />
          <span className="truncate">{SYNC_DISPLAY_LABELS[state]}</span>
        </span>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          Tentativas: {queueLabel(items, persistenceFailure)} · Sessões:{" "}
          {queueLabel(manifestItems, manifestPersistenceFailure)}
        </p>
      </div>
      {state === "failed" && userId && (
        <button
          type="button"
          className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-2 font-semibold text-primary"
          onClick={() => void retryBoth(userId)}
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}

async function retryBoth(userId: string, force = true): Promise<void> {
  await Promise.all([flushAttemptSyncQueue(userId, force), flushManifestSyncQueue(userId, force)]);
}

function queueLabel(items: readonly { status: string }[], persistenceFailure: boolean): string {
  if (!WRITES_ENABLED) return "local";
  if (persistenceFailure || items.some((item) => item.status === "failed")) return "falha";
  if (items.length > 0) return "pendente";
  return "ok";
}
